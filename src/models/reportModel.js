'use strict';
/* Aggregate SQL for the Business Admin pages: overview, insights, revenue and reports. Read only, every value is a bound parameter.
   Dates are 'YYYY-MM-DD' strings from utils/clock; $tz is the server time zone used to cut payment timestamps into days. */
const { query } = require('../config/db');
const { STATS_SQL } = require('./memberModel');

const TAKEN = `(SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.attendance_status IN ('Booked', 'Attended', 'No-Show'))`;

/* every weekly class (private lessons left out) with how full its dated lessons were between two days (cancelled lessons are not counted) */
const slotStats = (from, to, db) => query(
  `SELECT t.id, t.code, t.dojo_id, d.name AS dojo_name, t.weekday, to_char(t.start_time, 'HH24:MI') AS start_time, to_char(t.end_time, 'HH24:MI') AS end_time,
          t.mat, t.class_type, t.capacity, t.kids_only, t.online_bookable, t.instructor_id, i.full_name AS instructor_name,
          count(s.lesson_id)::int AS sessions,
          COALESCE(sum(${TAKEN}), 0)::int AS taken,
          COALESCE(sum(s.capacity), 0)::int AS cap_total
     FROM class_template t
     JOIN dojo d ON d.id = t.dojo_id
     JOIN instructor_profile i ON i.user_id = t.instructor_id
     LEFT JOIN class_session s ON s.template_id = t.id AND s.session_date BETWEEN $1::date AND $2::date AND s.status <> 'Cancelled'
    WHERE NOT t.is_private
    GROUP BY t.id, d.name, i.full_name
    ORDER BY t.dojo_id, t.weekday, t.start_time, t.id`, [from, to], db).then(r => r.rows);

/* average class rating per weekly class (feedback is anonymous: no student is joined) */
const ratingsByTemplate = (from, to, db) => query(
  `SELECT s.template_id, avg(f.rating)::float AS rating, count(*)::int AS n
     FROM class_feedback f JOIN class_session s ON s.lesson_id = f.lesson_id
    WHERE s.session_date BETWEEN $1::date AND $2::date AND s.template_id IS NOT NULL GROUP BY s.template_id`, [from, to], db).then(r => r.rows);

/* ratings with their weekly class, class type and instructor, for the Experience tab */
const feedbackRows = (from, to, db) => query(
  `SELECT s.template_id, s.class_type, i.full_name AS instructor_name, f.rating, f.tags
     FROM class_feedback f
     JOIN class_session s ON s.lesson_id = f.lesson_id
     JOIN instructor_profile i ON i.user_id = f.instructor_id
    WHERE s.session_date BETWEEN $1::date AND $2::date`, [from, to], db).then(r => r.rows);

/* one row per student with the desk figures (last seen, owed, expiry) */
const members = (today, db) => query(`SELECT t.* FROM (${STATS_SQL}) t`, [today], db).then(r => r.rows);

/* members by the month they joined, and how many of them attended a class at least 90 days after joining */
const cohorts = (sinceDay, db) => query(
  `SELECT to_char(sp.joined_on, 'YYYY-MM') AS ym, count(*)::int AS joined,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
                                          WHERE a.user_id = sp.user_id AND a.attendance_status = 'Attended' AND s.session_date >= sp.joined_on + 90))::int AS kept
     FROM student_profile sp WHERE sp.joined_on >= $1::date GROUP BY 1 ORDER BY 1`, [sinceDay], db).then(r => r.rows);

/* the reasons the front desk wrote down when a newcomer said they are not returning */
const notReturning = db => query(
  `SELECT sp.full_name, a.note, a.attempted_at FROM followup_attempt a JOIN followup f ON f.id = a.followup_id JOIN student_profile sp ON sp.user_id = f.user_id
    WHERE a.outcome = 'Not returning' ORDER BY a.attempted_at DESC, a.id LIMIT 20`, [], db).then(r => r.rows);

/* ---------- overview extras ---------- */
const waiting = db => query(
  `SELECT (SELECT count(*) FROM exception_request WHERE status = 'pending')::int AS exceptions,
          (SELECT count(*) FROM payment WHERE status = 'Failed')::int AS failed,
          (SELECT count(*) FROM import_issue WHERE status = 'open')::int AS imports,
          (SELECT count(*) FROM grading_candidate WHERE promotion_status = 'Pending approval')::int AS promotions,
          (SELECT count(*) FROM followup f WHERE f.status = 'open' AND EXISTS (SELECT 1 FROM followup_attempt a WHERE a.followup_id = f.id))::int AS followup_outcomes`, [], db).then(r => r.rows[0]);

/* money received between two days, with the item group each payment belongs to */
const GROUP_SQL = `CASE
  WHEN p.kind = 'Package' AND ((pd.id IS NOT NULL AND pd.lessons IS NULL) OR p.item ILIKE '%unlimited%') THEN 'Unlimited plans'
  WHEN p.kind = 'Package' THEN 'Lesson packages'
  WHEN p.kind = 'Registration' THEN 'Registration'
  WHEN p.kind = 'Annual dues' THEN 'Annual dues'
  WHEN p.kind = 'Grading fee' THEN 'Grading fees'
  WHEN p.kind = 'Dogi' THEN 'Equipment'
  ELSE 'Other' END`;
const paidIn = (from, to, tz, db) => query(
  `SELECT p.id, p.amount, p.item, p.kind, (p.paid_at AT TIME ZONE $1)::date::text AS day, ${GROUP_SQL} AS grp
     FROM payment p
     LEFT JOIN student_package k ON k.id = p.student_package_id
     LEFT JOIN package_def pd ON pd.id = k.package_id
    WHERE p.status = 'Paid' AND (p.paid_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date
    ORDER BY p.paid_at, p.id`, [tz, from, to], db).then(r => r.rows);
/* payments between two days by status (Paid, Refunded, Voided, Failed, Processing, Outstanding) */
const byStatus = (from, to, tz, db) => query(
  `SELECT status, count(*)::int AS n, COALESCE(sum(amount), 0)::float AS amount FROM payment
    WHERE (COALESCE(paid_at, created_at) AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date GROUP BY status`, [tz, from, to], db).then(r => r.rows);
const outstanding = db => query(
  `SELECT count(*)::int AS n, COALESCE(sum(p.amount), 0)::float AS amount FROM payment p WHERE p.status = 'Outstanding'`, [], db).then(r => r.rows[0]);
/* outstanding amount per dojo of the member */
const outstandingByDojo = db => query(
  `SELECT sp.dojo_id, COALESCE(sum(p.amount), 0)::float AS amount FROM payment p JOIN student_profile sp ON sp.user_id = p.user_id WHERE p.status = 'Outstanding' GROUP BY sp.dojo_id`, [], db).then(r => r.rows);
const failedList = (tz, db) => query(
  `SELECT p.id, sp.member_no, sp.full_name, p.item, p.amount, p.channel, p.created_at
     FROM payment p JOIN student_profile sp ON sp.user_id = p.user_id WHERE p.status = 'Failed' ORDER BY p.created_at DESC, p.id`, [], db).then(r => r.rows);
const refundsIn = (from, to, tz, db) => query(
  `SELECT count(*) FILTER (WHERE status = 'approved')::int AS approved_n, COALESCE(sum(amount) FILTER (WHERE status = 'approved'), 0)::float AS approved_amount,
          count(*) FILTER (WHERE status = 'pending')::int AS pending_n, COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::float AS pending_amount
     FROM refund_request
    WHERE (COALESCE(decided_at, requested_at) AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date OR status = 'pending'`, [tz, from, to], db).then(r => r.rows[0]);

/* ---------- impact numbers for the Policies page ---------- */
const upcomingBookings = (today, db) => query(
  `SELECT count(*)::int AS n FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE a.attendance_status = 'Booked' AND s.status = 'Scheduled' AND s.session_date >= $1::date`, [today], db).then(r => r.rows[0].n);
const waitingApplications = db => query(
  `SELECT count(*)::int AS n FROM registration_application WHERE status IN ('Submitted', 'Under review', 'Needs info')`, [], db).then(r => r.rows[0].n);

/* ---------- report rows (CSV) ---------- */
/* one row per dated class in the range */
const attendanceRows = (from, to, dojo, db) => query(
  `SELECT s.session_date::text AS day, s.class_type, to_char(s.start_time, 'HH24:MI') AS start_time, d.name AS dojo_name, i.full_name AS instructor_name,
          s.capacity, s.status,
          ${TAKEN}::int AS booked,
          (SELECT count(*) FROM class_attendance a WHERE a.lesson_id = s.lesson_id AND a.attendance_status = 'Attended')::int AS present
     FROM class_session s JOIN dojo d ON d.id = s.dojo_id JOIN instructor_profile i ON i.user_id = s.instructor_id
    WHERE s.session_date BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR s.dojo_id = $3)
    ORDER BY s.session_date, s.start_time, s.lesson_id`, [from, to, dojo], db).then(r => r.rows);
const paymentRows = (from, to, tz, dojo, db) => query(
  `SELECT sp.full_name, sp.member_no, p.item, (COALESCE(p.paid_at, p.created_at) AT TIME ZONE $1)::date::text AS day, p.amount, p.method, p.status, p.invoice_no
     FROM payment p JOIN student_profile sp ON sp.user_id = p.user_id
    WHERE (COALESCE(p.paid_at, p.created_at) AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date AND ($4::text IS NULL OR sp.dojo_id = $4)
    ORDER BY COALESCE(p.paid_at, p.created_at), p.id`, [tz, from, to, dojo], db).then(r => r.rows);
/* one row per venue attendance (roster, make-up or walk-in) between two days; HQ classes are not listed here */
const venueAttendanceRows = (from, to, dojo, db) => query(
  `SELECT d.name AS dojo_name, s.session_date::text AS day, s.class_type, to_char(s.start_time, 'HH24:MI') AS start_time, i.full_name AS instructor_name,
          sp.member_no, sp.full_name, a.booked_via, a.attendance_status, a.marked_at
     FROM class_attendance a
     JOIN class_session s ON s.lesson_id = a.lesson_id JOIN dojo d ON d.id = s.dojo_id JOIN instructor_profile i ON i.user_id = s.instructor_id
     JOIN student_profile sp ON sp.user_id = a.user_id
    WHERE s.dojo_id <> 'hq' AND a.attendance_status <> 'Cancelled' AND s.session_date BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR s.dojo_id = $3)
    ORDER BY d.name, s.session_date, s.start_time, sp.member_no`, [from, to, dojo], db).then(r => r.rows);
const followupRows = (from, to, tz, dojo, db) => query(
  `SELECT sp.full_name, sp.member_no, f.kind, (a.attempted_at AT TIME ZONE $1)::date::text AS day, a.method, a.outcome, a.note, o.full_name AS owner_name
     FROM followup_attempt a JOIN followup f ON f.id = a.followup_id JOIN student_profile sp ON sp.user_id = f.user_id LEFT JOIN staff_profile o ON o.user_id = f.owner_id
    WHERE (a.attempted_at AT TIME ZONE $1)::date BETWEEN $2::date AND $3::date AND ($4::text IS NULL OR sp.dojo_id = $4)
    ORDER BY a.attempted_at, a.id`, [tz, from, to, dojo], db).then(r => r.rows);

module.exports = {
  slotStats, ratingsByTemplate, feedbackRows, members, cohorts, notReturning, waiting, paidIn, byStatus, outstanding, outstandingByDojo, failedList, refundsIn,
  upcomingBookings, waitingApplications, attendanceRows, venueAttendanceRows, paymentRows, followupRows
};
