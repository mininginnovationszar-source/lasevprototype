const pool = require('../db/pool');

async function getAllRooms() {
  const result = await pool.query(
    `SELECT * FROM rooms ORDER BY number ASC`
  );
  return result.rows;
}

async function getRoomById(id) {
  const result = await pool.query(
    `SELECT * FROM rooms WHERE id = $1`, [id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Room not found.' };
  return result.rows[0];
}

async function createRoom({ number, type, price, capacity, status = 'available' }) {
  const result = await pool.query(
    `INSERT INTO rooms (number, type, price, capacity, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [number, type, price, capacity, status]
  );
  return result.rows[0];
}

async function updateRoom(id, fields) {
  const { number, type, price, capacity, status } = fields;
  const result = await pool.query(
    `UPDATE rooms
     SET number = COALESCE($1, number),
         type   = COALESCE($2, type),
         price  = COALESCE($3, price),
         capacity = COALESCE($4, capacity),
         status = COALESCE($5, status)
     WHERE id = $6
     RETURNING *`,
    [number, type, price, capacity, status, id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Room not found.' };
  return result.rows[0];
}

async function deleteRoom(id) {
  const result = await pool.query(
    `DELETE FROM rooms WHERE id = $1 RETURNING id`, [id]
  );
  if (!result.rows[0]) throw { status: 404, message: 'Room not found.' };
}

module.exports = { getAllRooms, getRoomById, createRoom, updateRoom, deleteRoom };
