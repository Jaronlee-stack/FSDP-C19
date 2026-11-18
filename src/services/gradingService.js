'use strict';
/* Student side of grading: eligibility, fee, applying (application + payment in one transaction), feedback and history.
   Fee = grading_fee of the TARGET rank, plus the late fee when today is after the application close date. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden } = require('../utils/errors');
const studentModel = require('../models/studentModel');
const gradingModel = require('../models/gradingModel');
const paymentModel = require('../models/paymentModel');
const policyModel = require('../models/policyModel');
const { nextId } = require('../models/ids');
const rules = require('./gradingRules');
const auditService = require('./auditService');

/* grading figures for a student's next rank (null at the top rank). Runs on `db` (a transaction client or the pool). */
async function gradeFor(profile, db, today) {
  const next = await studentModel.nextRank(profile.rank_id, db);
  if (!next) return { grade: null, next: null, session: null };
  const session = await gradingModel.nextSession(today, db);
  const unpaid = await paymentModel.hasUnpaid(profile.user_id, db);
  const feesPaid = !unpaid && profile.account_status === 'Active' && (!profile.membership_expiry || profile.membership_expiry >= today);
  return { grade: rules.summarise({ profile, next, session, feesPaid, today }), next, session };
}

const feeShape = (next, late, policies) => {
  const base = next.grading_fee, extra = late ? policies.grading_late_fee : 0;
  return { base, late: extra, total: base + extra };
};

const feedbackShape = f => ({
  from: f.from_name, to: f.to_name, date: f.session_date, by: f.examiner || '', result: f.result, well: f.well_done || '', next: f.to_improve || '',
  status: f.promotion_status === 'n/a' ? null : f.promotion_status
});

async function overview(user) {
  return withTx(async tx => {
    const today = clock.today();
    const profile = await studentModel.getProfile(user.id, tx);
    const { grade, next, session } = await gradeFor(profile, tx, today);
    const policies = await policyModel.getAll(tx);
    const [open, fb, history] = await Promise.all([gradingModel.openApplication(user.id, today, tx), gradingModel.feedbackFor(user.id, tx), gradingModel.historyFor(user.id, tx)]);
    return {
      grade, fee: grade ? feeShape(next, grade.late, policies) : null,
      session: session ? { id: session.id, label: session.label, date: session.session_date, close: session.application_close_date } : null,
      currentRank: { id: profile.rank_id, name: profile.rank_name, passedOn: profile.last_passed_grading_date },
      application: open ? { id: open.id, status: open.status, sessionId: open.session_id, total: open.fee_paid, date: open.submitted_at, note: open.note } : null,
      feedback: fb.map(feedbackShape),
      history: history.map(h => ({ id: h.id, date: h.grading_date, from: h.from_name, to: h.to_name, passed: h.grade, remarks: h.grading_remarks }))
    };
  });
}

async function apply(user, { sessionId, bookFile, method }) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    const today = clock.today(), now = clock.now();
    const profile = await studentModel.getProfile(user.id, tx);
    const { grade, next } = await gradeFor(profile, tx, today);
    if (!grade) throw conflict('You are already at the highest grade.', 'TOP_RANK');
    const session = await gradingModel.getSession(sessionId, tx);
    if (!session) throw notFound('That grading session does not exist.', 'SESSION_NOT_FOUND');
    if (session.status !== 'Scheduled' || session.session_date <= today) throw conflict('That grading session is no longer open for applications.', 'SESSION_CLOSED');
    if (!grade.eligible) {
      const unmet = grade.checks.filter(c => !c[2]).map(c => c[0]);
      throw forbidden(`You are not eligible yet: ${unmet.join('; ')}.`, 'NOT_ELIGIBLE');
    }
    if (await gradingModel.openApplication(user.id, today, tx)) throw conflict('You already have a grading application.', 'ALREADY_APPLIED');
    const policies = await policyModel.getAll(tx);
    const late = !!session.application_close_date && today > session.application_close_date;
    const fee = feeShape(next, late, policies);
    const payId = await nextId(tx, 'payment', 'id', 'L-', 4);
    const invoiceNo = await nextId(tx, 'payment', 'invoice_no', 'INV-', 7);
    await paymentModel.insertPaid({ id: payId, invoiceNo, userId: user.id, item: `Grading fee · ${next.name}`, kind: 'Grading fee', amount: fee.total, method, at: now }, tx);
    const appId = await nextId(tx, 'grading_application', 'id', 'GA-', 2);
    await gradingModel.insertApplication({ id: appId, userId: user.id, fromRank: profile.rank_id, toRank: next.id, sessionId: session.id, at: now, note: `Membership book uploaded (${bookFile}) · fee paid`.slice(0, 500), paymentId: payId }, tx);
    return { application: { id: appId, status: 'Submitted', sessionId: session.id, total: fee.total, date: now }, fee, payment: { id: payId, invoiceNo, amount: fee.total, method, status: 'Paid', date: now } };
  });
}

async function withdraw(user, id) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    const a = await gradingModel.getOwnApplication(id, user.id, tx, true);
    if (!a) throw notFound('That application does not exist.', 'APPLICATION_NOT_FOUND');
    if (a.status !== 'Submitted') throw conflict('Only an application that is still waiting can be withdrawn.', 'NOT_WITHDRAWABLE');
    await gradingModel.withdraw(id, tx);
    return { ok: true, status: 'Withdrawn' };
  });
}

/* ---------- examiner side (instructor portal) ----------
   Window: from 15 minutes before the start until the end of the panel. Names appear only inside it. The grading panel is always at HQ and
   never touches class_session. */
const remarkModel = require('../models/remarkModel');
const { AppError } = require('../utils/errors');
const GRADE_LEAD_MIN = 15;
function windowOf(p, now = clock.now()) {
  const start = clock.at(p.session_date, p.start_time), end = clock.at(p.session_date, p.end_time), opens = new Date(start.getTime() - GRADE_LEAD_MIN * 60000);
  const state = now < opens ? 'locked' : now < start ? 'soon' : now <= end ? 'live' : 'over';
  return { opensAt: opens.toISOString(), start: start.toISOString(), end: end.toISOString(), state, open: state === 'soon' || state === 'live' };
}
const panelShape = p => ({
  id: p.id, label: p.label, date: p.session_date, from: p.start_time, to: p.end_time, venue: 'HQ Dojo', lead: p.lead_name, examiners: p.examiners || [],
  status: p.status, candidateCount: p.total, left: p.pending
});
/* the panels I sit on (today and later) with their windows; candidates only for a panel whose window is open */
async function myPanels(user) {
  const now = clock.now(), today = clock.today();
  const rows = await gradingModel.panelsFor(user.id, today, null);
  const out = [];
  for (const p of rows) {
    if (p.status === 'Completed') continue;
    const win = windowOf(p, now);
    const item = { session: panelShape(p), window: win, counts: { total: p.total, left: p.pending } };
    if (win.open) item.candidates = await candidateList(p.id);
    out.push(item);
  }
  return { panels: out };
}
const candidateShape = (c, notes) => ({
  userId: c.user_id, name: c.full_name, memberNo: c.member_no, from: c.from_name, to: c.to_name, fromId: c.from_rank_id, toId: c.to_rank_id,
  done: c.result !== 'Pending', result: c.result === 'Pending' ? null : c.result, score: c.score, well: c.well_done || '', toImprove: c.to_improve || '', notes
});
async function candidateList(sessionId, db) {
  const rows = await gradingModel.candidatesOf(sessionId, db);
  const out = [];
  for (const c of rows) {
    const notes = (await remarkModel.gradingNotesFor(c.user_id, 3, db)).map(n => ({
      by: n.instructor_name, at: n.created_at, label: n.session_date ? `${n.class_type} · ${n.session_date}` : 'Grading note', text: n.body
    }));
    out.push(candidateShape(c, notes));
  }
  return out;
}
/* examiner of this panel, inside the window. 403 NOT_EXAMINER, 409 GRADING_NOT_OPEN. Returns the panel row. */
async function examinerPanel(user, sessionId, db, lock = false) {
  const p = await gradingModel.panelOf(sessionId, user.id, db, lock);
  if (!p) throw forbidden('You are not an examiner on this grading panel.', 'NOT_EXAMINER');
  const win = windowOf(p);
  if (p.status === 'Cancelled' || !win.open) throw conflict('Grading opens 15 minutes before the start and closes at the end of the panel.', 'GRADING_NOT_OPEN');
  return p;
}
async function candidates(user, sessionId) {
  return withTx(async tx => {
    const p = await examinerPanel(user, sessionId, tx);
    return { session: panelShape(p), window: windowOf(p), candidates: await candidateList(sessionId, tx) };
  });
}
/* score one candidate: the server adds up the marks and decides Pass / Retake / Fail. A pass waits for HQ to approve the promotion
   (promotion_status 'Pending approval'); the student's rank does not change here. */
async function submitResult(user, sessionId, userId, { scores, well, toImprove }) {
  return withTx(async tx => {
    const p = await examinerPanel(user, sessionId, tx, true);
    const cand = await gradingModel.lockCandidate(sessionId, userId, tx);
    if (!cand) throw new AppError(404, 'NOT_CANDIDATE', 'That student is not a candidate on this panel.');
    if (cand.result !== 'Pending') throw conflict('This candidate already has a result.', 'ALREADY_SCORED');
    const total = rules.examTotal(scores), result = rules.examResult(total), score = rules.examPercent(total);
    const promotion = result === 'Pass' ? 'Pending approval' : 'n/a';
    const ok = await gradingModel.scoreCandidate(sessionId, userId, { result, score, well, toImprove, examinerId: user.id, promotion }, tx);
    if (!ok) throw conflict('This candidate already has a result.', 'ALREADY_SCORED');
    await gradingModel.insertHistory({
      id: await nextId(tx, 'grading_history', 'id', 'GH-', 2), userId, sessionId, date: p.session_date, fromRank: cand.from_rank_id, toRank: cand.to_rank_id, remarks: well, grade: result === 'Pass'
    }, tx);
    await studentModel.setLastGradingDate(userId, p.session_date, tx);
    const left = (await gradingModel.panelOf(sessionId, user.id, tx)).pending;
    await gradingModel.setSessionStatus(sessionId, left ? 'In progress' : 'Completed', tx);
    await auditService.record(tx, user, { action: 'grading.result_submitted', entityType: 'grading_candidate', entityId: `${sessionId}:${userId}`, summary: `Recorded a grading result (${result}, ${score}%) for ${userId} on ${sessionId}`,
      details: { sessionId, userId, result, score, promotion } });
    return { result, score, marks: total, max: rules.EXAM_MAX, promotion, left };
  });
}

/* ---------- Business Admin: applications and promotions (D22) ---------- */
const appShape = a => ({
  id: a.id, userId: a.user_id, memberNo: a.member_no, name: a.full_name, fromId: a.from_rank_id, from: a.from_name, toId: a.to_rank_id, to: a.to_name,
  sessionId: a.session_id, sessionLabel: a.session_label || null, sessionDate: a.session_date || null, submittedAt: a.submitted_at, status: a.status, note: a.note || '',
  feePaid: a.fee_paid === null || a.fee_paid === undefined ? null : a.fee_paid
});
const proposalShape = c => ({
  sessionId: c.session_id, sessionLabel: c.session_label, date: c.session_date, userId: c.user_id, memberNo: c.member_no, name: c.full_name,
  fromId: c.from_rank_id, from: c.from_name, toId: c.to_rank_id, to: c.to_name, result: c.result, score: c.score, by: c.examiner || '', well: c.well_done || '', next: c.to_improve || ''
});
/* applications that wait for HQ (and the approved ones for a day still to come), and the examiners' passes that wait for the promotion */
async function adminOverview() {
  const [apps, props] = await Promise.all([gradingModel.adminApplications(clock.today()), gradingModel.pendingPromotions()]);
  return { apps: apps.map(appShape), proposals: props.map(proposalShape) };
}
/* approve (puts the student on the examiners' list for the day) or reject (a note is required) one waiting application */
async function decideApplication(user, id, { decision, sessionId, note }) {
  return withTx(async tx => {
    const today = clock.today(), now = clock.now();
    const app = await gradingModel.getApplication(id, tx, true);
    if (!app) throw notFound('That application does not exist.', 'APPLICATION_NOT_FOUND');
    if (app.status !== 'Submitted') throw conflict('That application was already decided.', 'ALREADY_DECIDED');
    if (decision === 'rejected') {
      await gradingModel.decideApplication(id, 'Rejected', null, note, user.id, now, tx);
    } else {
      const wanted = sessionId || app.session_id;
      const session = wanted ? await gradingModel.getSession(wanted, tx) : await gradingModel.nextScheduledSession(today, tx);
      if (!session) throw conflict('There is no grading day to put this student on.', 'NO_SESSION');
      if (session.status !== 'Scheduled') throw conflict('That grading day is not open for new candidates.', 'SESSION_NOT_OPEN');
      await gradingModel.decideApplication(id, 'Approved', session.id, null, user.id, now, tx);
      await gradingModel.addCandidate({ sessionId: session.id, userId: app.user_id, applicationId: id, fromRank: app.from_rank_id, toRank: app.to_rank_id, fee: app.fee_paid || 0 }, tx);
    }
    const after = await gradingModel.getApplication(id, tx);
    await auditService.record(tx, user, { action: 'grading.application_decided', entityType: 'grading_application', entityId: id, summary: `${decision === 'rejected' ? 'Rejected' : 'Approved'} grading application ${id}`,
      details: { decision, sessionId: after.session_id || null, userId: app.user_id, noteGiven: !!note } });
    return { application: appShape(after) };
  });
}
/* HQ approves or declines the promotion of a student the examiners passed. A promotion sets the rank, the date of the passed grading and
   starts the hours toward the next grade again (the career total stays). */
async function decidePromotion(user, sessionId, userId, { decision }) {
  return withTx(async tx => {
    const now = clock.now();
    const c = await gradingModel.lockPromotion(sessionId, userId, tx);
    if (!c) throw notFound('That candidate does not exist.', 'CANDIDATE_NOT_FOUND');
    if (c.promotion_status !== 'Pending approval') throw conflict('That result has no promotion waiting.', 'ALREADY_DECIDED');
    if (decision === 'promote') {
      await studentModel.lock(userId, tx);
      const profile = await studentModel.getProfile(userId, tx);
      if (profile.rank_id !== c.from_rank_id) throw conflict('The student is no longer at the grade they were graded from.', 'RANK_CHANGED');
      await studentModel.promote(userId, c.to_rank_id, c.session_date, tx);
      await gradingModel.setPromotion(sessionId, userId, 'Promoted', user.id, now, tx);
    } else await gradingModel.setPromotion(sessionId, userId, 'Declined', user.id, now, tx);
    const p = await studentModel.getProfile(userId, tx);
    await auditService.record(tx, user, { action: 'grading.promotion_decided', entityType: 'grading_candidate', entityId: `${sessionId}:${userId}`, summary: `${decision === 'promote' ? 'Promoted' : 'Declined the promotion of'} ${userId} after grading ${sessionId}`,
      details: { sessionId, userId, decision, fromRank: c.from_rank_id, toRank: c.to_rank_id } });
    return { sessionId, userId, decision, status: decision === 'promote' ? 'Promoted' : 'Declined', rankId: p.rank_id, rank: p.rank_name };
  });
}
module.exports = { gradeFor, overview, apply, withdraw, feedbackShape, windowOf, panelShape, myPanels, candidates, submitResult, examinerPanel, GRADE_LEAD_MIN, adminOverview, decideApplication, decidePromotion };
