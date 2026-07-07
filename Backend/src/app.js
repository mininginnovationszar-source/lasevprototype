const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const pool    = require('./db/pool');

const authRoutes     = require('./routes/auth.routes');
const roomRoutes     = require('./routes/rooms.routes');
const bookingRoutes  = require('./routes/bookings.routes');
const venueRoutes    = require('./routes/venues.routes');
const staffRoutes    = require('./routes/staff.routes');
const userRoutes     = require('./routes/users.routes');
const customerRoutes = require('./routes/customers.routes');
const reportRoutes   = require('./routes/reports.routes');
const activityRoutes = require('./routes/activity.routes');
const messageRoutes  = require('./routes/messages.routes');
const requireAuth    = require('./middleware/requireAuth');
const requireRole    = require('./middleware/requireRole');
const errorHandler   = require('./middleware/errorHandler');
const activity       = require('./services/activityLog.service');

const app = express();
const frontendDir = path.join(__dirname, '../../App');

function envList(name) {
  return (process.env[name] || '').split(',').map(v => v.trim()).filter(Boolean);
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com 'unsafe-inline'",
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
}

function requestLogger(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    }));
    activity.logRequest(req, res, durationMs);
  });
  next();
}

function rateLimit({ windowMs, max, keyPrefix }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > max) return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    next();
  };
}

async function ensureSystemSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureSupportMessagesTable() {
  try {
    await ensureSystemSettingsTable();
    await activity.ensureAppLogsTable();
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id                 SERIAL PRIMARY KEY,
        subject            VARCHAR(150) NOT NULL,
        body               TEXT         NOT NULL,
        status             VARCHAR(20)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'closed')),
        created_by         INT          REFERENCES users(id) ON DELETE SET NULL,
        developer_reply    TEXT,
        replied_by         INT          REFERENCES users(id) ON DELETE SET NULL,
        read_by_owner      BOOLEAN      NOT NULL DEFAULT true,
        read_by_developer  BOOLEAN      NOT NULL DEFAULT false,
        replied_at         TIMESTAMPTZ,
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_messages_owner ON support_messages(created_by)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_threads (
        id                SERIAL PRIMARY KEY,
        subject           VARCHAR(150) NOT NULL,
        created_by        INT REFERENCES users(id) ON DELETE SET NULL,
        recipient_role    VARCHAR(20) NOT NULL CHECK (recipient_role IN ('owner', 'developer', 'user', 'announcement')),
        recipient_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        status            VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        closed_by         INT REFERENCES users(id) ON DELETE SET NULL,
        closed_at         TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_recipient_role_check;
        ALTER TABLE message_threads
          ADD CONSTRAINT message_threads_recipient_role_check
          CHECK (recipient_role IN ('owner', 'developer', 'user', 'announcement'));
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_entries (
        id         SERIAL PRIMARY KEY,
        thread_id  INT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
        sender_id  INT REFERENCES users(id) ON DELETE SET NULL,
        body       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_threads_created ON message_threads(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_threads_recipient ON message_threads(recipient_role, recipient_user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_entries_thread ON message_entries(thread_id, created_at)`);
    console.log('Message tables ready');
  } catch (err) {
    console.error('Message table check failed:', err.message);
  }
}

ensureSupportMessagesTable();

async function ensureWebsiteRequestsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_requests (
      id           SERIAL PRIMARY KEY,
      name         VARCHAR(150) NOT NULL,
      whatsapp     VARCHAR(80)  NOT NULL,
      phone        VARCHAR(80),
      booking_type VARCHAR(80)  NOT NULL,
      check_in     DATE,
      check_out    DATE,
      guests       INT          NOT NULL,
      message      TEXT,
      source       VARCHAR(40)  NOT NULL DEFAULT 'website',
      status       VARCHAR(20)  NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','converted','archived')),
      handled_by   INT          REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_website_requests_created ON website_requests(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_website_requests_status ON website_requests(status)`);
}

const toWebsiteRequestClient = row => ({
  id: String(row.id),
  name: row.name,
  whatsapp: row.whatsapp,
  phone: row.phone || row.whatsapp,
  bookingType: row.booking_type,
  checkin: row.check_in ? row.check_in.toISOString().split('T')[0] : '',
  checkout: row.check_out ? row.check_out.toISOString().split('T')[0] : '',
  guests: Number(row.guests || 0),
  message: row.message || '',
  source: row.source || 'website',
  status: row.status || 'new',
  handledBy: row.handled_by ? String(row.handled_by) : '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ── Middleware ───────────────────────────────────────────────
const allowedOrigins = envList('CLIENT_ORIGIN');
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(requestLogger);
app.use(securityHeaders);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed by CORS.'));
  },
  credentials: true,
}));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.LOGIN_RATE_LIMIT || 20), keyPrefix: 'login' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: Number(process.env.API_RATE_LIMIT || 240), keyPrefix: 'api' }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '1mb' }));
app.use((req, res, next) => {
  if (req.path.endsWith('.map')) return res.status(404).end();
  next();
});
app.use(express.static(frontendDir, {
  dotfiles: 'deny',
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.map')) res.statusCode = 404;
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-store');
    else res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  },
}));

// ── Health check (no auth needed) ───────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Lasev Resort API', time: new Date() });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', database: 'ok', time: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', database: 'failed', message: err.message });
  }
});

app.get('/api/system/status', async (_req, res, next) => {
  try {
    await ensureSystemSettingsTable();
    const result = await pool.query(`SELECT value FROM system_settings WHERE key = 'login_lock_enabled'`);
    res.json({
      loginLocked: result.rows[0]?.value === 'true',
      lockMessage: 'Access is currently closed. Please contact the developers for access.',
    });
  } catch (err) { next(err); }
});

async function setLoginLockHandler(req, res, next) {
  try {
    await ensureSystemSettingsTable();
    const locked = Boolean(req.body.locked);
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('login_lock_enabled', $1, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [locked ? 'true' : 'false']
    );
    res.json({
      loginLocked: locked,
      lockMessage: 'Access is currently closed. Please contact the developers for access.',
    });
  } catch (err) { next(err); }
}

app.post('/api/system/login-lock', requireAuth, requireRole('developer'), setLoginLockHandler);
app.post('/api/login-lock', requireAuth, requireRole('developer'), setLoginLockHandler);
app.post('/api/client-errors', requireAuth, async (req, res) => {
  await activity.logSystem({
    level: 'error',
    event: 'client_error',
    message: req.body?.message || 'Browser error',
    req,
    status: 0,
    details: {
      source: req.body?.source,
      lineno: req.body?.lineno,
      colno: req.body?.colno,
      stack: req.body?.stack,
      url: req.body?.url,
    },
  });
  res.status(204).end();
});

app.post('/api/website-requests', async (req, res, next) => {
  try {
    await ensureWebsiteRequestsTable();
    const name = String(req.body?.name || '').trim();
    const whatsapp = String(req.body?.whatsapp || req.body?.phone || '').trim();
    const bookingType = String(req.body?.bookingType || req.body?.booking_type || '').trim();
    const checkin = req.body?.checkin || req.body?.checkIn || null;
    const checkout = req.body?.checkout || req.body?.checkOut || null;
    const guests = Number(req.body?.guests || 0);
    const message = String(req.body?.message || '').trim();
    if (!name || !whatsapp || !bookingType || !guests) {
      return res.status(400).json({ message: 'Name, WhatsApp, booking type, and guests are required.' });
    }
    const result = await pool.query(
      `INSERT INTO website_requests
        (name, whatsapp, phone, booking_type, check_in, check_out, guests, message, source)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,'website')
       RETURNING *`,
      [name, whatsapp, bookingType, checkin || null, checkout || null, guests, message]
    );
    res.status(201).json(toWebsiteRequestClient(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

app.get('/api/website-requests', requireAuth, async (_req, res, next) => {
  try {
    await ensureWebsiteRequestsTable();
    const result = await pool.query(`SELECT * FROM website_requests ORDER BY created_at DESC`);
    res.json(result.rows.map(toWebsiteRequestClient));
  } catch (err) {
    next(err);
  }
});

app.put('/api/website-requests/:id', requireAuth, async (req, res, next) => {
  try {
    await ensureWebsiteRequestsTable();
    const status = String(req.body?.status || '').trim();
    if (!['new', 'contacted', 'converted', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Invalid request status.' });
    }
    const result = await pool.query(
      `UPDATE website_requests
       SET status = $1, handled_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, req.user.id, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Website request not found.' });
    res.json(toWebsiteRequestClient(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/rooms',     roomRoutes);
app.use('/api/bookings',  bookingRoutes);
app.use('/api/venues',    venueRoutes);
app.use('/api/staff',     staffRoutes);
app.use('/api/users',     userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/activity',  activityRoutes);
app.use('/api/messages',  messageRoutes);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir, 'login.html'));
});

// ── 404 handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── Global error handler (must be last) ─────────────────────
app.use(errorHandler);

module.exports = app;
