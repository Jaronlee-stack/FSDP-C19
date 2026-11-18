'use strict';
/* class_attendance: one row per student (or guest) per lesson. Booking and attendance share the row. */
const { query } = require('../config/db');

const getRow = (lessonId, userId, db, lock = false) => query(
  `SELECT a.lesson_id, a.user_id, a.attendance_status, a.student_package_id, a.booked_at,
          s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time, s.status AS session_status
     FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE a.lesson_id = $1 AND a.user_id = $2${lock ? ' FOR UPDATE OF a' : ''}`, [lessonId, userId], db).then(r => r.rows[0] || null);

/* insert a booking. A Cancelled row for the same lesson is reused. Returns false when the student is already booked. */
const book = (b, db) => query(
  `INSERT INTO class_attendance (lesson_id, user_id, attendance_status, student_package_id, booked_at, booked_via, remarks)
   VALUES ($1, $2, 'Booked', $3, $4, $5, $6)
   ON CONFLICT (lesson_id, user_id) DO UPDATE
      SET attendance_status = 'Booked', remarks = EXCLUDED.remarks, student_package_id = EXCLUDED.student_package_id, booked_at = EXCLUDED.booked_at,
          booked_via = EXCLUDED.booked_via, marked_by = NULL, marked_at = NULL
    WHERE class_attendance.attendance_status = 'Cancelled'`, [b.lessonId, b.userId, b.packageId, b.bookedAt, b.via, b.remarks || null], db).then(r => r.rowCount > 0);

const cancel = (lessonId, userId, remarks, db) => query(
  `UPDATE class_attendance SET attendance_status = 'Cancelled', remarks = $3 WHERE lesson_id = $1 AND user_id = $2 AND attendance_status = 'Booked'`,
  [lessonId, userId, remarks], db).then(r => r.rowCount > 0);

/* another live booking of this person that overlaps the given time slot */
const findOverlap = (userId, day, start, end, exceptLessonId, db) => query(
  `SELECT s.lesson_id, s.class_type FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE a.user_id = $1 AND a.attendance_status IN ('Booked', 'Attended') AND s.status <> 'Cancelled' AND s.session_date = $2
      AND s.start_time < $4::time AND $3::time < s.end_time AND s.lesson_id <> $5
    LIMIT 1`, [userId, day, start, end, exceptLessonId], db).then(r => r.rows[0] || null);

/* upcoming bookings: still Booked and the class has not ended yet (by date/time in the server zone: callers pass `today` and `nowHm`) */
const listUpcoming = (userId, today, nowHm, db) => query(
  `SELECT a.lesson_id, a.student_package_id, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time,
          s.class_type, i.full_name AS instructor_name, pd.lessons IS NULL AS unlimited, pd.name AS package_name
     FROM class_attendance a
     JOIN class_session s ON s.lesson_id = a.lesson_id
     JOIN instructor_profile i ON i.user_id = s.instructor_id
     LEFT JOIN student_package sp ON sp.id = a.student_package_id
     LEFT JOIN package_def pd ON pd.id = sp.package_id
    WHERE a.user_id = $1 AND a.attendance_status = 'Booked' AND s.status = 'Scheduled'
      AND (s.session_date > $2 OR (s.session_date = $2 AND s.end_time > $3::time))
    ORDER BY s.session_date, s.start_time`, [userId, today, nowHm], db).then(r => r.rows);

/* past classes with their outcome (Booked rows whose class already ended are 'awaiting the instructor') */
const listHistory = (userId, today, nowHm, since, limit, db) => query(
  `SELECT a.lesson_id, a.attendance_status, a.marked_at, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, to_char(s.end_time, 'HH24:MI') AS end_time,
          s.class_type, i.full_name AS instructor_name
     FROM class_attendance a
     JOIN class_session s ON s.lesson_id = a.lesson_id
     JOIN instructor_profile i ON i.user_id = s.instructor_id
    WHERE a.user_id = $1 AND s.session_date >= $4 AND s.status <> 'Cancelled'
      AND (a.attendance_status IN ('Attended', 'No-Show')
           OR (a.attendance_status = 'Booked' AND (s.session_date < $2 OR (s.session_date = $2 AND s.end_time <= $3::time))))
    ORDER BY s.session_date DESC, s.start_time DESC
    LIMIT $5`, [userId, today, nowHm, since, limit], db).then(r => r.rows);

const wasAttended = (lessonId, userId, db) => query(
  `SELECT 1 FROM class_attendance WHERE lesson_id = $1 AND user_id = $2 AND attendance_status = 'Attended'`, [lessonId, userId], db).then(r => r.rowCount > 0);

/* a guest's first booked lesson (public trial booking) */
const addGuestBooking = (lessonId, userId, bookedAt, db) => query(
  `INSERT INTO class_attendance (lesson_id, user_id, attendance_status, booked_at, booked_via) VALUES ($1, $2, 'Booked', $3, 'online') ON CONFLICT DO NOTHING`,
  [lessonId, userId, bookedAt], db);

/* ---------- roster (instructor and desk) ---------- */
/* everyone on the lesson except cancelled bookings, with the figures the roster shows. `instructorId` selects whose remarks are returned. */
const roster = (lessonId, instructorId, today, db) => query(
  `SELECT a.user_id, a.attendance_status, a.booked_via,
          COALESCE(sp.full_name, gp.full_name) AS full_name, sp.member_no, sp.rank_id, br.name AS rank_name, sp.joined_on, sp.accumulated_hours,
          (SELECT max(s2.session_date) FROM class_attendance a2 JOIN class_session s2 ON s2.lesson_id = a2.lesson_id
            WHERE a2.user_id = a.user_id AND a2.attendance_status = 'Attended') AS last_seen,
          (EXISTS (SELECT 1 FROM grading_application ga LEFT JOIN grading_session gs ON gs.id = ga.session_id
                    WHERE ga.user_id = a.user_id AND (ga.status = 'Submitted' OR (ga.status = 'Approved' AND gs.session_date >= $3)))
           OR EXISTS (SELECT 1 FROM grading_candidate gc JOIN grading_session gs2 ON gs2.id = gc.session_id
                       WHERE gc.user_id = a.user_id AND gc.result = 'Pending' AND gs2.status <> 'Cancelled')) AS going_for_grading,
          (SELECT r.body FROM instructor_remark r WHERE r.kind = 'student' AND r.lesson_id = a.lesson_id AND r.student_id = a.user_id AND r.instructor_id = $2) AS remark,
          (SELECT r.body FROM instructor_remark r WHERE r.kind = 'grading' AND r.lesson_id = a.lesson_id AND r.student_id = a.user_id AND r.instructor_id = $2) AS grading_note,
          (SELECT COALESCE(json_agg(json_build_object('body', x.body, 'at', x.created_at, 'type', x.class_type, 'date', x.session_date) ORDER BY x.created_at DESC), '[]'::json)
             FROM (SELECT r.body, r.created_at, s3.class_type, s3.session_date FROM instructor_remark r LEFT JOIN class_session s3 ON s3.lesson_id = r.lesson_id
                    WHERE r.kind = 'student' AND r.student_id = a.user_id AND r.instructor_id = $2 AND r.lesson_id IS DISTINCT FROM a.lesson_id
                    ORDER BY r.created_at DESC LIMIT 3) x) AS earlier
     FROM class_attendance a
     LEFT JOIN student_profile sp ON sp.user_id = a.user_id
     LEFT JOIN belt_rank br ON br.id = sp.rank_id
     LEFT JOIN guest_profile gp ON gp.user_id = a.user_id
    WHERE a.lesson_id = $1 AND a.attendance_status <> 'Cancelled'
    ORDER BY COALESCE(sp.full_name, gp.full_name), a.user_id`, [lessonId, instructorId, today], db).then(r => r.rows);
/* the row locked for the update, so two taps cannot both credit the hours */
const lockRow = (lessonId, userId, db) => query(
  `SELECT lesson_id, user_id, attendance_status FROM class_attendance WHERE lesson_id = $1 AND user_id = $2 FOR UPDATE`, [lessonId, userId], db).then(r => r.rows[0] || null);
/* marked_by is the instructor (an FK to instructor_profile); desk marks pass null and keep the reason in `remarks` */
const setStatus = (lessonId, userId, status, markedBy, markedAt, remarks, db) => query(
  `UPDATE class_attendance SET attendance_status = $3, marked_by = $4, marked_at = $5, remarks = COALESCE($6, remarks) WHERE lesson_id = $1 AND user_id = $2`,
  [lessonId, userId, status, markedBy, markedAt, remarks], db);
/* class totals after the class is ended */
const counts = (lessonId, db) => query(
  `SELECT count(*) FILTER (WHERE attendance_status = 'Attended')::int AS present, count(*) FILTER (WHERE attendance_status = 'No-Show')::int AS no_show,
          count(*) FILTER (WHERE attendance_status = 'Booked')::int AS booked
     FROM class_attendance WHERE lesson_id = $1`, [lessonId], db).then(r => r.rows[0]);
const listBookedIds = (lessonId, db) => query(
  `SELECT user_id FROM class_attendance WHERE lesson_id = $1 AND attendance_status = 'Booked' ORDER BY user_id`, [lessonId], db).then(r => r.rows.map(x => x.user_id));
/* does this person have a place (not cancelled) on the lesson? */
const onRoster = (lessonId, userId, db) => query(
  `SELECT 1 FROM class_attendance WHERE lesson_id = $1 AND user_id = $2 AND attendance_status <> 'Cancelled'`, [lessonId, userId], db).then(r => r.rowCount > 0);
/* ---------- front desk ---------- */
/* everyone on the lesson except cancelled bookings (students and guests) */
const deskRoster = (lessonId, db) => query(
  `SELECT a.user_id, a.attendance_status, a.booked_via, a.remarks, a.student_package_id, a.booked_at,
          COALESCE(sp.full_name, gp.full_name) AS full_name, sp.member_no, sp.rank_id, br.name AS rank_name, (gp.user_id IS NOT NULL) AS is_guest, gp.contact_no AS guest_mobile
     FROM class_attendance a
     LEFT JOIN student_profile sp ON sp.user_id = a.user_id
     LEFT JOIN belt_rank br ON br.id = sp.rank_id
     LEFT JOIN guest_profile gp ON gp.user_id = a.user_id
    WHERE a.lesson_id = $1 AND a.attendance_status <> 'Cancelled'
    ORDER BY a.booked_at, COALESCE(sp.full_name, gp.full_name), a.user_id`, [lessonId], db).then(r => r.rows);
/* Booked rows of a package for lessons that have not started (used when a package is refunded or voided) */
const upcomingBookedOnPackage = (packageId, today, hhmm, db) => query(
  `SELECT a.lesson_id, a.user_id FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE a.student_package_id = $1 AND a.attendance_status = 'Booked' AND s.status = 'Scheduled'
      AND (s.session_date > $2 OR (s.session_date = $2 AND s.start_time > $3::time))`, [packageId, today, hhmm], db).then(r => r.rows);
/* a class the person is already booked on at the same time is found with findOverlap */
module.exports = { getRow, book, cancel, findOverlap, listUpcoming, listHistory, wasAttended, addGuestBooking, roster, lockRow, setStatus, counts, listBookedIds, onRoster, deskRoster, upcomingBookedOnPackage };
