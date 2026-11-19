'use strict';
/* PostgreSQL pool, type parsers, query() and withTx(). No secrets are logged. */
const { Pool, types } = require('pg');
const config = require('./index');

/* DATE stays 'YYYY-MM-DD' (no timezone shift), NUMERIC and INT8 become numbers */
types.setTypeParser(1082, v => v);
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

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

module.exports = { pool, query, withTx };
