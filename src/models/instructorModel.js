'use strict';
/* instructor_profile and the people an instructor teaches. Never selects password_hash. */
const { query } = require('../config/db');
const getProfile = (userId, db) => query(
  `SELECT user_id, full_name, dan_grade, photo_file, is_chief FROM instructor_profile WHERE user_id = $1`, [userId], db).then(r => r.rows[0] || null);
/* weekly classes on the timetable (including one-to-one lessons) */
const countTemplates = (userId, db) => query(`SELECT count(*)::int AS n FROM class_template WHERE instructor_id = $1`, [userId], db).then(r => r.rows[0].n);
/* seats filled over the classes already held in the date window (cancelled classes do not count) */
const fillSince = (userId, since, today, db) => query(
  `SELECT COALESCE(sum(s.capacity), 0)::int AS cap,
          COALESCE(sum((SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.attendance_status IN ('Booked', 'Attended', 'No-Show'))), 0)::int AS taken
     FROM class_session s LEFT JOIN class_template t ON t.id = s.template_id
    WHERE s.instructor_id = $1 AND s.status <> 'Cancelled' AND s.session_date >= $2 AND s.session_date <= $3 AND NOT COALESCE(t.is_private, FALSE)`,
  [userId, since, today], db).then(r => r.rows[0]);
/* students who booked or attended one of this instructor's classes, with the figures the roster drawer shows.
   `today` is passed in so the fake-date setting stays consistent. */
const studentsOf = (userId, today, db) => query(
  `SELECT sp.user_id, sp.member_no, sp.full_name, sp.rank_id, br.name AS rank_name, sp.joined_on, sp.accumulated_hours,
          COALESCE(m.account_status, 'Active') AS account_status,
          (SELECT max(s2.session_date) FROM class_attendance a2 JOIN class_session s2 ON s2.lesson_id = a2.lesson_id
            WHERE a2.user_id = sp.user_id AND a2.attendance_status = 'Attended') AS last_seen,
          (EXISTS (SELECT 1 FROM grading_application ga LEFT JOIN grading_session gs ON gs.id = ga.session_id
                    WHERE ga.user_id = sp.user_id AND (ga.status = 'Submitted' OR (ga.status = 'Approved' AND gs.session_date >= $2)))
           OR EXISTS (SELECT 1 FROM grading_candidate gc JOIN grading_session gs2 ON gs2.id = gc.session_id
                       WHERE gc.user_id = sp.user_id AND gc.result = 'Pending' AND gs2.status <> 'Cancelled')) AS going_for_grading
     FROM student_profile sp
     JOIN belt_rank br ON br.id = sp.rank_id
     LEFT JOIN membership m ON m.user_id = sp.user_id
    WHERE sp.user_id IN (SELECT a.user_id FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
                          WHERE s.instructor_id = $1 AND a.attendance_status <> 'Cancelled')
    ORDER BY sp.full_name, sp.user_id`, [userId, today], db).then(r => r.rows);
/* is this person one of the instructor's students (booked or attended a class of theirs)? */
const teaches = (instructorId, studentId, db) => query(
  `SELECT 1 FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE s.instructor_id = $1 AND a.user_id = $2 AND a.attendance_status <> 'Cancelled' LIMIT 1`, [instructorId, studentId], db).then(r => r.rowCount > 0);
module.exports = { getProfile, countTemplates, fillSince, studentsOf, teaches };
