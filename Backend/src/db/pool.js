const { Pool } = require('pg');

// One pool shared across the whole app.
// pg reads the env vars automatically when you use this config format.
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Test the connection when the server starts
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  release();
  console.log('Connected to PostgreSQL:', process.env.DB_NAME);
});

module.exports = pool;
