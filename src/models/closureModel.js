'use strict';
/* class_closure and the lessons a closure cancels. Students and the desk read closures; the Business Admin writes them. */
const { query } = require('../config/db');
/* closures of a dojo that touch the date range */
const listOverlapping = (dojoId, from, to, db) => query(
  `SELECT id, dojo_id, from_date, to_date, note FROM class_closure
    WHERE dojo_id = $1 AND from_date <= $3 AND to_date >= $2 ORDER BY from_date`, [dojoId, from, to], db).then(r => r.rows);
/* closures of every dojo that touch the date range */
const overlapping = (from, to, db) => query(
  `SELECT id, dojo_id, from_date, to_date, note FROM class_closure WHERE from_date <= $2 AND to_date >= $1 ORDER BY from_date`, [from, to], db).then(r => r.rows);

/* ---------- Business Admin ---------- */
/* every closure with how many bookings it cancelled (counted from the booking rows it cancelled, see cancelBookings) */
const listAll = db => query(
  `SELECT c.id, c.dojo_id, d.name AS dojo_name, c.from_date, c.to_date, c.note,
          (SELECT count(*) FROM class_session s WHERE s.closure_id = c.id)::int AS sessions,
          (SELECT count(*) FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
            WHERE s.closure_id = c.id AND starts_with(COALESCE(a.remarks, ''), 'Cancelled by closure ' || c.id || ';'))::int AS students,
          (SELECT count(*) FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
            WHERE s.closure_id = c.id AND starts_with(COALESCE(a.remarks, ''), 'Cancelled by closure ' || c.id || '; lesson returned'))::int AS lessons
     FROM class_closure c JOIN dojo d ON d.id = c.dojo_id ORDER BY c.from_date DESC, c.id DESC`, [], db).then(r => r.rows);
const get = (id, db, lock = false) => query(
  `SELECT id, dojo_id, from_date, to_date, note FROM class_closure WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id], db).then(r => r.rows[0] || null);
const insert = (c, db) => query(
  `INSERT INTO class_closure (id, dojo_id, from_date, to_date, note) VALUES ($1, $2, $3, $4, $5)`, [c.id, c.dojoId, c.from, c.to, c.note || null], db);
const remove = (id, db) => query(`DELETE FROM class_closure WHERE id = $1`, [id], db).then(r => r.rowCount > 0);

/* the lessons a closure would cancel: not yet ended or cancelled, in the dojo and date range. Locked so a booking cannot slip in. */
const lessonsInRange = (dojoId, from, to, db, lock = false) => query(
  `SELECT s.lesson_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, s.class_type
     FROM class_session s WHERE s.dojo_id = $1 AND s.session_date BETWEEN $2::date AND $3::date AND s.status = 'Scheduled'
    ORDER BY s.session_date, s.start_time, s.lesson_id${lock ? ' FOR UPDATE OF s' : ''}`, [dojoId, from, to], db).then(r => r.rows);
/* students (and guests) with a live booking on a lesson, with the package that paid for it */
const bookedOn = (lessonId, db) => query(
  `SELECT a.user_id, a.student_package_id, sp.full_name, (g.user_id IS NOT NULL) AS is_guest, COALESCE(sp.full_name, g.full_name) AS name
     FROM class_attendance a LEFT JOIN student_profile sp ON sp.user_id = a.user_id LEFT JOIN guest_profile g ON g.user_id = a.user_id
    WHERE a.lesson_id = $1 AND a.attendance_status = 'Booked' ORDER BY COALESCE(sp.full_name, g.full_name), a.user_id`, [lessonId], db).then(r => r.rows);
/* mark a lesson Cancelled (closure_id is null for a single cancelled class) */
const cancelLesson = (lessonId, closureId, db) => query(
  `UPDATE class_session SET status = 'Cancelled', closure_id = $2 WHERE lesson_id = $1 AND status = 'Scheduled'`, [lessonId, closureId], db).then(r => r.rowCount > 0);
/* the booking row of one person, cancelled with a note that says why and whether the lesson came back */
const cancelBooking = (lessonId, userId, note, db) => query(
  `UPDATE class_attendance SET attendance_status = 'Cancelled', remarks = $3 WHERE lesson_id = $1 AND user_id = $2 AND attendance_status = 'Booked'`, [lessonId, userId, note], db).then(r => r.rowCount > 0);
/* deleting a closure reopens the lessons it cancelled (bookings that were cancelled stay cancelled, their lessons stay returned) */
const reopenLessons = (closureId, db) => query(
  `UPDATE class_session SET status = 'Scheduled', closure_id = NULL WHERE closure_id = $1 AND status = 'Cancelled' RETURNING lesson_id`, [closureId], db).then(r => r.rows);
/* cancelled single classes (no closure) from `since` on */
const cancelledClasses = (since, db) => query(
  `SELECT s.lesson_id, s.dojo_id, d.name AS dojo_name, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, s.class_type,
          (SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND starts_with(COALESCE(a.remarks, ''), 'Cancelled class;'))::int AS students,
          (SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND starts_with(COALESCE(a.remarks, ''), 'Cancelled class; lesson returned'))::int AS lessons
     FROM class_session s JOIN dojo d ON d.id = s.dojo_id
    WHERE s.status = 'Cancelled' AND s.closure_id IS NULL AND s.session_date >= $1::date ORDER BY s.session_date DESC, s.start_time DESC, s.lesson_id`, [since], db).then(r => r.rows);
const lessonForCancel = (lessonId, db, lock = false) => query(
  `SELECT s.lesson_id, s.dojo_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, s.class_type, s.status
     FROM class_session s WHERE s.lesson_id = $1${lock ? ' FOR UPDATE OF s' : ''}`, [lessonId], db).then(r => r.rows[0] || null);
module.exports = {
  listOverlapping, overlapping, listAll, get, insert, remove, lessonsInRange, bookedOn, cancelLesson, cancelBooking, reopenLessons, cancelledClasses, lessonForCancel
};
