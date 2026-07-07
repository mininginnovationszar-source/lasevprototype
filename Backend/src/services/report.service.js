const pool = require('../db/pool');

async function getRevenueSummary(month, year) {
  // Room revenue
  const rooms = await pool.query(
    `SELECT
       COUNT(*) AS total_bookings,
       SUM(r.price * (b.check_out - b.check_in)) AS gross_revenue,
       SUM(CASE WHEN b.payment = 'Paid' THEN r.price * (b.check_out - b.check_in) ELSE 0 END) AS paid_revenue
     FROM bookings b
     JOIN rooms r ON b.room_id = r.id
     WHERE EXTRACT(MONTH FROM b.check_in) = $1
       AND EXTRACT(YEAR  FROM b.check_in) = $2
       AND b.payment != 'Cancelled'`,
    [month, year]
  );

  // Venue revenue
  const venues = await pool.query(
    `SELECT
       COUNT(*) AS total_bookings,
       SUM(amount) AS gross_revenue,
       SUM(CASE WHEN payment = 'Paid' THEN amount ELSE 0 END) AS paid_revenue
     FROM venue_bookings
     WHERE EXTRACT(MONTH FROM event_date) = $1
       AND EXTRACT(YEAR  FROM event_date) = $2
       AND payment != 'Cancelled'`,
    [month, year]
  );

  return {
    month,
    year,
    rooms:  rooms.rows[0],
    venues: venues.rows[0],
  };
}

async function getOccupancyReport() {
  const result = await pool.query(
    `SELECT
       r.type,
       COUNT(DISTINCT r.id) AS total_rooms,
       COUNT(DISTINCT CASE WHEN r.status = 'booked' THEN r.id END) AS booked,
       COUNT(DISTINCT CASE WHEN r.status = 'available' THEN r.id END) AS available,
       COUNT(DISTINCT CASE WHEN r.status = 'maintenance' THEN r.id END) AS maintenance
     FROM rooms r
     GROUP BY r.type
     ORDER BY r.type`
  );
  return result.rows;
}

async function getRecentActivity(limit = 50) {
  const result = await pool.query(
    `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1`, [limit]
  );
  return result.rows;
}

module.exports = { getRevenueSummary, getOccupancyReport, getRecentActivity };
