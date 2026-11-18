'use strict';
/* Readable ids that match the seed ('L-1001', 'SP-024', 'GA-14', 'INV-2050037'). Call inside withTx: the advisory lock is
   transaction scoped, so two requests cannot take the same number. table/column are fixed names from the callers, never user input. */
const { query } = require('../config/db');
const IDENT = /^[a-z_]+$/;
async function nextId(tx, table, column, prefix, width = 0) {
  if (!IDENT.test(table) || !IDENT.test(column)) throw new Error('nextId: bad identifier');
  await query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [table], tx);
  const r = await query(
    `SELECT COALESCE(MAX(substring(${column} FROM ('^' || $1::text || '([0-9]+)$'))::bigint), 0) AS n
       FROM ${table} WHERE ${column} ~ ('^' || $1::text || '[0-9]+$')`, [prefix], tx);
  return `${prefix}${String(Number(r.rows[0].n) + 1).padStart(width, '0')}`;
}
module.exports = { nextId };
