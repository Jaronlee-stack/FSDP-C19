'use strict';
/* guest_profile + guest_pass (trial and guest-pass visitors). Guests are users with role 'guest' and cannot sign in. */
const { query } = require('../config/db');

const insertProfile = (g, db) => query(
  `INSERT INTO guest_profile (user_id, full_name, contact_no, trial_status) VALUES ($1, $2, $3, 'Pending')`, [g.userId, g.fullName, g.contactNo], db);
const updateContact = (userId, fullName, contactNo, db) => query(
  `UPDATE guest_profile SET full_name = $2, contact_no = $3 WHERE user_id = $1`, [userId, fullName, contactNo], db);

const insertPass = (p, db) => query(
  `INSERT INTO guest_pass (id, user_id, pass_type, amount_paid, used, issued_at, valid_until) VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
  [p.id, p.userId, p.passType, p.amount, p.at, p.validUntil], db);

const hasTrial = (userId, db) => query(`SELECT 1 FROM guest_pass WHERE user_id = $1 AND pass_type = 'trial'`, [userId], db).then(r => r.rowCount > 0);

/* ---------- front desk (walk-ins) ---------- */
/* every guest with their newest pass. The mobile/email are only for the desk. */
const listWithPass = db => query(
  `SELECT g.user_id, g.full_name, g.contact_no, g.trial_status, u.email, p.id AS pass_id, p.pass_type, p.used, p.valid_until, p.issued_at
     FROM guest_profile g JOIN users u ON u.id = g.user_id
     LEFT JOIN LATERAL (SELECT * FROM guest_pass x WHERE x.user_id = g.user_id ORDER BY x.issued_at DESC, x.id DESC LIMIT 1) p ON TRUE
    ORDER BY g.full_name, g.user_id`, [], db).then(r => r.rows);
/* the passes of one guest that could let them in on a class day: a trial or single pass that is not used, or a timed pass that covers the day */
const usablePass = (userId, day, db, lock = false) => query(
  `SELECT id, pass_type, used, valid_until FROM guest_pass
    WHERE user_id = $1 AND ((pass_type IN ('trial', 'single') AND NOT used) OR (pass_type IN ('day', 'week', 'month') AND valid_until >= $2::date))
    ORDER BY issued_at DESC, id DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId, day], db).then(r => r.rows[0] || null);
const markPassUsed = (passId, db) => query(`UPDATE guest_pass SET used = TRUE WHERE id = $1`, [passId], db);
const exists = (userId, db) => query(`SELECT 1 FROM guest_profile WHERE user_id = $1`, [userId], db).then(r => r.rowCount > 0);
/* a guest with this mobile number (spaces and signs ignored) */
const findByMobile = (digits, db) => query(
  `SELECT g.user_id, g.full_name, (SELECT bool_or(x.used) FROM guest_pass x WHERE x.user_id = g.user_id AND x.pass_type = 'trial') AS trial_used
     FROM guest_profile g WHERE regexp_replace(COALESCE(g.contact_no, ''), '[^0-9]', '', 'g') = $1 LIMIT 1`, [digits], db).then(r => r.rows[0] || null);
const setTrialStatus = (userId, status, db) => query(`UPDATE guest_profile SET trial_status = $2 WHERE user_id = $1`, [userId, status], db);
module.exports = { insertProfile, updateContact, insertPass, hasTrial, listWithPass, usablePass, markPassUsed, exists, findByMobile, setTrialStatus };
