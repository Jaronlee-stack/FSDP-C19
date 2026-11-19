'use strict';
/* exception_request: things the front desk cannot decide and sends to a Business Admin. */
const { query } = require('../config/db');
const COLS = `x.id, x.kind, x.subject_name, x.user_id, sp.member_no, x.detail, x.status, x.requested_at, x.decided_at, x.decision_note,
              st.full_name AS requested_by_name, dec.full_name AS decided_by_name`;
const FROM = `FROM exception_request x LEFT JOIN student_profile sp ON sp.user_id = x.user_id
              LEFT JOIN staff_profile st ON st.user_id = x.requested_by LEFT JOIN staff_profile dec ON dec.user_id = x.decided_by`;
const list = db => query(`SELECT ${COLS} ${FROM} ORDER BY (x.status = 'pending') DESC, COALESCE(x.decided_at, x.requested_at) DESC, x.id DESC`, [], db).then(r => r.rows);
const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE x.id = $1${lock ? ' FOR UPDATE OF x' : ''}`, [id], db).then(r => r.rows[0] || null);
const insert = (x, db) => query(
  `INSERT INTO exception_request (id, kind, subject_name, user_id, detail, requested_by, status, requested_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
  [x.id, x.kind, x.subjectName, x.userId || null, x.detail, x.requestedBy, x.at], db);
const decide = (id, status, by, at, note, db) => query(
  `UPDATE exception_request SET status = $2, decided_by = $3, decided_at = $4, decision_note = $5 WHERE id = $1 AND status = 'pending'`, [id, status, by, at, note || null], db).then(r => r.rowCount > 0);
const pendingCount = db => query(`SELECT count(*)::int AS n FROM exception_request WHERE status = 'pending'`, [], db).then(r => r.rows[0].n);
module.exports = { list, get, insert, decide, pendingCount };
