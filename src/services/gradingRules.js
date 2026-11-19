'use strict';
/* Grading eligibility numbers. Sessions needed depend on the CURRENT rank (the prototype's students.need values). */
const clock = require('../utils/clock');

const NEED_SESSIONS = { '6k': 24, '5k': 30, '4k': 36, '3k': 36, '2k': 48, '1k': 60 };
const NEED_MONTHS_IN_RANK = 6;
const NEED_MEMBER_MONTHS = 3;
/* the colour name shown next to the target rank on the grading page */
const colourName = rankId => ({ '6k': 'White', '5k': 'Yellow', '1d': 'Black' })[rankId] || 'Brown';

/* whole months from a to b ('YYYY-MM-DD'), a month counts once its day of the month is reached */
function monthsBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) - (bd < ad ? 1 : 0);
}

/* Sessions counted toward the next grade = whole hours credited since the last PASSED grading (student_profile.accumulated_hours).
   Each attended class credits its length (1 hour) when the instructor marks it, so one session = one hour; it resets on promotion. */
const sessionsCounted = profile => Math.floor(Number(profile.accumulated_hours));

/* the grading figures for the next rank. `next` is the target belt_rank row (null for the top rank). */
function summarise({ profile, next, session, feesPaid, today }) {
  if (!next) return null;
  const needSessions = NEED_SESSIONS[profile.rank_id];
  const sessions = sessionsCounted(profile);
  const monthsInRank = monthsBetween(profile.last_passed_grading_date || profile.joined_on, today);
  const memberMonths = Math.round(clock.diffDays(profile.joined_on, today) / 30.4375);
  const checks = [
    ['Member for at least 3 months', `${memberMonths} months`, memberMonths >= NEED_MEMBER_MONTHS],
    [`${NEED_MONTHS_IN_RANK} months at current grade`, `${monthsInRank} months`, monthsInRank >= NEED_MONTHS_IN_RANK],
    [`${needSessions} sessions at current grade`, `${sessions} / ${needSessions}`, sessions >= needSessions],
    ['No outstanding membership fees', feesPaid ? 'Paid' : 'Overdue', feesPaid]
  ];
  const late = session && session.application_close_date && today > session.application_close_date;
  return {
    target: next.name, targetId: next.id, targetLabel: `${next.name} (${colourName(next.id)})`,
    date: session ? session.session_date : null, close: session ? session.application_close_date : null, sessionId: session ? session.id : null,
    memberMonths, monthsInRank, needMonths: NEED_MONTHS_IN_RANK, sessions, needSessions, feesPaid,
    checks, eligible: checks.every(c => c[2]), late: !!late
  };
}

/* ---------- examiner rubric (copied from instructor_portal/instructor.js; PROVISIONAL until the centre confirms the sheet) ----------
   Each criterion is scored 0-3 (Problem 0, Pass 1, Good 2, Excellent 3). The result follows the total and is never chosen by hand. */
const EXAM_BANDS = [{ k: 'problem', label: 'Problem', marks: 0 }, { k: 'pass', label: 'Pass', marks: 1 }, { k: 'good', label: 'Good', marks: 2 }, { k: 'excellent', label: 'Excellent', marks: 3 }];
const EXAM_CRITERIA_KEYS = ['Omote', 'Ura'].flatMap(v => ['entry', 'control', 'posture'].map(c => `${v}-${c}`));
const EXAM_MAX = EXAM_CRITERIA_KEYS.length * 3;
const EXAM_PASS_PCT = 0.7, EXAM_RETAKE_PCT = 0.5;
const examTotal = scores => EXAM_CRITERIA_KEYS.reduce((n, k) => n + scores[k], 0);
const examResult = total => (total / EXAM_MAX >= EXAM_PASS_PCT ? 'Pass' : total / EXAM_MAX >= EXAM_RETAKE_PCT ? 'Retake' : 'Fail');
const examPercent = total => Math.round((total / EXAM_MAX) * 10000) / 100;
module.exports = {
  NEED_SESSIONS, NEED_MONTHS_IN_RANK, NEED_MEMBER_MONTHS, monthsBetween, sessionsCounted, summarise, colourName,
  EXAM_BANDS, EXAM_CRITERIA_KEYS, EXAM_MAX, EXAM_PASS_PCT, EXAM_RETAKE_PCT, examTotal, examResult, examPercent
};
