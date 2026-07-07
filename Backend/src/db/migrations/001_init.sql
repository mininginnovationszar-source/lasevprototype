-- Run this once to create all tables.
-- psql -U postgres -d lasev_db -f src/db/migrations/001_init.sql

-- ── Users (login accounts) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  department   VARCHAR(100),
  role         VARCHAR(20)  NOT NULL CHECK (role IN ('reception', 'owner', 'developer')),
  password     VARCHAR(255) NOT NULL,  -- bcrypt hash
  status       VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  is_ghost     BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT false;

-- ── System Settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Rooms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id         SERIAL PRIMARY KEY,
  number     VARCHAR(20)  NOT NULL UNIQUE,
  type       VARCHAR(50)  NOT NULL CHECK (type IN ('Standard', 'Deluxe', 'Suite', 'Villa', 'Penthouse')),
  price      NUMERIC(10,2) NOT NULL,
  capacity   INT          NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked', 'maintenance')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Room Bookings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  customer_name VARCHAR(150) NOT NULL,
  contact       VARCHAR(100) NOT NULL,
  room_id       INT          NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  check_in      DATE         NOT NULL,
  check_out     DATE         NOT NULL,
  payment       VARCHAR(20)  NOT NULL CHECK (payment IN ('Paid', 'Pending', 'Partial', 'Cancelled')),
  notes         TEXT,
  created_by    INT          REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT check_dates CHECK (check_out > check_in)
);

CREATE TABLE IF NOT EXISTS booking_attachments (
  id           SERIAL PRIMARY KEY,
  booking_id   INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  file_name    VARCHAR(255) NOT NULL,
  content_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
  file_size    INT NOT NULL,
  file_data    BYTEA NOT NULL,
  uploaded_by  INT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Venue Bookings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_bookings (
  id           SERIAL PRIMARY KEY,
  client_name  VARCHAR(150) NOT NULL,
  contact      VARCHAR(100) NOT NULL,
  venue_type   VARCHAR(50)  NOT NULL CHECK (venue_type IN ('Lapa','Event Hall','Conference Room','Pool Area','Garden','Boma','Boardroom')),
  event_type   VARCHAR(100) NOT NULL,
  event_date   DATE         NOT NULL,
  event_time   TIME         NOT NULL,
  guests       INT          NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  payment      VARCHAR(20)  NOT NULL CHECK (payment IN ('Paid', 'Pending', 'Partial', 'Cancelled')),
  notes        TEXT,
  created_by   INT          REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Public Website Requests ─────────────────────────────────
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
);

-- ── Staff (non-login clock-in employees) ─────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Shifts (clock-in / clock-out records) ───────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id           SERIAL PRIMARY KEY,
  staff_id     INT          NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shift_date   DATE         NOT NULL,
  clock_in     TIMESTAMPTZ,
  clock_out    TIMESTAMPTZ,
  note         TEXT,
  recorded_by  INT          REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Activity Log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id         SERIAL PRIMARY KEY,
  action     TEXT         NOT NULL,
  user_id    INT          REFERENCES users(id) ON DELETE SET NULL,
  user_name  VARCHAR(100),
  user_role  VARCHAR(20),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

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
);

-- Support messages from resort owner to developers
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
);

-- ── Indexes for common queries ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_room      ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_checkin   ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking ON booking_attachments(booking_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_date ON venue_bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_website_requests_created ON website_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_requests_status ON website_requests(status);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_date  ON shifts(staff_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_activity_created   ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_created   ON app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level     ON app_logs(level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_request   ON app_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created ON support_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_owner   ON support_messages(created_by);

-- ── Message Threads (private app messaging) ──────────────────
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
);

DO $$
BEGIN
  ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_recipient_role_check;
  ALTER TABLE message_threads
    ADD CONSTRAINT message_threads_recipient_role_check
    CHECK (recipient_role IN ('owner', 'developer', 'user', 'announcement'));
END $$;

CREATE TABLE IF NOT EXISTS message_entries (
  id         SERIAL PRIMARY KEY,
  thread_id  INT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id  INT REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_threads_created ON message_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_threads_recipient ON message_threads(recipient_role, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_message_entries_thread ON message_entries(thread_id, created_at);
