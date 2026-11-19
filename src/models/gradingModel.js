'use strict';
/* grading_session / grading_application / grading_candidate / grading_history, student side. */
const { query } = require('../config/db');

const SESSION_COLS = `g.id, g.label, g.session_date, to_char(g.start_time, 'HH24:MI') AS start_time, to_char(g.end_time, 'HH24:MI') AS end_time, g.application_close_date, g.status`;

/* the next grading people can apply for: a Scheduled slot after today */
const nextSession = (today, db) => query(
  `SELECT ${SESSION_COLS} FROM grading_session g WHERE g.status = 'Scheduled' AND g.session_date > $1 ORDER BY g.session_date LIMIT 1`, [today], db).then(r => r.rows[0] || null);
const getSession = (id, db) => query(`SELECT ${SESSION_COLS} FROM grading_session g WHERE g.id = $1`, [id], db).then(r => r.rows[0] || null);

/* the student's live application (waiting or approved for a slot that has not happened yet) */
const openApplication = (userId, today, db) => query(
  `SELECT a.id, a.from_rank_id, a.to_rank_id, a.session_id, a.submitted_at, a.status, a.note, a.fee_payment_id, p.amount AS fee_paid, p.paid_at
     FROM grading_application a
     LEFT JOIN payment p ON p.id = a.fee_payment_id
     LEFT JOIN grading_session g ON g.id = a.session_id
    WHERE a.user_id = $1 AND (a.status = 'Submitted' OR (a.status = 'Approved' AND g.session_date > $2))
    ORDER BY a.submitted_at DESC LIMIT 1`, [userId, today], db).then(r => r.rows[0] || null);

const getOwnApplication = (id, userId, db, lock = false) => query(
  `SELECT id, status FROM grading_application WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, userId], db).then(r => r.rows[0] || null);

const insertApplication = (a, db) => query(
  `INSERT INTO grading_application (id, user_id, from_rank_id, to_rank_id, session_id, submitted_at, status, note, fee_payment_id)
   VALUES ($1, $2, $3, $4, $5, $6, 'Submitted', $7, $8)`, [a.id, a.userId, a.fromRank, a.toRank, a.sessionId, a.at, a.note, a.paymentId], db);
const withdraw = (id, db) => query(`UPDATE grading_application SET status = 'Withdrawn' WHERE id = $1 AND status = 'Submitted'`, [id], db).then(r => r.rowCount > 0);

/* examiner feedback on the student's past gradings, newest first (their own rows only) */
const feedbackFor = (userId, db) => query(
  `SELECT c.session_id, g.session_date, fr.name AS from_name, tr.name AS to_name, c.result, c.score, c.well_done, c.to_improve, c.promotion_status, ip.full_name AS examiner
     FROM grading_candidate c
     JOIN grading_session g ON g.id = c.session_id
     JOIN belt_rank fr ON fr.id = c.from_rank_id JOIN belt_rank tr ON tr.id = c.to_rank_id
     LEFT JOIN instructor_profile ip ON ip.user_id = c.examiner_id
    WHERE c.user_id = $1 AND c.result <> 'Pending' ORDER BY g.session_date DESC, c.session_id DESC`, [userId], db).then(r => r.rows);

const historyFor = (userId, db) => query(
  `SELECT h.id, h.grading_date, h.grade, fr.name AS from_name, tr.name AS to_name, h.grading_remarks
     FROM grading_history h LEFT JOIN belt_rank fr ON fr.id = h.from_rank_id LEFT JOIN belt_rank tr ON tr.id = h.to_rank_id
    WHERE h.user_id = $1 ORDER BY h.grading_date DESC, h.id DESC`, [userId], db).then(r => r.rows);

/* promotions HQ approved on or after `since` */
const promotedSince = (userId, since, db) => query(
  `SELECT c.session_id, tr.name AS to_name, c.promotion_decided_at FROM grading_candidate c JOIN belt_rank tr ON tr.id = c.to_rank_id
    WHERE c.user_id = $1 AND c.promotion_status = 'Promoted' AND c.promotion_decided_at >= $2 ORDER BY c.promotion_decided_at DESC`, [userId, since], db).then(r => r.rows);

/* ---------- examiner side ---------- */
const PANEL_COLS = `g.id, g.label, g.session_date, to_char(g.start_time, 'HH24:MI') AS start_time, to_char(g.end_time, 'HH24:MI') AS end_time, g.status,
       lead.full_name AS lead_name,
       (SELECT array_agg(ip.full_name ORDER BY ip.full_name) FROM grading_examiner e2 JOIN instructor_profile ip ON ip.user_id = e2.instructor_id WHERE e2.session_id = g.id) AS examiners,
       (SELECT count(*) FROM grading_candidate c WHERE c.session_id = g.id)::int AS total,
       (SELECT count(*) FROM grading_candidate c WHERE c.session_id = g.id AND c.result = 'Pending')::int AS pending`;
const PANEL_FROM = `FROM grading_session g JOIN grading_examiner e ON e.session_id = g.id AND e.instructor_id = $1 JOIN instructor_profile lead ON lead.user_id = g.lead_examiner_id`;
/* panels this instructor sits on, in a date range (to = null: no upper bound) */
const panelsFor = (instructorId, from, to, db) => query(
  `SELECT ${PANEL_COLS} ${PANEL_FROM} WHERE g.status <> 'Cancelled' AND g.session_date >= $2 AND ($3::date IS NULL OR g.session_date <= $3::date)
    ORDER BY g.session_date, g.start_time, g.id`, [instructorId, from, to], db).then(r => r.rows);
/* one panel, only when the instructor is an examiner on it (null otherwise). Locked for the result write. */
const panelOf = (sessionId, instructorId, db, lock = false) => query(
  `SELECT ${PANEL_COLS} ${PANEL_FROM} WHERE g.id = $2${lock ? ' FOR UPDATE OF g' : ''}`, [instructorId, sessionId], db).then(r => r.rows[0] || null);
const candidatesOf = (sessionId, db) => query(
  `SELECT c.user_id, sp.full_name, sp.member_no, c.from_rank_id, c.to_rank_id, fr.name AS from_name, tr.name AS to_name, c.result, c.score, c.well_done, c.to_improve
     FROM grading_candidate c JOIN student_profile sp ON sp.user_id = c.user_id JOIN belt_rank fr ON fr.id = c.from_rank_id JOIN belt_rank tr ON tr.id = c.to_rank_id
    WHERE c.session_id = $1 ORDER BY fr.sort_order, sp.full_name, c.user_id`, [sessionId], db).then(r => r.rows);
const lockCandidate = (sessionId, userId, db) => query(
  `SELECT user_id, from_rank_id, to_rank_id, result FROM grading_candidate WHERE session_id = $1 AND user_id = $2 FOR UPDATE`, [sessionId, userId], db).then(r => r.rows[0] || null);
/* only a candidate still Pending can be scored: the WHERE makes a second submission affect no row */
const scoreCandidate = (sessionId, userId, c, db) => query(
  `UPDATE grading_candidate SET result = $3, score = $4, well_done = $5, to_improve = $6, examiner_id = $7, promotion_status = $8
    WHERE session_id = $1 AND user_id = $2 AND result = 'Pending'`, [sessionId, userId, c.result, c.score, c.well, c.toImprove, c.examinerId, c.promotion], db).then(r => r.rowCount > 0);
const insertHistory = (h, db) => query(
  `INSERT INTO grading_history (id, user_id, grading_session_id, grading_date, from_rank_id, to_rank_id, grading_remarks, grade) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [h.id, h.userId, h.sessionId, h.date, h.fromRank, h.toRank, h.remarks, h.grade], db);
const setSessionStatus = (sessionId, status, db) => query(`UPDATE grading_session SET status = $2 WHERE id = $1`, [sessionId, status], db);
/* ---------- Business Admin: applications and promotions ---------- */
const APP_COLS = `a.id, a.user_id, sp.member_no, sp.full_name, a.from_rank_id, fr.name AS from_name, a.to_rank_id, tr.name AS to_name, a.session_id, g.label AS session_label,
                  g.session_date, a.submitted_at, a.status, a.note, p.amount AS fee_paid, p.status AS fee_status`;
const APP_FROM = `FROM grading_application a JOIN student_profile sp ON sp.user_id = a.user_id JOIN belt_rank fr ON fr.id = a.from_rank_id JOIN belt_rank tr ON tr.id = a.to_rank_id
                  LEFT JOIN grading_session g ON g.id = a.session_id LEFT JOIN payment p ON p.id = a.fee_payment_id`;
/* applications waiting for a decision, and approved ones whose grading day has not come yet */
const adminApplications = (today, db) => query(
  `SELECT ${APP_COLS} ${APP_FROM}
    WHERE a.status = 'Submitted' OR (a.status = 'Approved' AND g.session_date >= $1::date)
    ORDER BY (a.status = 'Submitted') DESC, a.submitted_at, a.id`, [today], db).then(r => r.rows);
const getApplication = (id, db, lock = false) => query(
  `SELECT ${APP_COLS} ${APP_FROM} WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`, [id], db).then(r => r.rows[0] || null);
/* only a Submitted application can be decided */
const decideApplication = (id, status, sessionId, note, by, at, db) => query(
  `UPDATE grading_application SET status = $2, session_id = COALESCE($3, session_id), note = COALESCE($4, note), decided_by = $5, decided_at = $6
    WHERE id = $1 AND status = 'Submitted'`, [id, status, sessionId, note, by, at], db).then(r => r.rowCount > 0);
/* an approved application puts the student on the examiners' list for that day */
const addCandidate = (c, db) => query(
  `INSERT INTO grading_candidate (session_id, user_id, application_id, from_rank_id, to_rank_id, fee, result, promotion_status)
   VALUES ($1, $2, $3, $4, $5, $6, 'Pending', 'n/a') ON CONFLICT (session_id, user_id) DO NOTHING`, [c.sessionId, c.userId, c.applicationId, c.fromRank, c.toRank, c.fee], db).then(r => r.rowCount > 0);
const nextScheduledSession = (today, db) => query(
  `SELECT g.id, g.label, g.session_date, g.status FROM grading_session g WHERE g.status = 'Scheduled' AND g.session_date > $1::date ORDER BY g.session_date LIMIT 1`, [today], db).then(r => r.rows[0] || null);
/* results the examiners signed that still wait for HQ to approve the promotion */
const pendingPromotions = db => query(
  `SELECT c.session_id, g.label AS session_label, g.session_date, c.user_id, sp.member_no, sp.full_name, c.from_rank_id, fr.name AS from_name, c.to_rank_id, tr.name AS to_name,
          c.result, c.score, c.well_done, c.to_improve, ip.full_name AS examiner
     FROM grading_candidate c
     JOIN grading_session g ON g.id = c.session_id
     JOIN student_profile sp ON sp.user_id = c.user_id
     JOIN belt_rank fr ON fr.id = c.from_rank_id JOIN belt_rank tr ON tr.id = c.to_rank_id
     LEFT JOIN instructor_profile ip ON ip.user_id = c.examiner_id
    WHERE c.promotion_status = 'Pending approval' ORDER BY g.session_date, sp.full_name, c.user_id`, [], db).then(r => r.rows);
const lockPromotion = (sessionId, userId, db) => query(
  `SELECT c.session_id, c.user_id, c.from_rank_id, c.to_rank_id, c.result, c.promotion_status, g.session_date
     FROM grading_candidate c JOIN grading_session g ON g.id = c.session_id WHERE c.session_id = $1 AND c.user_id = $2 FOR UPDATE OF c`, [sessionId, userId], db).then(r => r.rows[0] || null);
const setPromotion = (sessionId, userId, status, by, at, db) => query(
  `UPDATE grading_candidate SET promotion_status = $3, promotion_decided_by = $4, promotion_decided_at = $5
    WHERE session_id = $1 AND user_id = $2 AND promotion_status = 'Pending approval'`, [sessionId, userId, status, by, at], db).then(r => r.rowCount > 0);
module.exports = {
  adminApplications, getApplication, decideApplication, addCandidate, nextScheduledSession, pendingPromotions, lockPromotion, setPromotion,
  nextSession, getSession, openApplication, getOwnApplication, insertApplication, withdraw, feedbackFor, historyFor, promotedSince,
  panelsFor, panelOf, candidatesOf, lockCandidate, scoreCandidate, insertHistory, setSessionStatus
};
