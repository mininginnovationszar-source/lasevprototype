require('dotenv').config();
const fs = require('fs');
const pool = require('../src/db/pool');

const TABLES = [
  'message_entries',
  'message_threads',
  'app_logs',
  'activity_logs',
  'shifts',
  'staff',
  'venue_bookings',
  'booking_attachments',
  'bookings',
  'rooms',
  'users',
];

function restoreValue(table, column, value) {
  if (table === 'booking_attachments' && column === 'file_data' && value?.type === 'Buffer') {
    return Buffer.from(value.data);
  }
  return value;
}

async function restore() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/restore.js path/to/backup.json');
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!backup.tables) throw new Error('Invalid backup file.');

  await pool.query('BEGIN');
  for (const table of TABLES) await pool.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);

  for (const table of TABLES.slice().reverse()) {
    const rows = backup.tables[table] || [];
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map(c => restoreValue(table, c, row[c]));
      const params = values.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${params})`,
        values
      );
    }
  }
  await pool.query('COMMIT');
  await pool.end();
  console.log('Restore complete.');
}

restore().catch(async err => {
  await pool.query('ROLLBACK').catch(() => {});
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
