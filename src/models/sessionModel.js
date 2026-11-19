'use strict';
/* class_session (dated lessons) with seats taken. HQ bookable lessons only for the student and public views. */
const { query } = require('../config/db');

const TAKEN = `(SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.attendance_status IN ('Booked', 'Attended', 'No-Show'))`;
const COLS = `s.lesson_id, s.template_id, s.dojo_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time,
              s.class_type, s.capacity, s.status, i.full_name AS instructor_name,
              COALESCE(t.kids_only, s.class_type LIKE 'Children%') AS kids_only,
              COALESCE(t.online_bookable, TRUE) AS online_bookable, COALESCE(t.is_private, FALSE) AS is_private,
              ${TAKEN}::int AS taken`;
const FROM = `FROM class_session s JOIN instructor_profile i ON i.user_id = s.instructor_id LEFT JOIN class_template t ON t.id = s.template_id`;

/* one lesson, locked so that two bookings cannot both take the last seat */
const getForBooking = (lessonId, db) => query(`SELECT ${COLS} ${FROM} WHERE s.lesson_id = $1 FOR UPDATE OF s`, [lessonId], db).then(r => r.rows[0] || null);
const getById = (lessonId, db) => query(`SELECT ${COLS} ${FROM} WHERE s.lesson_id = $1`, [lessonId], db).then(r => r.rows[0] || null);

/* HQ lessons in a date range that can be booked online, with this student's own status on each */
const listHqRange = (from, to, userId, db) => query(
  `SELECT ${COLS}, (SELECT a.attendance_status FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.user_id = $3) AS my_status
     ${FROM}
    WHERE s.dojo_id = 'hq' AND s.session_date BETWEEN $1 AND $2 AND NOT COALESCE(t.is_private, FALSE) AND COALESCE(t.online_bookable, TRUE)
    ORDER BY s.session_date, s.start_time, s.lesson_id`, [from, to, userId], db).then(r => r.rows);

/* the same for a public visitor (no student) */
const listHqDay = (day, db) => query(
  `SELECT ${COLS} ${FROM}
    WHERE s.dojo_id = 'hq' AND s.session_date = $1 AND s.status = 'Scheduled' AND NOT COALESCE(t.is_private, FALSE) AND COALESCE(t.online_bookable, TRUE)
    ORDER BY s.start_time, s.lesson_id`, [day], db).then(r => r.rows);

/* ---------- instructor side ---------- */
const INS_COLS = `s.lesson_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time, s.mat, s.class_type,
              s.dojo_id, d.name AS dojo_name, s.capacity, s.status, s.ended_at, s.instructor_id,
              COALESCE(t.is_private, FALSE) AS is_private, ps.full_name AS private_student, ${TAKEN}::int AS taken`;
const INS_FROM = `FROM class_session s JOIN dojo d ON d.id = s.dojo_id LEFT JOIN class_template t ON t.id = s.template_id
              LEFT JOIN student_profile ps ON ps.user_id = t.private_student_id`;
/* the instructor's own lessons in a date range (cancelled ones are left out) */
const listForInstructor = (instructorId, from, to, db) => query(
  `SELECT ${INS_COLS} ${INS_FROM}
    WHERE s.instructor_id = $1 AND s.session_date BETWEEN $2 AND $3 AND s.status <> 'Cancelled'
    ORDER BY s.session_date, s.start_time, s.lesson_id`, [instructorId, from, to], db).then(r => r.rows);
/* one lesson by id (no owner filter: the service compares instructor_id and answers 403 NOT_YOUR_CLASS) */
const getForInstructor = (lessonId, db, lock = false) => query(
  `SELECT ${INS_COLS} ${INS_FROM} WHERE s.lesson_id = $1${lock ? ' FOR UPDATE OF s' : ''}`, [lessonId], db).then(r => r.rows[0] || null);
const markEnded = (lessonId, at, db) => query(
  `UPDATE class_session SET status = 'Ended', ended_at = $2 WHERE lesson_id = $1 AND status = 'Scheduled'`, [lessonId, at], db).then(r => r.rowCount > 0);
/* ---------- front desk ---------- */
const DESK_COLS = `s.lesson_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time, s.mat, s.class_type,
              s.dojo_id, d.name AS dojo_name, s.capacity, s.status, s.ended_at, s.instructor_id, i.full_name AS instructor_name,
              COALESCE(t.kids_only, s.class_type LIKE 'Children%') AS kids_only, COALESCE(t.is_private, FALSE) AS is_private,
              ${TAKEN}::int AS taken,
              (SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.attendance_status = 'Attended')::int AS present,
              (SELECT count(*) FROM class_attendance a JOIN guest_profile g ON g.user_id = a.user_id WHERE a.lesson_id = s.lesson_id AND a.attendance_status <> 'Cancelled')::int AS guests,
              (SELECT count(*) FROM class_waitlist w WHERE w.lesson_id = s.lesson_id)::int AS waitlist`;
const DESK_FROM = `FROM class_session s JOIN dojo d ON d.id = s.dojo_id JOIN instructor_profile i ON i.user_id = s.instructor_id LEFT JOIN class_template t ON t.id = s.template_id`;
/* the lessons of one dojo in a date range, for the Classes page and the Today page */
const listDesk = (dojoId, from, to, db) => query(
  `SELECT ${DESK_COLS} ${DESK_FROM} WHERE s.dojo_id = $1 AND s.session_date BETWEEN $2 AND $3 ORDER BY s.session_date, s.start_time, s.lesson_id`, [dojoId, from, to], db).then(r => r.rows);
/* one lesson, locked when the caller is about to change its roster */
const getDesk = (lessonId, db, lock = false) => query(
  `SELECT ${DESK_COLS} ${DESK_FROM} WHERE s.lesson_id = $1${lock ? ' FOR UPDATE OF s' : ''}`, [lessonId], db).then(r => r.rows[0] || null);

module.exports = { getForBooking, getById, listHqRange, listHqDay, listForInstructor, getForInstructor, markEnded, listDesk, getDesk };
