const pool = require('../db/pool');

async function getAllVenueBookings() {
  const result = await pool.query(
    `SELECT * FROM venue_bookings ORDER BY event_date DESC`
  );
  return result.rows;
}

async function getVenueBookingById(id) {
  const result = await pool.query(
    `SELECT * FROM venue_bookings WHERE id = $1`, [id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Venue booking not found.' };
  return result.rows[0];
}

async function createVenueBooking(data, userId) {
  const { clientName, contact, venueType, eventType, eventDate, eventTime, guests, amount, payment, notes } = data;
  const result = await pool.query(
    `INSERT INTO venue_bookings
       (client_name, contact, venue_type, event_type, event_date, event_time, guests, amount, payment, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [clientName, contact, venueType, eventType, eventDate, eventTime, guests, amount, payment, notes, userId]
  );
  return result.rows[0];
}

async function updateVenueBooking(id, data) {
  const { clientName, contact, venueType, eventType, eventDate, eventTime, guests, amount, payment, notes } = data;
  const result = await pool.query(
    `UPDATE venue_bookings SET
       client_name = COALESCE($1, client_name),
       contact     = COALESCE($2, contact),
       venue_type  = COALESCE($3, venue_type),
       event_type  = COALESCE($4, event_type),
       event_date  = COALESCE($5, event_date),
       event_time  = COALESCE($6, event_time),
       guests      = COALESCE($7, guests),
       amount      = COALESCE($8, amount),
       payment     = COALESCE($9, payment),
       notes       = COALESCE($10, notes)
     WHERE id = $11
     RETURNING *`,
    [clientName, contact, venueType, eventType, eventDate, eventTime, guests, amount, payment, notes, id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Venue booking not found.' };
  return result.rows[0];
}

async function deleteVenueBooking(id) {
  const result = await pool.query(
    `DELETE FROM venue_bookings WHERE id = $1 RETURNING id`, [id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Venue booking not found.' };
}

module.exports = { getAllVenueBookings, getVenueBookingById, createVenueBooking, updateVenueBooking, deleteVenueBooking };
