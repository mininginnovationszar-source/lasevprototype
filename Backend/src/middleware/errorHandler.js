// Global error handler — must be the LAST app.use() in app.js.
// Any route that calls next(err) lands here.
const activity = require('../services/activityLog.service');

function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const status = err.code === '23505' ? 409 : err.code === '23503' ? 400 : err.status || 500;
  activity.logError(err, req, status);

  // PostgreSQL unique violation (e.g. duplicate room number)
  if (err.code === '23505') {
    return res.status(409).json({ message: 'A record with that value already exists.' });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referenced record does not exist.' });
  }

  const message = err.message || 'Something went wrong. Please try again.';

  res.status(status).json({ message });
}

module.exports = errorHandler;
