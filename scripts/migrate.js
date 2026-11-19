'use strict';
/* Brings a database up to date before the app starts (used on Render, where no init script runs).
   Each file runs once and is recorded in schema_migrations. db.sql drops and recreates every table, so on a database that
   already has tables but no record (loaded by hand, or by the Docker init script) nothing is re-run: each file is checked
   with a probe and marked as applied if its changes are already there. Safe to run on every start. */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const config = require('../src/config');

const DB_DIR = path.join(__dirname, '..', 'database');

/* in order; `probe` answers "is this already in the database?" for databases that predate schema_migrations */
const FILES = [
  { name: 'db.sql', probe: `SELECT to_regclass('public.users') IS NOT NULL` },
  { name: 'seed.sql', probe: `SELECT EXISTS (SELECT 1 FROM users)` },
  { name: 'seed_extra.sql', probe: `SELECT EXISTS (SELECT 1 FROM users)` },
  { name: 'migrations/0003_add_telegram_chat_id.sql',
    probe: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_profile' AND column_name = 'telegram_chat_id')` },
  { name: 'migrations/0004_telegram_link_code.sql', probe: `SELECT to_regclass('public.telegram_link_code') IS NOT NULL` },
  { name: 'migrations/0005_venue_roster.sql', probe: `SELECT to_regclass('public.class_enrollment') IS NOT NULL` },
  { name: 'migrations/0006_venue_import.sql', probe: `SELECT to_regclass('public.venue_import_mapping') IS NOT NULL` },
  { name: 'migrations/0007_admin_inbox.sql', probe: `SELECT to_regclass('public.admin_inbox_item') IS NOT NULL` },
  { name: 'migrations/0008_ben_followups.sql',
    probe: `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'followup_attempt_method_check'
              AND pg_get_constraintdef(oid) LIKE '%Telegram%')` },
];

const LOCK_KEY = 4242001;   // one runner at a time, even if two instances start together

async function main() {
  const client = new Client(config.db);
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(), how VARCHAR(16) NOT NULL)`);

    const probe = async sql => Object.values((await client.query(sql)).rows[0])[0] === true;
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const fresh = done.size === 0 && !(await probe(FILES[0].probe));
    let ran = 0, marked = 0;

    for (const f of FILES) {
      if (done.has(f.name)) continue;
      if (!fresh) {
        if (await probe(f.probe)) {
          await client.query(`INSERT INTO schema_migrations (name, how) VALUES ($1, 'detected')`, [f.name]);
          console.log(`[migrate] ${f.name}: already in the database, recorded`);
          marked++;
          continue;
        }
      }
      const sql = fs.readFileSync(path.join(DB_DIR, f.name), 'utf8');
      console.log(`[migrate] ${f.name}: applying`);
      await client.query(sql);   // one simple query: runs as a single transaction unless the file has its own BEGIN/COMMIT
      await client.query(`INSERT INTO schema_migrations (name, how) VALUES ($1, 'applied')`, [f.name]);
      ran++;
    }
    console.log(`[migrate] up to date (${ran} applied, ${marked} recorded as already present)`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch(err => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
