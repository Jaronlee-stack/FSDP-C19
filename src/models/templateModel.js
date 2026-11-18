'use strict';
/* class_template (the weekly plan) and the dated class_session rows made from it. The clash checks follow the view v_grading_conflict. */
const { query } = require('../config/db');
const COLS = `t.id, t.code, t.dojo_id, d.name AS dojo_name, t.weekday, to_char(t.start_time, 'HH24:MI') AS start_time, to_char(t.end_time, 'HH24:MI') AS end_time,
              t.mat, t.class_type, t.instructor_id, i.full_name AS instructor_name, t.capacity, t.kids_only, t.online_bookable, t.is_private`;
const FROM = `FROM class_template t JOIN dojo d ON d.id = t.dojo_id JOIN instructor_profile i ON i.user_id = t.instructor_id`;
/* the weekly classes, private lessons left out, with how many seats the next dated lesson has taken */
const list = (dojoId, today, db) => query(
  `SELECT ${COLS},
          (SELECT s.lesson_id FROM class_session s WHERE s.template_id = t.id AND s.session_date >= $2::date AND s.status = 'Scheduled' ORDER BY s.session_date, s.start_time LIMIT 1) AS next_lesson,
          (SELECT s.session_date FROM class_session s WHERE s.template_id = t.id AND s.session_date >= $2::date AND s.status = 'Scheduled' ORDER BY s.session_date, s.start_time LIMIT 1) AS next_date,
          (SELECT count(*) FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
            WHERE s.lesson_id = (SELECT s2.lesson_id FROM class_session s2 WHERE s2.template_id = t.id AND s2.session_date >= $2::date AND s2.status = 'Scheduled' ORDER BY s2.session_date, s2.start_time LIMIT 1)
              AND a.attendance_status IN ('Booked', 'Attended', 'No-Show'))::int AS next_booked
     ${FROM} WHERE NOT t.is_private AND ($1::text IS NULL OR t.dojo_id = $1) ORDER BY t.dojo_id = 'hq' DESC, t.dojo_id, t.weekday, t.start_time, t.id`, [dojoId, today], db).then(r => r.rows);
const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE t.id = $1${lock ? ' FOR UPDATE OF t' : ''}`, [id], db).then(r => r.rows[0] || null);
const codeTaken = (code, db) => query(`SELECT 1 FROM class_template WHERE code = $1`, [code], db).then(r => r.rowCount > 0);
const insert = (t, db) => query(
  `INSERT INTO class_template (id, code, dojo_id, weekday, start_time, end_time, mat, class_type, instructor_id, capacity, kids_only, is_private, online_bookable)
   VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10, $11, FALSE, $12)`,
  [t.id, t.code, t.dojoId, t.weekday, t.start, t.end, t.mat, t.type, t.instructorId, t.capacity, t.kidsOnly, t.onlineBookable], db);
const update = (id, t, db) => query(
  `UPDATE class_template SET dojo_id = $2, weekday = $3, start_time = $4::time, end_time = $5::time, mat = $6, class_type = $7, instructor_id = $8,
          capacity = $9, kids_only = $10, online_bookable = $11 WHERE id = $1`,
  [id, t.dojoId, t.weekday, t.start, t.end, t.mat, t.type, t.instructorId, t.capacity, t.kidsOnly, t.onlineBookable], db);
const remove = (id, db) => query(`DELETE FROM class_template WHERE id = $1`, [id], db).then(r => r.rowCount > 0);

/* ---------- clashes (all weekly classes, private lessons included, except `selfId`) ---------- */
/* the same instructor teaching another class at an overlapping time on that weekday */
const instructorClash = (c, db) => query(
  `SELECT t.id, t.class_type, to_char(t.start_time, 'HH24:MI') AS start_time FROM class_template t
    WHERE t.id <> $5 AND t.instructor_id = $1 AND t.weekday = $2 AND t.start_time < $4::time AND $3::time < t.end_time LIMIT 1`,
  [c.instructorId, c.weekday, c.start, c.end, c.selfId || ''], db).then(r => r.rows[0] || null);
/* another class on the same mat of the same dojo at an overlapping time */
const matClash = (c, db) => query(
  `SELECT t.id, t.class_type, to_char(t.start_time, 'HH24:MI') AS start_time FROM class_template t
    WHERE t.id <> $6 AND t.dojo_id = $1 AND t.mat = $2 AND t.weekday = $3 AND t.start_time < $5::time AND $4::time < t.end_time LIMIT 1`,
  [c.dojoId, c.mat, c.weekday, c.start, c.end, c.selfId || ''], db).then(r => r.rows[0] || null);
/* a grading day (not cancelled) on that weekday where this instructor examines at an overlapping time (v_grading_conflict: examiner_template) */
const examinerClash = (c, db) => query(
  `SELECT g.id, g.label, g.session_date::text AS day FROM grading_session g JOIN grading_examiner e ON e.session_id = g.id
    WHERE g.status <> 'Cancelled' AND e.instructor_id = $1 AND EXTRACT(ISODOW FROM g.session_date)::int - 1 = $2
      AND $3::time < g.end_time AND g.start_time < $4::time ORDER BY g.session_date LIMIT 1`, [c.instructorId, c.weekday, c.start, c.end], db).then(r => r.rows[0] || null);
/* a grading day at the same dojo (grading is held in the HQ hall) that is not covered by a closure (v_grading_conflict: hq_template_open) */
const hallClash = (c, db) => query(
  `SELECT g.id, g.label, g.session_date::text AS day FROM grading_session g
    WHERE g.status <> 'Cancelled' AND g.dojo_id = $1 AND EXTRACT(ISODOW FROM g.session_date)::int - 1 = $2
      AND $3::time < g.end_time AND g.start_time < $4::time
      AND NOT EXISTS (SELECT 1 FROM class_closure k WHERE k.dojo_id = g.dojo_id AND g.session_date BETWEEN k.from_date AND k.to_date)
    ORDER BY g.session_date LIMIT 1`, [c.dojoId, c.weekday, c.start, c.end], db).then(r => r.rows[0] || null);

/* ---------- the dated lessons ---------- */
/* one dated lesson of a template. A lesson that already exists (same id) is left alone. */
const insertLesson = (s, db) => query(
  `INSERT INTO class_session (lesson_id, template_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity, status, closure_id)
   VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, $9, $10, $11, $12) ON CONFLICT (lesson_id) DO NOTHING`,
  [s.lessonId, s.templateId, s.dojoId, s.date, s.start, s.end, s.mat, s.type, s.instructorId, s.capacity, s.status, s.closureId || null], db).then(r => r.rowCount > 0);
/* upcoming lessons of a template (Scheduled, or cancelled by a closure) with how many live bookings each has */
const upcomingLessons = (templateId, today, db, lock = false) => query(
  `SELECT s.lesson_id, s.session_date, (SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.attendance_status = 'Booked')::int AS booked,
          (SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id)::int AS rows
     FROM class_session s WHERE s.template_id = $1 AND s.session_date >= $2::date AND (s.status = 'Scheduled' OR (s.status = 'Cancelled' AND s.closure_id IS NOT NULL))
    ORDER BY s.session_date, s.start_time${lock ? ' FOR UPDATE OF s' : ''}`, [templateId, today], db).then(r => r.rows);
const deleteLesson = (lessonId, db) => query(`DELETE FROM class_session WHERE lesson_id = $1`, [lessonId], db);
/* the instructor or capacity changed: the upcoming dated lessons follow (the day, time, mat and dojo are not changed here) */
const refreshLessons = (templateId, today, t, db) => query(
  `UPDATE class_session SET instructor_id = $3, capacity = $4, class_type = $5
    WHERE template_id = $1 AND session_date >= $2::date AND status = 'Scheduled'`, [templateId, today, t.instructorId, t.capacity, t.type], db);
const closuresCovering = (dojoId, from, to, db) => query(
  `SELECT id, from_date::text AS from_date, to_date::text AS to_date FROM class_closure WHERE dojo_id = $1 AND from_date <= $3::date AND to_date >= $2::date ORDER BY from_date`, [dojoId, from, to], db).then(r => r.rows);
const activeInstructor = (id, db) => query(`SELECT user_id, full_name FROM instructor_profile WHERE user_id = $1 AND status = 'active'`, [id], db).then(r => r.rows[0] || null);
module.exports = {
  list, get, codeTaken, insert, update, remove, instructorClash, matClash, examinerClash, hallClash, insertLesson, upcomingLessons, deleteLesson,
  refreshLessons, closuresCovering, activeInstructor
};
