'use strict';
/* refund_request: the front desk asks, a Business Admin decides. */
const { query } = require('../config/db');
const COLS = `r.id, r.payment_id, r.user_id, sp.member_no, sp.full_name, r.amount, r.reason, r.status, r.requested_at, r.decided_at,
              p.item, p.invoice_no, st.full_name AS requested_by_name, dec.full_name AS decided_by_name`;
const FROM = `FROM refund_request r JOIN student_profile sp ON sp.user_id = r.user_id JOIN payment p ON p.id = r.payment_id
              LEFT JOIN staff_profile st ON st.user_id = r.requested_by LEFT JOIN staff_profile dec ON dec.user_id = r.decided_by`;
const list = db => query(`SELECT ${COLS} ${FROM} ORDER BY r.requested_at DESC, r.id DESC`, [], db).then(r => r.rows);
const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE r.id = $1${lock ? ' FOR UPDATE OF r' : ''}`, [id], db).then(r => r.rows[0] || null);
const pendingForPayment = (paymentId, db) => query(`SELECT id FROM refund_request WHERE payment_id = $1 AND status = 'pending' LIMIT 1`, [paymentId], db).then(r => r.rows[0] || null);
const insert = (x, db) => query(
  `INSERT INTO refund_request (id, payment_id, user_id, amount, reason, requested_by, status, requested_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
  [x.id, x.paymentId, x.userId, x.amount, x.reason, x.requestedBy, x.at], db);
const decide = (id, status, by, at, db) => query(
  `UPDATE refund_request SET status = $2, decided_by = $3, decided_at = $4 WHERE id = $1 AND status = 'pending'`, [id, status, by, at], db).then(r => r.rowCount > 0);
const pendingCount = db => query(`SELECT count(*)::int AS n FROM refund_request WHERE status = 'pending'`, [], db).then(r => r.rows[0].n);
module.exports = { list, get, pendingForPayment, insert, decide, pendingCount };
