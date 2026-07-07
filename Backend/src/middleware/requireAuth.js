const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const LOGIN_LOCK_MESSAGE = 'Access is currently closed. Please contact the developers for access.';

function jwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured.');
  }
  return process.env.JWT_SECRET;
}

// Attach this to any route that requires a logged-in user.
// It reads the token from the Authorization header, verifies it,
// and puts the decoded user object on req.user for the controller to use.

async function isLoginLocked() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await pool.query(`SELECT value FROM system_settings WHERE key = 'login_lock_enabled'`);
  return result.rows[0]?.value === 'true';
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Header must look like: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, jwtSecret());
    req.user = decoded; // { id, name, role, department }
    Promise.resolve(isLoginLocked())
      .then(locked => {
        if (locked && decoded.role !== 'developer') {
          return res.status(423).json({ message: LOGIN_LOCK_MESSAGE });
        }
        next();
      })
      .catch(next);
  } catch (err) {
    if (err.message === 'JWT_SECRET must be configured.') {
      return res.status(500).json({ message: err.message });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ message: 'Invalid token. Please log in.' });
  }
}

module.exports = requireAuth;
