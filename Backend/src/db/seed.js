require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool   = require('./pool');

function requiredEnv(envName) {
  if (process.env[envName]) return process.env[envName];
  throw new Error(`${envName} must be set before seeding.`);
}

function seedPassword(envName) {
  return process.env[envName] || crypto.randomBytes(18).toString('base64url');
}

async function seed() {
  console.log('Seeding database...');
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`DELETE FROM users WHERE is_ghost = true`);

  // ── Default users ──────────────────────────────────────────
  const users = [
    { name: requiredEnv('SEED_DEV_NAME'), department: 'Engineering', role: 'developer', password: seedPassword('SEED_DEV_PASSWORD'), isGhost: false },
    { name: requiredEnv('SEED_OWNER_NAME'), department: 'Management', role: 'owner', password: seedPassword('SEED_OWNER_PASSWORD'), isGhost: false },
    { name: requiredEnv('SEED_RECEPTION_NAME'), department: 'Reception', role: 'reception', password: seedPassword('SEED_RECEPTION_PASSWORD'), isGhost: false },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const existing = await pool.query(`SELECT id FROM users WHERE name = $1 ORDER BY id LIMIT 1`, [u.name]);
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE users
         SET department = $1, role = $2, password = $3, is_ghost = $4, status = 'active'
         WHERE id = $5`,
        [u.department, u.role, hash, u.isGhost, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO users (name, department, role, password, is_ghost)
         VALUES ($1, $2, $3, $4, $5)`,
        [u.name, u.department, u.role, hash, u.isGhost]
      );
    }
  }
  console.log('✓ Users seeded');

  // ── Default rooms ──────────────────────────────────────────
  const rooms = [
    { number: '101', type: 'Standard',  price: 1800,  capacity: 2, status: 'available' },
    { number: '102', type: 'Standard',  price: 1800,  capacity: 2, status: 'booked' },
    { number: '103', type: 'Standard',  price: 1800,  capacity: 2, status: 'available' },
    { number: '201', type: 'Deluxe',    price: 3200,  capacity: 2, status: 'available' },
    { number: '202', type: 'Deluxe',    price: 3200,  capacity: 3, status: 'maintenance' },
    { number: '203', type: 'Deluxe',    price: 3200,  capacity: 2, status: 'booked' },
    { number: '301', type: 'Suite',     price: 5800,  capacity: 4, status: 'available' },
    { number: '302', type: 'Suite',     price: 5800,  capacity: 4, status: 'booked' },
    { number: '401', type: 'Villa',     price: 9500,  capacity: 6, status: 'available' },
    { number: '501', type: 'Penthouse', price: 15000, capacity: 6, status: 'available' },
  ];

  for (const r of rooms) {
    await pool.query(
      `INSERT INTO rooms (number, type, price, capacity, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (number) DO NOTHING`,
      [r.number, r.type, r.price, r.capacity, r.status]
    );
  }
  console.log('✓ Rooms seeded');
  console.log('✓ Staff seed skipped; add staff from Admin');

  console.log('\nSeed complete. Store these one-time credentials securely:');
  users.forEach(u => console.log(`  ${u.name} / ${u.password}`));

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  pool.end();
  process.exit(1);
});
