require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');

const TABLES = [
  'users',
  'rooms',
  'bookings',
  'booking_attachments',
  'venue_bookings',
  'staff',
  'shifts',
  'activity_logs',
  'app_logs',
  'message_threads',
  'message_entries',
];

async function backup() {
  const outDir = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
  fs.mkdirSync(outDir, { recursive: true });
  const data = { exportedAt: new Date().toISOString(), tables: {} };

  for (const table of TABLES) {
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY id ASC`);
    data.tables[table] = result.rows;
  }

  const file = path.join(outDir, `lasev-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(file);
  await pool.end();
}

backup().catch(async err => {
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
