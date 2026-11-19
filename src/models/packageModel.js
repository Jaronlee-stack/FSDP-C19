'use strict';
/* package_def and student_package. */
const { query } = require('../config/db');

const getDef = (id, db) => query(
  `SELECT id, name, audience, price, billing_unit, lessons, valid_days, valid_months, description, compassion_eligible, is_active
     FROM package_def WHERE id = $1`, [id], db).then(r => r.rows[0] || null);

/* bought packages are kept honest by this sweep: nothing left -> 'Used up', past its date -> 'Expired' */
async function sweep(userId, today, db) {
  await query(`UPDATE student_package SET status = 'Used up' WHERE user_id = $1 AND status = 'Active' AND lessons_left = 0`, [userId], db);
  await query(`UPDATE student_package SET status = 'Expired' WHERE user_id = $1 AND status = 'Active' AND expires_at < $2`, [userId, today], db);
}

const PACK_COLS = `sp.id, sp.package_id, sp.lessons_total, sp.lessons_left, sp.purchased_at, sp.expires_at, sp.status,
                   pd.name, pd.lessons IS NULL AS unlimited, pd.compassion_eligible`;

/* Active packs of a student (call sweep first) */
const listActive = (userId, db) => query(
  `SELECT ${PACK_COLS} FROM student_package sp JOIN package_def pd ON pd.id = sp.package_id
    WHERE sp.user_id = $1 AND sp.status = 'Active' ORDER BY sp.expires_at, sp.id`, [userId], db).then(r => r.rows);

const getOwn = (id, userId, db, lock = false) => query(
  `SELECT ${PACK_COLS} FROM student_package sp JOIN package_def pd ON pd.id = sp.package_id
    WHERE sp.id = $1 AND sp.user_id = $2${lock ? ' FOR UPDATE OF sp' : ''}`, [id, userId], db).then(r => r.rows[0] || null);

/* the pack that pays for a class on `date`: an Unlimited plan first, else the lesson pack that expires first. Locks the row. */
const pickCredit = (userId, date, db) => query(
  `SELECT sp.id, sp.lessons_left, sp.lessons_total, sp.expires_at, pd.name, pd.lessons IS NULL AS unlimited
     FROM student_package sp JOIN package_def pd ON pd.id = sp.package_id
    WHERE sp.user_id = $1 AND sp.status = 'Active' AND sp.purchased_at <= $2 AND sp.expires_at >= $2
      AND (pd.lessons IS NULL OR sp.lessons_left > 0)
    ORDER BY (pd.lessons IS NULL) DESC, sp.expires_at, sp.id
    LIMIT 1 FOR UPDATE OF sp`, [userId, date], db).then(r => r.rows[0] || null);

/* take one lesson. A pack that reaches 0 becomes 'Used up'. */
const useLesson = (id, db) => query(
  `UPDATE student_package SET lessons_left = lessons_left - 1,
          status = CASE WHEN lessons_left - 1 = 0 THEN 'Used up' ELSE status END
    WHERE id = $1 AND lessons_left > 0`, [id], db);
/* give one lesson back (never above the pack size). A 'Used up' pack that has not expired comes back to life. */
const returnLesson = (id, today, db) => query(
  `UPDATE student_package SET lessons_left = lessons_left + 1,
          status = CASE WHEN status = 'Used up' AND expires_at >= $2 THEN 'Active' ELSE status END
    WHERE id = $1 AND lessons_left IS NOT NULL AND lessons_left < lessons_total`, [id, today], db);

const insert = (p, db) => query(
  `INSERT INTO student_package (id, user_id, package_id, lessons_total, lessons_left, purchased_at, expires_at, status)
   VALUES ($1, $2, $3, $4, $4, $5, $6, 'Active')`, [p.id, p.userId, p.packageId, p.lessonsTotal, p.purchasedAt, p.expiresAt], db);

/* ---------- front desk ---------- */
const getById = (id, db, lock = false) => query(
  `SELECT ${PACK_COLS}, sp.user_id FROM student_package sp JOIN package_def pd ON pd.id = sp.package_id WHERE sp.id = $1${lock ? ' FOR UPDATE OF sp' : ''}`, [id], db).then(r => r.rows[0] || null);
/* an approved medical certificate moves the end date */
const extendExpiry = (id, newExpiry, db) => query(`UPDATE student_package SET expires_at = $2 WHERE id = $1`, [id, newExpiry], db);
/* a refunded or voided package can no longer be used: its lessons are cancelled, so it stops counting toward the 2-package limit */
const retire = (id, db) => query(
  `UPDATE student_package SET status = 'Expired', lessons_left = CASE WHEN lessons_left IS NULL THEN NULL ELSE 0 END WHERE id = $1`, [id], db);

/* ---------- Business Admin: prices ---------- */
const listAllDefs = db => query(
  `SELECT id, name, audience, price, billing_unit, lessons, valid_days, valid_months, is_active FROM package_def ORDER BY audience, price, id`, [], db).then(r => r.rows);
const updateDef = (id, { price, isActive }, db) => query(
  `UPDATE package_def SET price = COALESCE($2, price), is_active = COALESCE($3, is_active) WHERE id = $1`,
  [id, price === undefined ? null : price, isActive === undefined ? null : isActive], db).then(r => r.rowCount > 0);
module.exports = { getDef, sweep, listActive, getOwn, pickCredit, useLesson, returnLesson, insert, getById, extendExpiry, retire, listAllDefs, updateDef };
