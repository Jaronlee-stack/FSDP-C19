'use strict';
/* Database access: query() and withTx(), the same for both engines. No secrets are logged.
   DB_DRIVER=pglite (default): PGlite, PostgreSQL compiled to WebAssembly and running inside this process, stored in PGLITE_DATA_DIR.
     No database server is needed. The first start loads the schema, the demo data and every migration; later starts apply only new migrations.
   DB_DRIVER=postgres: a PostgreSQL server reached with the DB_* settings (the original setup). */
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const config = require('./index');

/* DATE stays 'YYYY-MM-DD' (no timezone shift), NUMERIC and INT8 become numbers */
const PARSERS = {
  1082: v => v,
  1700: v => (v === null ? null : parseFloat(v)),
  20: v => (v === null ? null : parseInt(v, 10)),
};

module.exports = config.dbDriver === 'postgres' ? postgres() : pglite();

function postgres() {
  const { Pool, types } = require('pg');
  for (const [oid, fn] of Object.entries(PARSERS)) types.setTypeParser(Number(oid), fn);

  const pool = new Pool(config.db);
  pool.on('error', err => console.error('[db] idle client error:', err.message));

  /* run one statement on the pool, or on a transaction client when `db` is given */
  const query = (text, params = [], db = pool) => db.query(text, params);

  /* run fn(tx) in a transaction. Inside fn every query must use `tx`, never the pool. */
  async function withTx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connection already gone */ }
      throw e;
    } finally {
      client.release();
    }
  }

  return { driver: 'postgres', pool, query, withTx, close: () => pool.end(), ready: Promise.resolve() };
}

function pglite() {
  const { PGlite } = require('@electric-sql/pglite');
  const DB_DIR = path.join(__dirname, '..', '..', 'database');
  const dataDir = path.resolve(config.pgliteDataDir);
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new PGlite(dataDir, { parsers: PARSERS });
  const ready = db.waitReady.then(() => prepare(db, DB_DIR));
  ready.catch(err => { console.error('[db] PGlite could not start:', err.message); process.exitCode = 1; });

  /* PGlite results use affectedRows; the models read rowCount, as pg returns it */
  const shape = r => ({ rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0, fields: r.fields });

  /* PGlite has one session: while a transaction runs, every other query waits for it. A query made inside withTx without its tx
     would wait for itself, so it is run on the open transaction instead. */
  const currentTx = new AsyncLocalStorage();
  const POOL = { query: (text, params) => run(text, params) };

  async function run(text, params) {
    await ready;
    const tx = currentTx.getStore();
    return shape(await (tx || db).query(text, params));
  }

  const query = (text, params = [], target = POOL) => target.query(text, params);

  async function withTx(fn) {
    await ready;
    const open = currentTx.getStore();
    if (open) return fn(open.client);   // already inside a transaction: join it
    return db.transaction(async raw => {
      const client = { query: async (text, params = []) => shape(await raw.query(text, params)) };
      return currentTx.run({ client, query: (t, p) => raw.query(t, p) }, () => fn(client));
    });
  }

  return { driver: 'pglite', pool: { end: () => db.close() }, query, withTx, close: () => db.close(), ready };
}

/* first start: schema, demo data, then every migration; later starts: only migrations not yet recorded */
async function prepare(db, dir) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const hasSchema = (await db.query(`SELECT to_regclass('public.users') IS NOT NULL AS ok`)).rows[0].ok;

  const files = [];
  if (!hasSchema) files.push('db.sql', 'seed.sql', 'seed_extra.sql');
  for (const f of fs.readdirSync(path.join(dir, 'migrations')).filter(f => f.endsWith('.sql')).sort()) files.push(`migrations/${f}`);

  let applied = 0;
  for (const name of files) {
    if (done.has(name)) continue;
    await db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    applied++;
  }
  if (applied) console.log(`[db] PGlite: applied ${applied} file(s)${hasSchema ? '' : ' (new database: schema, demo data and migrations)'}`);
}
