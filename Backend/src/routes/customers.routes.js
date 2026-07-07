const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

// Get all customers (derived from bookings — no separate table needed)
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         customer_name AS name,
         contact,
         COUNT(*) AS total_bookings,
         MAX(created_at) AS last_booking
       FROM bookings
       GROUP BY customer_name, contact
       ORDER BY last_booking DESC`
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

// Get booking history for one customer by name
router.get('/:name', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*, r.number AS room_number, r.type AS room_type
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       WHERE LOWER(b.customer_name) = LOWER($1)
       ORDER BY b.check_in DESC`,
      [req.params.name]
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

module.exports = router;
