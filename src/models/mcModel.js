'use strict';
/* mc_request: package extension requests (medical certificate or Compassion Guaranteed). */
const { query } = require('../config/db');

const listForUser = (userId, db) => query(
  `SELECT m.id, m.student_package_id, m.kind, m.days_requested, m.days_granted, m.document_ref, m.status, m.requested_at, pd.name AS package_name, sp.expires_at
     FROM mc_request m JOIN student_package sp ON sp.id = m.student_package_id JOIN package_def pd ON pd.id = sp.package_id
    WHERE m.user_id = $1 ORDER BY m.requested_at DESC, m.id DESC`, [userId], db).then(r => r.rows);

const pendingForPackage = (packageId, db) => query(
  `SELECT id FROM mc_request WHERE student_package_id = $1 AND status = 'pending' LIMIT 1`, [packageId], db).then(r => r.rows[0] || null);

const insert = (m, db) => query(
  `INSERT INTO mc_request (id, user_id, student_package_id, kind, days_requested, document_ref, status, requested_at)
   VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`, [m.id, m.userId, m.packageId, m.kind, m.days, m.documentRef, m.at], db);

/* a student can withdraw their own request while it is still waiting */
const deletePending = (id, userId, db) => query(
  `DELETE FROM mc_request WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [id, userId], db).then(r => r.rowCount > 0);

/* ---------- front desk ---------- */
const ADMIN_COLS = `m.id, m.user_id, sp.member_no, sp.full_name, m.student_package_id, pd.name AS package_name, pd.lessons IS NULL AS unlimited, sp.age_group,
                    sp.dojo_id, m.kind, m.days_requested, m.days_granted, m.document_ref, m.status, m.exception_id, m.requested_at, m.decided_at, m.decision_note,
                    sk.expires_at, sk.status AS package_status, sk.lessons_left, sk.lessons_total, dec.full_name AS decided_by_name`;
const ADMIN_FROM = `FROM mc_request m JOIN student_profile sp ON sp.user_id = m.user_id JOIN student_package sk ON sk.id = m.student_package_id
                    JOIN package_def pd ON pd.id = sk.package_id LEFT JOIN staff_profile dec ON dec.user_id = m.decided_by`;
const listAdmin = db => query(
  `SELECT ${ADMIN_COLS} ${ADMIN_FROM} ORDER BY (m.status = 'pending') DESC, COALESCE(m.decided_at, m.requested_at) DESC, m.id DESC`, [], db).then(r => r.rows);
const getAdmin = (id, db, lock = false) => query(`SELECT ${ADMIN_COLS} ${ADMIN_FROM} WHERE m.id = $1${lock ? ' FOR UPDATE OF m' : ''}`, [id], db).then(r => r.rows[0] || null);
const decide = (id, status, days, by, at, note, db) => query(
  `UPDATE mc_request SET status = $2, days_granted = $3, decided_by = $4, decided_at = $5, decision_note = $6 WHERE id = $1 AND status = 'pending'`, [id, status, days, by, at, note || null], db).then(r => r.rowCount > 0);
const linkException = (id, exceptionId, db) => query(`UPDATE mc_request SET exception_id = $2 WHERE id = $1`, [id, exceptionId], db);
const byException = (exceptionId, db) => query(`SELECT id FROM mc_request WHERE exception_id = $1 AND status = 'pending' LIMIT 1`, [exceptionId], db).then(r => r.rows[0] || null);
const pendingCount = db => query(`SELECT count(*)::int AS n FROM mc_request WHERE status = 'pending'`, [], db).then(r => r.rows[0].n);
module.exports = { listForUser, pendingForPackage, insert, deletePending, listAdmin, getAdmin, decide, linkException, byException, pendingCount };
