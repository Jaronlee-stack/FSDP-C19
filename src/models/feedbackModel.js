'use strict';
/* Anonymous class ratings. class_feedback has no student column: it records only the lesson, instructor, rating and text.
   class_feedback_prompt records only THAT a student answered, so the pop-up is not shown twice. */
const { query } = require('../config/db');

const insertAnonymous = (f, db) => query(
  `INSERT INTO class_feedback (id, lesson_id, instructor_id, rating, tags, note, created_at)
   SELECT $1::varchar, s.lesson_id, s.instructor_id, $3::smallint, $4::text[], $5::text, $6::timestamptz FROM class_session s WHERE s.lesson_id = $2`,
  [f.id, f.lessonId, f.rating, f.tags, f.note, f.at], db).then(r => r.rowCount > 0);

const promptState = (lessonId, userId, db) => query(
  `SELECT state FROM class_feedback_prompt WHERE lesson_id = $1 AND user_id = $2`, [lessonId, userId], db).then(r => (r.rows[0] ? r.rows[0].state : null));
const insertPrompt = (lessonId, userId, state, at, db) => query(
  `INSERT INTO class_feedback_prompt (lesson_id, user_id, state, created_at) VALUES ($1, $2, $3, $4)`, [lessonId, userId, state, at], db);

/* attended classes since `since` that the student has not rated or skipped yet */
const rateQueue = (userId, since, today, nowHm, db) => query(
  `SELECT s.lesson_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time, s.class_type, i.full_name AS instructor_name
     FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id JOIN instructor_profile i ON i.user_id = s.instructor_id
    WHERE a.user_id = $1 AND a.attendance_status = 'Attended' AND s.session_date >= $2
      AND (s.session_date < $3 OR (s.session_date = $3 AND s.end_time <= $4::time))
      AND NOT EXISTS (SELECT 1 FROM class_feedback_prompt p WHERE p.lesson_id = a.lesson_id AND p.user_id = a.user_id)
    ORDER BY s.session_date, s.start_time`, [userId, since, today, nowHm], db).then(r => r.rows);

/* ---------- instructor summary: aggregates and the comment list only. There is no student column to return. ---------- */
const summaryFor = (instructorId, db) => query(
  `SELECT count(*)::int AS n, COALESCE(avg(rating), 0)::float AS avg,
          count(*) FILTER (WHERE rating = 5)::int AS r5, count(*) FILTER (WHERE rating = 4)::int AS r4, count(*) FILTER (WHERE rating = 3)::int AS r3,
          count(*) FILTER (WHERE rating = 2)::int AS r2, count(*) FILTER (WHERE rating = 1)::int AS r1
     FROM class_feedback WHERE instructor_id = $1`, [instructorId], db).then(r => r.rows[0]);
const tagCounts = (instructorId, db) => query(
  `SELECT t AS tag, count(*)::int AS n FROM class_feedback f, unnest(f.tags) AS t WHERE f.instructor_id = $1 GROUP BY t ORDER BY n DESC, t LIMIT 8`, [instructorId], db).then(r => r.rows);
const recentFor = (instructorId, limit, db) => query(
  `SELECT f.rating, f.tags, f.note, f.created_at, s.class_type FROM class_feedback f JOIN class_session s ON s.lesson_id = f.lesson_id
    WHERE f.instructor_id = $1 ORDER BY f.created_at DESC, f.id DESC LIMIT $2`, [instructorId, limit], db).then(r => r.rows);
const countSince = (instructorId, since, db) => query(
  `SELECT count(*)::int AS n FROM class_feedback WHERE instructor_id = $1 AND created_at >= $2`, [instructorId, since], db).then(r => r.rows[0].n);
module.exports = { insertAnonymous, promptState, insertPrompt, rateQueue, summaryFor, tagCounts, recentFor, countSince };
