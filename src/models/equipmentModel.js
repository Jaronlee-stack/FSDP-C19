'use strict';
/* equipment_order (dogi etc. bought at registration). */
const { query } = require('../config/db');

const insert = (e, db) => query(
  `INSERT INTO equipment_order (id, user_id, item, size, paid, status, requested_at) VALUES ($1, $2, $3, $4, $5, 'Requested', $6)`,
  [e.id, e.userId, e.item, e.size, e.paid, e.at], db);

/* ---------- front desk ---------- */
const COLS = `e.id, e.user_id, sp.member_no, sp.full_name, e.item, e.size, e.paid, e.status, e.requested_at, e.handed_over_at, e.handed_over_to`;
const FROM = `FROM equipment_order e JOIN student_profile sp ON sp.user_id = e.user_id`;
const RANK = `CASE e.status WHEN 'Requested' THEN 0 WHEN 'Ready at HQ' THEN 1 ELSE 2 END`;
const escLike = s => s.replace(/[\\%_]/g, '\\$&');
const list = (q, db) => query(
  `SELECT ${COLS} ${FROM} ${q ? `WHERE (sp.full_name ILIKE $1 ESCAPE '\\' OR sp.member_no ILIKE $1 ESCAPE '\\' OR e.item ILIKE $1 ESCAPE '\\')` : ''}
    ORDER BY ${RANK}, e.requested_at DESC, e.id DESC`, q ? ['%' + escLike(q) + '%'] : [], db).then(r => r.rows);
const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE e.id = $1${lock ? ' FOR UPDATE OF e' : ''}`, [id], db).then(r => r.rows[0] || null);
const setReady = (id, db) => query(`UPDATE equipment_order SET status = 'Ready at HQ' WHERE id = $1 AND status = 'Requested'`, [id], db).then(r => r.rowCount > 0);
const handOver = (id, to, at, db) => query(
  `UPDATE equipment_order SET status = 'Handed over', handed_over_at = $3, handed_over_to = $2 WHERE id = $1 AND status = 'Ready at HQ'`, [id, to, at], db).then(r => r.rowCount > 0);
const openCount = db => query(`SELECT count(*)::int AS n FROM equipment_order WHERE status <> 'Handed over'`, [], db).then(r => r.rows[0].n);
module.exports = { insert, list, get, setReady, handOver, openCount };
