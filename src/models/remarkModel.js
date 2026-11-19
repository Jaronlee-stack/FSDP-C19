'use strict';
/* instructor_remark, read by the student the note is for. */
const { query } = require('../config/db');

/* notes for classes the student attended and notes written to the student (kind 'student'). Newest first.
   Grading notes (kind 'grading') are for instructors and examiners only: this query never selects them, so no student endpoint can return one. */
const forStudent = (userId, limit, db) => query(
  `SELECT r.id, r.kind, r.lesson_id, r.body, r.created_at, i.full_name AS instructor_name,
          s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, s.class_type
     FROM instructor_remark r
     JOIN instructor_profile i ON i.user_id = r.instructor_id
     LEFT JOIN class_session s ON s.lesson_id = r.lesson_id
    WHERE (r.kind = 'class' AND EXISTS (SELECT 1 FROM class_attendance a WHERE a.lesson_id = r.lesson_id AND a.user_id = $1 AND a.attendance_status = 'Attended'))
       OR (r.kind = 'student' AND r.student_id = $1)
    ORDER BY r.created_at DESC, r.id DESC LIMIT $2`, [userId, limit], db).then(r => r.rows);

/* ---------- written by the instructor ---------- */
/* one remark per instructor, kind, lesson and student. IS NOT DISTINCT FROM lets lesson / student be NULL. */
const findMine = (r, db) => query(
  `SELECT id, body, created_at FROM instructor_remark
    WHERE instructor_id = $1 AND kind = $2 AND lesson_id IS NOT DISTINCT FROM $3::varchar AND student_id IS NOT DISTINCT FROM $4::varchar FOR UPDATE`,
  [r.instructorId, r.kind, r.lessonId, r.studentId], db).then(x => x.rows[0] || null);
const insert = (r, db) => query(
  `INSERT INTO instructor_remark (id, kind, lesson_id, student_id, instructor_id, body, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [r.id, r.kind, r.lessonId, r.studentId, r.instructorId, r.body, r.at], db);
const update = (id, body, at, db) => query(`UPDATE instructor_remark SET body = $2, created_at = $3 WHERE id = $1`, [id, body, at], db);
const remove = (id, db) => query(`DELETE FROM instructor_remark WHERE id = $1`, [id], db);
/* the class remark of one lesson written by this instructor */
const classRemark = (lessonId, instructorId, db) => query(
  `SELECT body, created_at FROM instructor_remark WHERE kind = 'class' AND lesson_id = $1 AND instructor_id = $2`, [lessonId, instructorId], db).then(r => r.rows[0] || null);
/* grading notes about a student, newest first (read by the examiners) */
const gradingNotesFor = (studentId, limit, db) => query(
  `SELECT r.body, r.created_at, i.full_name AS instructor_name, s.session_date, s.class_type
     FROM instructor_remark r JOIN instructor_profile i ON i.user_id = r.instructor_id LEFT JOIN class_session s ON s.lesson_id = r.lesson_id
    WHERE r.kind = 'grading' AND r.student_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT $2`, [studentId, limit], db).then(r => r.rows);
module.exports = { forStudent, findMine, insert, update, remove, classRemark, gradingNotesFor };
