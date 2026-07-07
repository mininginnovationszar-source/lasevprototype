const pool = require('../db/pool');

async function ensureAppLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_logs (
      id          SERIAL PRIMARY KEY,
      level       VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warn', 'error')),
      event       VARCHAR(80) NOT NULL,
      message     TEXT NOT NULL,
      request_id  UUID,
      method      VARCHAR(10),
      path        TEXT,
      status      INT,
      duration_ms INT,
      user_id     INT REFERENCES users(id) ON DELETE SET NULL,
      user_name   VARCHAR(100),
      user_role   VARCHAR(20),
      ip          VARCHAR(80),
      user_agent  TEXT,
      details     JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_logs_request ON app_logs(request_id)`);
}

function safeDetails(details) {
  if (!details) return null;
  try {
    return JSON.stringify(details);
  } catch (_err) {
    return JSON.stringify({ note: 'Details could not be serialized.' });
  }
}

// Call this from any service after an important action
async function log(action, user) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (action, user_id, user_name, user_role)
       VALUES ($1, $2, $3, $4)`,
      [action, user?.id, user?.name, user?.role]
    );
  } catch (err) {
    // Never let logging crash the main operation
    console.error('Activity log failed:', err.message);
  }
}

async function logSystem({ level = 'info', event, message, req, status, durationMs, details }) {
  try {
    await ensureAppLogsTable();
    await pool.query(
      `INSERT INTO app_logs
       (level, event, message, request_id, method, path, status, duration_ms,
        user_id, user_name, user_role, ip, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        level,
        event,
        message,
        req?.id || null,
        req?.method || null,
        req?.originalUrl || req?.path || null,
        status ?? null,
        durationMs ?? null,
        req?.user?.id || null,
        req?.user?.name || null,
        req?.user?.role || null,
        req?.ip || null,
        req?.get?.('user-agent') || null,
        safeDetails(details),
      ]
    );
  } catch (err) {
    console.error('System log failed:', err.message);
  }
}

async function logRequest(req, res, durationMs) {
  if (!req.originalUrl?.startsWith('/api/')) return;
  const status = res.statusCode;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  await logSystem({
    level,
    event: 'api_request',
    message: `${req.method} ${req.originalUrl} -> ${status}`,
    req,
    status,
    durationMs,
  });
}

async function logError(err, req, status) {
  await logSystem({
    level: 'error',
    event: 'server_error',
    message: err.message || 'Unhandled server error',
    req,
    status,
    details: {
      name: err.name,
      code: err.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    },
  });
}

async function getRecentLogs(limit = 50) {
  const result = await pool.query(
    `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1`, [limit]
  );
  return result.rows;
}

async function getSystemLogs({ limit = 200, level, event } = {}) {
  await ensureAppLogsTable();
  const values = [];
  const where = [];
  if (level) {
    values.push(level);
    where.push(`level = $${values.length}`);
  }
  if (event) {
    values.push(event);
    where.push(`event = $${values.length}`);
  }
  values.push(Math.min(Number(limit) || 200, 10000));
  const result = await pool.query(
    `SELECT id, level, event, message, request_id, method, path, status, duration_ms,
            user_id, user_name, user_role, ip, user_agent, details, created_at
     FROM app_logs
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

module.exports = {
  log,
  getRecentLogs,
  ensureAppLogsTable,
  logSystem,
  logRequest,
  logError,
  getSystemLogs,
};
