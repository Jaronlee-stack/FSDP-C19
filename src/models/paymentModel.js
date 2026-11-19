'use strict';
/* payment rows (online mock checkout). */
const { query } = require('../config/db');

const listForUser = (userId, db) => query(
  `SELECT id, invoice_no, item, kind, amount, method, status, channel, created_at, paid_at
     FROM payment WHERE user_id = $1 ORDER BY COALESCE(paid_at, created_at) DESC, id DESC`, [userId], db).then(r => r.rows);

const getOwn = (id, userId, db) => query(
  `SELECT id, invoice_no, item, kind, amount, method, status, channel, created_at, paid_at FROM payment WHERE id = $1 AND user_id = $2`, [id, userId], db).then(r => r.rows[0] || null);

/* a paid online charge */
const insertPaid = (p, db) => query(
  `INSERT INTO payment (id, invoice_no, user_id, item, kind, amount, method, status, channel, student_package_id, created_at, paid_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 'Paid', $8, $9, $10, $10)`,
  [p.id, p.invoiceNo, p.userId, p.item, p.kind, p.amount, p.method, p.channel || 'online', p.packageId || null, p.at], db);

/* money the member still owes: outstanding or failed charges */
const hasUnpaid = (userId, db) => query(
  `SELECT 1 FROM payment WHERE user_id = $1 AND status = 'Outstanding' LIMIT 1`, [userId], db).then(r => r.rowCount > 0);

/* ---------- front desk ledger ---------- */
const LEDGER_COLS = `p.id, p.invoice_no, p.user_id, sp.member_no, sp.full_name, p.item, p.kind, p.amount, p.method, p.status, p.channel, p.student_package_id,
                     p.created_at, p.paid_at, p.note, to_char(COALESCE(p.paid_at, p.created_at) AT TIME ZONE $1, 'YYYY-MM-DD') AS day`;
const LEDGER_FROM = `FROM payment p JOIN student_profile sp ON sp.user_id = p.user_id`;
const escLike = s => s.replace(/[\\%_]/g, '\\$&');
/* the ledger, newest first. $1 is the time zone used to cut the day. */
async function listLedger({ tz, q, status, from, to, includeFailed = false, limit = 1000 }, db) {
  const params = [tz], where = [];
  const bind = v => { params.push(v); return `$${params.length}`; };
  if (!includeFailed) where.push(`p.status <> 'Failed'`);
  if (q) { const b = bind('%' + escLike(q) + '%'); where.push(`(sp.full_name ILIKE ${b} ESCAPE '\\' OR sp.member_no ILIKE ${b} ESCAPE '\\' OR p.item ILIKE ${b} ESCAPE '\\' OR p.invoice_no ILIKE ${b} ESCAPE '\\')`); }
  if (status) where.push(`p.status = ${bind(status)}`);
  if (from) where.push(`(COALESCE(p.paid_at, p.created_at) AT TIME ZONE $1)::date >= ${bind(from)}::date`);
  if (to) where.push(`(COALESCE(p.paid_at, p.created_at) AT TIME ZONE $1)::date <= ${bind(to)}::date`);
  const lim = bind(limit);
  const r = await query(`SELECT ${LEDGER_COLS} ${LEDGER_FROM} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC LIMIT ${lim}`, params, db);
  return r.rows;
}
const getLedgerRow = (id, tz, db, lock = false) => query(
  `SELECT ${LEDGER_COLS} ${LEDGER_FROM} WHERE p.id = $2${lock ? ' FOR UPDATE OF p' : ''}`, [tz, id], db).then(r => r.rows[0] || null);
/* payments taken at the desk (channel 'desk', status Paid) on one local day */
const deskPaidOn = (day, tz, db) => query(
  `SELECT ${LEDGER_COLS} ${LEDGER_FROM}
    WHERE p.channel = 'desk' AND p.status = 'Paid' AND (p.paid_at AT TIME ZONE $1)::date = $2::date ORDER BY p.paid_at, p.id`, [tz, day], db).then(r => r.rows);
const stats = (day, tz, db) => query(
  `SELECT COALESCE(sum(amount) FILTER (WHERE status = 'Paid' AND (paid_at AT TIME ZONE $1)::date = $2::date), 0)::float AS collected_today,
          COALESCE(sum(amount) FILTER (WHERE status = 'Outstanding'), 0)::float AS outstanding_total,
          count(*) FILTER (WHERE status = 'Outstanding')::int AS outstanding_count,
          count(*) FILTER (WHERE status = 'Processing')::int AS processing_count,
          count(*) FILTER (WHERE status = 'Failed')::int AS failed_count
     FROM payment`, [tz, day], db).then(r => r.rows[0]);
/* a new row. status 'Paid' also sets paid_at (the table check ties the two together). */
const insert = (p, db) => query(
  `INSERT INTO payment (id, invoice_no, user_id, item, kind, amount, method, status, channel, student_package_id, created_at, paid_at, note)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $13::boolean THEN $11::timestamptz ELSE NULL END, $12)`,
  [p.id, p.invoiceNo, p.userId, p.item, p.kind, p.amount, p.method || 'Stripe', p.status, p.channel, p.packageId || null, p.at, p.note || null, p.status === 'Paid'], db);
/* an Outstanding row is paid at the desk */
const markPaid = (id, method, channel, at, db) => query(
  `UPDATE payment SET status = 'Paid', method = $2, channel = $3, paid_at = $4 WHERE id = $1 AND status = 'Outstanding'`, [id, method, channel, at], db).then(r => r.rowCount > 0);
/* Voided and Failed rows carry no paid_at (the table check), Refunded keeps it */
const setStatus = (id, status, note, db) => query(
  `UPDATE payment SET status = $2, note = $3, paid_at = CASE WHEN $4::boolean THEN paid_at ELSE NULL END WHERE id = $1`, [id, status, note, status === 'Paid' || status === 'Refunded'], db);
const setAmount = (id, amount, note, db) => query(`UPDATE payment SET amount = $2, note = $3 WHERE id = $1`, [id, amount, note], db);
module.exports = { listForUser, getOwn, insertPaid, hasUnpaid, listLedger, getLedgerRow, deskPaidOn, stats, insert, markPaid, setStatus, setAmount };
