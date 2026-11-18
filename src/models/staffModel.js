'use strict';
/* staff_profile (office staff) and instructor_profile accounts for the Staff page. Never selects password_hash. */
const { query } = require('../config/db');
/* active office staff (front desk and Business Admin) who can own a follow-up */
const listActive = db => query(
  `SELECT user_id, full_name, admin_type FROM staff_profile WHERE status = 'active' ORDER BY admin_type DESC, full_name`, [], db).then(r => r.rows);
const find = (id, db) => query(`SELECT user_id, full_name, admin_type, status FROM staff_profile WHERE user_id = $1`, [id], db).then(r => r.rows[0] || null);

/* ---------- Staff page ---------- */
/* office staff and instructors in one list: Business Admins first, then the front desk, then instructors */
const listAll = db => query(
  `SELECT x.id, x.name, x.type, x.status, x.email, x.last_login_at FROM (
      SELECT s.user_id AS id, s.full_name AS name, s.admin_type AS type, s.status, u.email, u.last_login_at, CASE s.admin_type WHEN 'business' THEN 0 ELSE 1 END AS o
        FROM staff_profile s JOIN users u ON u.id = s.user_id
      UNION ALL
      SELECT i.user_id, i.full_name, 'instructor', i.status, u.email, u.last_login_at, 2
        FROM instructor_profile i JOIN users u ON u.id = i.user_id) x
    ORDER BY x.o, x.id`, [], db).then(r => r.rows);
/* one account (office staff or instructor), locked for the rest of the transaction */
const getAny = (id, db) => query(
  `SELECT x.id, x.name, x.type, x.status, x.email FROM (
      SELECT s.user_id AS id, s.full_name AS name, s.admin_type AS type, s.status, u.email FROM staff_profile s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1
      UNION ALL
      SELECT i.user_id, i.full_name, 'instructor', i.status, u.email FROM instructor_profile i JOIN users u ON u.id = i.user_id WHERE i.user_id = $1) x`, [id], db).then(r => r.rows[0] || null);
/* every active Business Admin, locked: two requests cannot both remove the last one */
const lockActiveBusiness = db => query(
  `SELECT user_id FROM staff_profile WHERE admin_type = 'business' AND status = 'active' ORDER BY user_id FOR UPDATE`, [], db).then(r => r.rows);
const lockAccount = (id, db) => query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [id], db);
const insertStaff = (s, db) => query(
  `INSERT INTO staff_profile (user_id, full_name, admin_type, status) VALUES ($1, $2, $3, 'active')`, [s.id, s.name, s.type], db);
const insertInstructor = (s, db) => query(
  `INSERT INTO instructor_profile (user_id, full_name, dan_grade, is_chief, status) VALUES ($1, $2, $3, FALSE, 'active')`, [s.id, s.name, s.dan], db);
const setType = (id, type, db) => query(`UPDATE staff_profile SET admin_type = $2 WHERE user_id = $1`, [id, type], db).then(r => r.rowCount > 0);
const setStatus = (id, kind, status, db) => query(
  kind === 'instructor' ? `UPDATE instructor_profile SET status = $2 WHERE user_id = $1` : `UPDATE staff_profile SET status = $2 WHERE user_id = $1`, [id, status], db).then(r => r.rowCount > 0);
/* the next readable id. Business Admin ADM-001.., front desk ADM-101.., instructor INS-0001.. (fixed patterns, never user input) */
const ID_RULES = {
  business: { prefix: 'ADM-', re: '^ADM-0[0-9][0-9]$', pad: 3, min: 0 },
  frontdesk: { prefix: 'ADM-', re: '^ADM-1[0-9][0-9]$', pad: 3, min: 100 },
  instructor: { prefix: 'INS-', re: '^INS-[0-9]{4}$', pad: 4, min: 0 }
};
async function nextId(type, db) {
  const rule = ID_RULES[type];
  await query(`SELECT pg_advisory_xact_lock(hashtext('staff-id'))`, [], db);
  const r = await query(`SELECT COALESCE(MAX(substring(id FROM 5)::int), $2::int) AS n FROM users WHERE id ~ $1`, [rule.re, rule.min], db);
  return rule.prefix + String(Number(r.rows[0].n) + 1).padStart(rule.pad, '0');
}
module.exports = { listActive, find, listAll, getAny, lockActiveBusiness, lockAccount, insertStaff, insertInstructor, setType, setStatus, nextId };
