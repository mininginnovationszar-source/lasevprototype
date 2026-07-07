const router      = require('express').Router();
const pool        = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validateRequest');
const activity    = require('../services/activityLog.service');

router.use(requireAuth);
router.use(requireRole('reception', 'owner', 'developer'));

async function ensureMessageTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_threads (
      id                SERIAL PRIMARY KEY,
      subject           VARCHAR(150) NOT NULL,
      created_by        INT REFERENCES users(id) ON DELETE SET NULL,
      recipient_role    VARCHAR(20) NOT NULL CHECK (recipient_role IN ('owner', 'developer', 'user')),
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
}

function visibilityWhere(user, index = 1) {
  if (user.role === 'developer') {
    return {
      sql: `(t.created_by = $${index} OR t.recipient_role = 'developer')`,
      params: [user.id],
    };
  }
  if (user.role === 'owner') {
    return {
      sql: `(t.created_by = $${index} OR t.recipient_role IN ('owner', 'announcement') OR t.recipient_user_id = $${index})`,
      params: [user.id],
    };
  }
  return {
    sql: `(t.created_by = $${index} OR t.recipient_user_id = $${index} OR t.recipient_role = 'announcement')`,
    params: [user.id],
  };
}

async function getThread(id, user) {
  const visible = visibilityWhere(user, 2);
  const params = [id, ...visible.params];
  const result = await pool.query(
    `SELECT
       t.*,
       cu.name AS created_by_name,
       ru.name AS recipient_user_name,
       COALESCE(
         json_agg(
           json_build_object(
             'id', e.id,
             'sender_id', e.sender_id,
             'sender_name', su.name,
             'sender_role', su.role,
             'body', e.body,
             'created_at', e.created_at
           )
           ORDER BY e.created_at, e.id
         ) FILTER (WHERE e.id IS NOT NULL),
         '[]'
       ) AS entries
     FROM message_threads t
     LEFT JOIN users cu ON cu.id = t.created_by
     LEFT JOIN users ru ON ru.id = t.recipient_user_id
     LEFT JOIN message_entries e ON e.thread_id = t.id
     LEFT JOIN users su ON su.id = e.sender_id
     WHERE t.id = $1 AND ${visible.sql}
     GROUP BY t.id, cu.name, ru.name`,
    params
  );
  return result.rows[0];
}

async function getActiveUserByRole(role) {
  const result = await pool.query(
    `SELECT id, name, role, status FROM users WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]
  );
  return result.rows[0];
}

async function getActiveUserById(id) {
  const result = await pool.query(
    `SELECT id, name, role, status FROM users WHERE id = $1 AND status = 'active'`,
    [id]
  );
  return result.rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const visible = visibilityWhere(req.user);
    const result = await pool.query(
      `SELECT t.id
       FROM message_threads t
       WHERE ${visible.sql}
       ORDER BY t.updated_at DESC, t.created_at DESC`,
      visible.params
    );
    const threads = [];
    for (const row of result.rows) threads.push(await getThread(row.id, req.user));
    res.json(threads);
  } catch (e) { next(e); }
});

router.post('/', validate(['subject', 'body']), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await ensureMessageTables();
    const { subject, body, recipientRole, recipientUserId } = req.body;
    let role = recipientRole || null;
    let recipientUser = null;

    if (req.user.role === 'owner') {
      if (recipientUserId) {
        recipientUser = await getActiveUserById(recipientUserId);
        if (!recipientUser || recipientUser.role === 'developer') {
          return res.status(400).json({ message: 'Choose an active non-developer login user.' });
        }
        role = 'user';
      } else if (role !== 'developer') {
        return res.status(400).json({ message: 'Owner can message developer support or login users.' });
      }
    } else if (req.user.role === 'reception') {
      if (role && role !== 'owner') {
        return res.status(403).json({ message: 'Employees can only message the owner.' });
      }
      role = 'owner';
      recipientUser = await getActiveUserByRole('owner');
    } else if (req.user.role === 'developer') {
      if (role === 'announcement') {
        recipientUser = null;
      } else if (recipientUserId) {
        recipientUser = await getActiveUserById(recipientUserId);
        if (!recipientUser || recipientUser.role === 'developer') {
          return res.status(400).json({ message: 'Choose an active owner or reception user.' });
        }
        role = 'user';
      } else if (role === 'owner') {
        recipientUser = await getActiveUserByRole('owner');
      } else {
        return res.status(400).json({ message: 'Developer can message the owner, a login user, or send an announcement.' });
      }
    }

    await client.query('BEGIN');
    const thread = await client.query(
      `INSERT INTO message_threads (subject, created_by, recipient_role, recipient_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [subject, req.user.id, role, recipientUser?.id || null]
    );
    await client.query(
      `INSERT INTO message_entries (thread_id, sender_id, body) VALUES ($1, $2, $3)`,
      [thread.rows[0].id, req.user.id, body]
    );
    await client.query('COMMIT');
    await activity.log(`Conversation started: ${subject}`, req.user);
    res.status(201).json(await getThread(thread.rows[0].id, req.user));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

router.put('/:id/reply', validate(['body']), async (req, res, next) => {
  try {
    await ensureMessageTables();
    const thread = await getThread(req.params.id, req.user);
    if (!thread) return res.status(404).json({ message: 'Conversation not found.' });
    if (thread.status === 'closed') return res.status(409).json({ message: 'Conversation is closed. Open a new ticket.' });

    await pool.query(
      `INSERT INTO message_entries (thread_id, sender_id, body) VALUES ($1, $2, $3)`,
      [req.params.id, req.user.id, req.body.body]
    );
    await pool.query(`UPDATE message_threads SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
    await activity.log(`Conversation replied: ${thread.subject}`, req.user);
    res.json(await getThread(req.params.id, req.user));
  } catch (e) { next(e); }
});

router.put('/:id/close', async (req, res, next) => {
  try {
    await ensureMessageTables();
    if (req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only developers can close conversations.' });
    }
    const thread = await getThread(req.params.id, req.user);
    if (!thread) return res.status(404).json({ message: 'Conversation not found.' });
    await pool.query(
      `UPDATE message_threads
       SET status = 'closed', closed_by = $1, closed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    await activity.log(`Conversation closed: ${thread.subject}`, req.user);
    res.json(await getThread(req.params.id, req.user));
  } catch (e) { next(e); }
});

router.put('/:id/read', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const thread = await getThread(req.params.id, req.user);
    if (!thread) return res.status(404).json({ message: 'Conversation not found.' });
    res.json(thread);
  } catch (e) { next(e); }
});

module.exports = router;
