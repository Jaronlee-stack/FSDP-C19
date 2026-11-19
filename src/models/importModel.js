'use strict';
/* import_issue: spreadsheet rows that could not be loaded on their own. (The import pipeline itself is not built; the rows are read and decided here.) */
const { query } = require('../config/db');
const COLS = `i.id, i.file_name, i.row_no, i.issue_type, i.person_name, i.detail, i.status, sp.member_no AS matched_no, sp.full_name AS matched_name`;
const FROM = `FROM import_issue i LEFT JOIN student_profile sp ON sp.user_id = i.matched_user_id`;
const list = (status, db) => query(
  `SELECT ${COLS} ${FROM} WHERE ($1::text IS NULL OR i.status = $1) ORDER BY i.file_name, i.row_no, i.id`, [status], db).then(r => r.rows);
const counts = db => query(
  `SELECT count(*) FILTER (WHERE status = 'open')::int AS open, count(*) FILTER (WHERE status = 'fixed')::int AS fixed, count(*) FILTER (WHERE status = 'dismissed')::int AS dismissed FROM import_issue`, [], db).then(r => r.rows[0]);
const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE i.id = $1${lock ? ' FOR UPDATE OF i' : ''}`, [id], db).then(r => r.rows[0] || null);
/* only an open row can be decided: the WHERE makes a second decision affect no row */
const decide = (id, status, matchedUserId, db) => query(
  `UPDATE import_issue SET status = $2, matched_user_id = $3 WHERE id = $1 AND status = 'open'`, [id, status, matchedUserId || null], db).then(r => r.rowCount > 0);
module.exports = { list, counts, get, decide };
