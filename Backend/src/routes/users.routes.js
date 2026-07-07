const router      = require('express').Router();
const bcrypt      = require('bcrypt');
const pool        = require('../db/pool');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validateRequest');
const activity    = require('../services/activityLog.service');

router.use(requireAuth);
router.use(requireRole('owner', 'developer'));

function isDeveloper(req) {
  return req.user?.role === 'developer';
}

function isPrivilegedAccount(user) {
  return Boolean(
    user?.is_ghost ||
    user?.role === 'developer' ||
    /^Mining\s+/i.test(user?.name || '')
  );
}

function assertDeveloperAccountAccess(req, role) {
  if (role === 'developer' && !isDeveloper(req)) {
    throw { status: 403, message: 'Only developer accounts can manage developer accounts.' };
  }
}

function assertPrivilegedAccountAccess(req, user) {
  if (isPrivilegedAccount(user) && !isDeveloper(req)) {
    throw { status: 403, message: 'Only developers can manage privileged accounts.' };
  }
}

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let sql = `SELECT id, name, department, role, status, is_ghost, created_at FROM users`;
    if (!isDeveloper(req)) sql += ` WHERE role <> 'developer' AND is_ghost = false AND name NOT ILIKE 'Mining %'`;
    sql += ` ORDER BY name ASC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

// POST /api/users — create new login account
router.post('/', validate(['name', 'password', 'role']), async (req, res, next) => {
  try {
    const { name, password, department, role } = req.body;
    const isGhost = Boolean(req.body.isGhost || req.body.is_ghost);
    if (isGhost && !isDeveloper(req)) {
      throw { status: 403, message: 'Only developers can create ghost accounts.' };
    }
    assertDeveloperAccountAccess(req, role);
    if (!isDeveloper(req) && /^Mining\s+/i.test(name || '')) {
      throw { status: 403, message: 'Only developers can create privileged Mining accounts.' };
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, department, role, password, is_ghost)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, department, role, status, is_ghost, created_at`,
      [name, department, role, hash, isGhost]
    );
    await activity.log(`Created ${role === 'developer' ? 'ghost developer' : role} login user ${name}`, req.user);
    res.status(201).json(result.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/users/:id — update role, department, or status
router.put('/:id', async (req, res, next) => {
  try {
    const current = await pool.query(`SELECT id, name, role, is_ghost FROM users WHERE id = $1`, [req.params.id]);
    const target = current.rows[0];
    if (!target) return res.status(404).json({ message: 'User not found.' });

    const { name, department, role, status, password } = req.body;
    const hasGhostUpdate = Object.prototype.hasOwnProperty.call(req.body, 'isGhost') || Object.prototype.hasOwnProperty.call(req.body, 'is_ghost');
    const isGhost = hasGhostUpdate ? Boolean(req.body.isGhost || req.body.is_ghost) : null;
    if ((target.is_ghost || hasGhostUpdate) && !isDeveloper(req)) {
      throw { status: 403, message: 'Only developers can manage ghost accounts.' };
    }
    assertPrivilegedAccountAccess(req, target);
    if (!isDeveloper(req) && /^Mining\s+/i.test(name || '')) {
      throw { status: 403, message: 'Only developers can create privileged Mining accounts.' };
    }
    assertDeveloperAccountAccess(req, target.role);
    assertDeveloperAccountAccess(req, role);

    const hash = password ? await bcrypt.hash(password, 10) : null;
    const result = await pool.query(
      `UPDATE users SET
         name       = COALESCE($1, name),
         department = COALESCE($2, department),
         role       = COALESCE($3, role),
         status     = COALESCE($4, status),
         password   = COALESCE($5, password),
         is_ghost   = COALESCE($6, is_ghost)
       WHERE id = $7
       RETURNING id, name, department, role, status, is_ghost, created_at`,
      [name, department, role, status, hash, isGhost, req.params.id]
    );
    const updated = result.rows[0];
    await activity.log(`Updated ${updated.role === 'developer' ? 'ghost developer' : updated.role} login user ${updated.name}`, req.user);
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }
    const current = await pool.query(`SELECT id, name, role, is_ghost FROM users WHERE id = $1`, [req.params.id]);
    const target = current.rows[0];
    if (!target) return res.status(404).json({ message: 'User not found.' });
    assertPrivilegedAccountAccess(req, target);
    assertDeveloperAccountAccess(req, target.role);
    if (target.is_ghost && !isDeveloper(req)) {
      throw { status: 403, message: 'Only developers can delete ghost accounts.' };
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    await activity.log(`Deleted ${target.role === 'developer' ? 'ghost developer' : target.role} login user ${target.name}`, req.user);
    res.json({ message: 'User deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
