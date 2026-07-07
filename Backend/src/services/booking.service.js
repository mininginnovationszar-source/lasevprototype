const pool = require('../db/pool');

async function ensureBookingAttachmentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_attachments (
      id           SERIAL PRIMARY KEY,
      booking_id   INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      file_name    VARCHAR(255) NOT NULL,
      content_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
      file_size    INT NOT NULL,
      file_data    BYTEA NOT NULL,
      uploaded_by  INT REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking ON booking_attachments(booking_id)`);
}

// Check if a room is free for the requested dates (excluding a booking id for edits)
async function isRoomAvailable(roomId, checkIn, checkOut, excludeBookingId = null) {
  const result = await pool.query(
    `SELECT id FROM bookings
     WHERE room_id = $1
       AND payment  != 'Cancelled'
       AND check_in  < $3
       AND check_out > $2
       AND ($4::int IS NULL OR id != $4)`,
    [roomId, checkIn, checkOut, excludeBookingId]
  );
  return result.rows.length === 0;
}

async function getAllBookings() {
  await ensureBookingAttachmentsTable();
  const result = await pool.query(
    `SELECT b.*, r.number AS room_number, r.type AS room_type,
            COALESCE(a.attachment_count, 0)::int AS attachment_count
     FROM bookings b
     JOIN rooms r ON b.room_id = r.id
     LEFT JOIN (
       SELECT booking_id, COUNT(*) AS attachment_count
       FROM booking_attachments
       GROUP BY booking_id
     ) a ON a.booking_id = b.id
     ORDER BY b.check_in DESC`
  );
  return result.rows;
}

async function getBookingById(id) {
  await ensureBookingAttachmentsTable();
  const result = await pool.query(
    `SELECT b.*, r.number AS room_number, r.type AS room_type,
            COALESCE(a.attachment_count, 0)::int AS attachment_count
     FROM bookings b
     JOIN rooms r ON b.room_id = r.id
     LEFT JOIN (
       SELECT booking_id, COUNT(*) AS attachment_count
       FROM booking_attachments
       GROUP BY booking_id
     ) a ON a.booking_id = b.id
     WHERE b.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Booking not found.' };
  return result.rows[0];
}

async function createBooking({ customerName, contact, roomId, checkIn, checkOut, payment, notes }, userId) {
  const available = await isRoomAvailable(roomId, checkIn, checkOut);
  if (!available) {
    throw { status: 409, message: 'Room is not available for the selected dates.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `INSERT INTO bookings (customer_name, contact, room_id, check_in, check_out, payment, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [customerName, contact, roomId, checkIn, checkOut, payment, notes, userId]
    );

    // Mark room as booked
    await client.query(
      `UPDATE rooms SET status = 'booked' WHERE id = $1`, [roomId]
    );

    await client.query('COMMIT');
    return bookingResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateBooking(id, fields, userId) {
  const { customerName, contact, roomId, checkIn, checkOut, payment, notes } = fields;

  if (roomId && checkIn && checkOut) {
    const available = await isRoomAvailable(roomId, checkIn, checkOut, id);
    if (!available) {
      throw { status: 409, message: 'Room is not available for the selected dates.' };
    }
  }

  const result = await pool.query(
    `UPDATE bookings
     SET customer_name = COALESCE($1, customer_name),
         contact       = COALESCE($2, contact),
         room_id       = COALESCE($3, room_id),
         check_in      = COALESCE($4, check_in),
         check_out     = COALESCE($5, check_out),
         payment       = COALESCE($6, payment),
         notes         = COALESCE($7, notes)
     WHERE id = $8
     RETURNING *`,
    [customerName, contact, roomId, checkIn, checkOut, payment, notes, id]
  );

  if (!result.rows[0]) throw { status: 404, message: 'Booking not found.' };
  return result.rows[0];
}

async function deleteBooking(id) {
  const result = await pool.query(
    `DELETE FROM bookings WHERE id = $1 RETURNING room_id`, [id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Booking not found.' };

  // Free up the room if no other active bookings
  const roomId = result.rows[0].room_id;
  const remaining = await pool.query(
    `SELECT id FROM bookings WHERE room_id = $1 AND payment != 'Cancelled'`, [roomId]
  );
  if (remaining.rows.length === 0) {
    await pool.query(`UPDATE rooms SET status = 'available' WHERE id = $1`, [roomId]);
  }
}

function sanitizePdfName(name) {
  const clean = String(name || 'quotation.pdf').replace(/[/\\?%*:|"<>]/g, '-').trim();
  return /\.pdf$/i.test(clean) ? clean : `${clean || 'quotation'}.pdf`;
}

async function listBookingAttachments(bookingId) {
  await ensureBookingAttachmentsTable();
  await getBookingById(bookingId);
  const result = await pool.query(
    `SELECT id, booking_id, file_name, content_type, file_size, uploaded_by, uploaded_at
     FROM booking_attachments
     WHERE booking_id = $1
     ORDER BY uploaded_at DESC`,
    [bookingId]
  );
  return result.rows;
}

async function addBookingAttachment(bookingId, { fileName, contentType, data }, userId) {
  await ensureBookingAttachmentsTable();
  await getBookingById(bookingId);
  const normalizedContentType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (normalizedContentType !== 'application/pdf') {
    throw { status: 415, message: 'Only PDF quotation attachments are allowed.' };
  }
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw { status: 400, message: 'PDF file is required.' };
  }
  if (data.subarray(0, 4).toString('utf8') !== '%PDF') {
    throw { status: 415, message: 'The uploaded file is not a valid PDF.' };
  }
  if (data.length > 10 * 1024 * 1024) {
    throw { status: 413, message: 'PDF must be 10MB or smaller.' };
  }
  const result = await pool.query(
    `INSERT INTO booking_attachments (booking_id, file_name, content_type, file_size, file_data, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, booking_id, file_name, content_type, file_size, uploaded_by, uploaded_at`,
    [bookingId, sanitizePdfName(fileName), 'application/pdf', data.length, data, userId]
  );
  return result.rows[0];
}

async function getBookingAttachment(bookingId, attachmentId) {
  await ensureBookingAttachmentsTable();
  const result = await pool.query(
    `SELECT id, booking_id, file_name, content_type, file_size, file_data, uploaded_at
     FROM booking_attachments
     WHERE booking_id = $1 AND id = $2`,
    [bookingId, attachmentId]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Attachment not found.' };
  return result.rows[0];
}

async function deleteBookingAttachment(bookingId, attachmentId) {
  await ensureBookingAttachmentsTable();
  const result = await pool.query(
    `DELETE FROM booking_attachments
     WHERE booking_id = $1 AND id = $2
     RETURNING file_name`,
    [bookingId, attachmentId]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Attachment not found.' };
  return result.rows[0];
}

module.exports = {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  listBookingAttachments,
  addBookingAttachment,
  getBookingAttachment,
  deleteBookingAttachment,
};
