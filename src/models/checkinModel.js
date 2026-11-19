'use strict';
/* check_in: one row each time a scan was accepted, kept as an audit trail next to the attendance row. */
const { query } = require('../config/db');

/* this student's classes at one dojo on one day that are still on: still Booked, or already Attended (so a second scan is not an error) */
const bookingsAtDojoOn = (userId, dojoId, day, db) => query(
  `SELECT a.lesson_id, a.attendance_status, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time
     FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE a.user_id = $1 AND s.dojo_id = $2 AND s.session_date = $3 AND s.status = 'Scheduled'
      AND a.attendance_status IN ('Booked', 'Attended')
    ORDER BY s.start_time`, [userId, dojoId, day], db).then(r => r.rows);

/* a venue's classes today that this student may attend: the weekly class they are enrolled in, or a make-up booked into that day's session.
   via is how they get in ('roster' | 'make-up'); attendance_status is their row there, if any */
const venueClassesOn = (userId, dojoId, day, db) => query(
  `SELECT s.lesson_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, a.attendance_status,
          CASE WHEN m.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class_enrollment e WHERE e.user_id = $1 AND e.template_id = s.template_id)
               THEN 'make-up' ELSE 'roster' END AS via,
          m.id AS makeup_id
     FROM class_session s
     LEFT JOIN class_attendance a ON a.lesson_id = s.lesson_id AND a.user_id = $1
     LEFT JOIN makeup_class m ON m.makeup_lesson_id = s.lesson_id AND m.user_id = $1 AND m.status = 'Pending'
    WHERE s.dojo_id = $2 AND s.session_date = $3 AND s.status = 'Scheduled'
      AND (EXISTS (SELECT 1 FROM class_enrollment e WHERE e.user_id = $1 AND e.template_id = s.template_id) OR m.id IS NOT NULL)
    ORDER BY s.start_time`, [userId, dojoId, day], db).then(r => r.rows);

/* the venue attendance row for a student who scanned in: created on first scan, a Cancelled row is reused */
const addVenueAttendance = (userId, lessonId, via, at, db) => query(
  `INSERT INTO class_attendance (lesson_id, user_id, attendance_status, booked_at, booked_via)
   VALUES ($1, $2, 'Booked', $3, $4)
   ON CONFLICT (lesson_id, user_id) DO UPDATE
      SET attendance_status = 'Booked', booked_at = EXCLUDED.booked_at, booked_via = EXCLUDED.booked_via, marked_by = NULL, marked_at = NULL
    WHERE class_attendance.attendance_status = 'Cancelled'`, [lessonId, userId, at, via], db);

const useMakeup = (makeupId, db) => query(`UPDATE makeup_class SET status = 'Used' WHERE id = $1 AND status = 'Pending'`, [makeupId], db);

const insert = (c, db) => query(
  `INSERT INTO check_in (id, user_id, dojo_id, lesson_id, checked_in_at, method) VALUES ($1, $2, $3, $4, $5, 'qr')`,
  [c.id, c.userId, c.dojoId, c.lessonId, c.at], db);

module.exports = { bookingsAtDojoOn, venueClassesOn, addVenueAttendance, useMakeup, insert };
