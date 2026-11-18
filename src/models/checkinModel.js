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

const insert = (c, db) => query(
  `INSERT INTO check_in (id, user_id, dojo_id, lesson_id, checked_in_at, method) VALUES ($1, $2, $3, $4, $5, 'qr')`,
  [c.id, c.userId, c.dojoId, c.lessonId, c.at], db);

module.exports = { bookingsAtDojoOn, insert };
