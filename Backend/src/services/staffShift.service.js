const pool = require('../db/pool');

async function getAllStaff() {
  const result = await pool.query(`SELECT * FROM staff WHERE status = 'active' ORDER BY name ASC`);
  return result.rows;
}

async function createStaff({ name, department }) {
  const result = await pool.query(
    `INSERT INTO staff (name, department) VALUES ($1, $2) RETURNING *`,
    [name, department]
  );
  return result.rows[0];
}

async function updateStaff(id, { name, department, status }) {
  const result = await pool.query(
    `UPDATE staff SET
       name       = COALESCE($1, name),
       department = COALESCE($2, department),
       status     = COALESCE($3, status)
     WHERE id = $4 RETURNING *`,
    [name, department, status, id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Staff not found.' };
  return result.rows[0];
}

async function deleteStaff(id) {
  const result = await pool.query(`DELETE FROM staff WHERE id = $1 RETURNING *`, [id]);
  if (!result.rows[0]) throw { status: 404, message: 'Staff not found.' };
  return result.rows[0];
}

// ── Shifts ────────────────────────────────────────────────────

async function getShiftsForDate(date) {
  const result = await pool.query(
    `SELECT s.*, st.name AS staff_name, st.department
     FROM shifts s
     JOIN staff st ON s.staff_id = st.id
     WHERE s.shift_date = $1
     ORDER BY st.name ASC`,
    [date]
  );
  return result.rows;
}

async function clockIn(staffId, note, userId) {
  const today = new Date().toISOString().split('T')[0];

  // Check if already clocked in today
  const existing = await pool.query(
    `SELECT id FROM shifts WHERE staff_id = $1 AND shift_date = $2 AND clock_out IS NULL`,
    [staffId, today]
  );
  if (existing.rows.length > 0) {
    throw { status: 409, message: 'Staff member is already clocked in.' };
  }

  const result = await pool.query(
    `INSERT INTO shifts (staff_id, shift_date, clock_in, note, recorded_by)
     VALUES ($1, $2, NOW(), $3, $4) RETURNING *`,
    [staffId, today, note, userId]
  );
  return result.rows[0];
}

async function clockOut(shiftId, userId) {
  const result = await pool.query(
    `UPDATE shifts SET clock_out = NOW(), recorded_by = $1
     WHERE id = $2 AND clock_out IS NULL
     RETURNING *`,
    [userId, shiftId]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Open shift not found.' };
  return result.rows[0];
}

module.exports = { getAllStaff, createStaff, updateStaff, deleteStaff, getShiftsForDate, clockIn, clockOut };
