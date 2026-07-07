const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../db/pool');

const LOGIN_LOCK_MESSAGE = 'Access is currently closed. Please contact the developers for access.';

function jwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw { status: 500, message: 'JWT_SECRET must be configured.' };
  }
  return process.env.JWT_SECRET;
}

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      department: user.department,
      role: user.role,
      isGhost: user.is_ghost,
    },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '10m' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    department: user.department,
    role: user.role,
    isGhost: user.is_ghost,
  };
}

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

async function login(name, password) {
  // 1. Find the user by name
  const result = await pool.query(
    `SELECT id, name, department, role, password, status, is_ghost
     FROM users
     WHERE name = $1`,
    [name]
  );

  const user = result.rows[0];

  if (!user) {
    throw { status: 401, message: 'Invalid name or password.' };
  }

  if (user.status === 'inactive') {
    throw { status: 403, message: 'Your account is inactive. Contact the owner.' };
  }

  if (user.role !== 'developer' && await isLoginLocked()) {
    throw { status: 423, message: LOGIN_LOCK_MESSAGE };
  }

  // 2. Compare the password against the bcrypt hash
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw { status: 401, message: 'Invalid name or password.' };
  }

  return {
    token: signUser(user),
    user: publicUser(user),
  };
}

async function switchUser(developer, targetUserId) {
  const actingDeveloper = developer.role === 'developer'
    ? { id: developer.id, name: developer.name }
    : developer.actingDeveloper;

  if (!actingDeveloper) {
    throw { status: 403, message: 'Only developer accounts can switch users.' };
  }

  const result = await pool.query(
    `SELECT id, name, department, role, status, is_ghost
     FROM users
     WHERE id = $1`,
    [targetUserId]
  );

  const user = result.rows[0];
  if (!user) throw { status: 404, message: 'Target user not found.' };
  if (user.role === 'developer') {
    throw { status: 403, message: 'Switching into developer accounts is not allowed.' };
  }
  if (user.status === 'inactive') {
    throw { status: 403, message: 'Target account is inactive.' };
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      department: user.department,
      role: user.role,
      isGhost: user.is_ghost,
      actingDeveloper: {
        id: actingDeveloper.id,
        name: actingDeveloper.name,
      },
    },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '10m' }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      department: user.department,
      role: user.role,
      isGhost: user.is_ghost,
      actingDeveloper: {
        id: actingDeveloper.id,
        name: actingDeveloper.name,
      },
    },
  };
}

module.exports = { login, switchUser };
