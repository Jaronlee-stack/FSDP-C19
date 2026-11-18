'use strict';
/* Attendance for one lesson. Used by the instructor roster and (later) the desk roster, so the hours are credited in ONE place.
   Rules (plan D18, D19):
   - a class opens 30 minutes before the start; it is over at its end time or once the instructor ends it
   - Attended credits the lesson length in hours exactly once, on the transition into Attended (Weapons classes also add weapon hours)
   - No-Show credits nothing (the lesson stays used)
   - Attended can never be undone (409 ALREADY_COUNTED) */
const clock = require('../utils/clock');
const { notFound, forbidden, conflict } = require('../utils/errors');
const sessionModel = require('../models/sessionModel');
const attendanceModel = require('../models/attendanceModel');
const studentModel = require('../models/studentModel');

const OPEN_LEAD_MIN = 30;
const STATUSES = ['Attended', 'No-Show', 'Booked'];

/* where a lesson is in its day, from the server clock: later | open (check-in) | live | done */
function stateOf(session, now = clock.now()) {
  if (session.ended_at || session.status === 'Ended') return 'done';
  const start = clock.at(session.session_date, session.start_time), end = clock.at(session.session_date, session.end_time);
  if (now >= end) return 'done';
  if (now >= start) return 'live';
  return now >= new Date(start.getTime() - OPEN_LEAD_MIN * 60000) ? 'open' : 'later';
}
/* length of the lesson in hours (one decimal, like the student_profile hour columns) */
function lessonHours(session) {
  const mins = (clock.at(session.session_date, session.end_time) - clock.at(session.session_date, session.start_time)) / 60000;
  return Math.round((mins / 60) * 10) / 10;
}
/* the lesson must be this instructor's. The same answer for "not yours" and "does not exist" would hide which ids exist, but a plain
   404 for a missing lesson is more useful to the page, and lesson ids are not secret (they are in the public timetable). */
async function ownLesson(tx, lessonId, actor, lock = false) {
  const s = await sessionModel.getForInstructor(lessonId, tx, lock);
  if (!s) throw notFound('That class was not found.', 'LESSON_NOT_FOUND');
  if (actor.role === 'instructor' && s.instructor_id !== actor.id) throw forbidden('That is not one of your classes.', 'NOT_YOUR_CLASS');
  return s;
}
/* the open/ended checks shared by marking and ending. Only instructors are held to the clock; a desk correction (actor.role 'admin') is not. */
function assertMarkable(session, actor) {
  if (session.status === 'Cancelled') throw conflict('This class was cancelled.', 'CLASS_CANCELLED');
  if (actor.role !== 'instructor') return;
  const st = stateOf(session);
  if (st === 'later') throw conflict('Attendance opens 30 minutes before the class starts.', 'CLASS_NOT_OPEN');
  if (st === 'done') throw conflict('This class has ended, so its attendance is locked.', 'CLASS_ENDED');
}

/* mark one person. Call inside withTx and pass the transaction client. `lesson` can be passed when the caller already loaded it. */
async function mark(tx, { lessonId, userId, status, actor, reason = null, lesson = null }) {
  if (!STATUSES.includes(status)) throw conflict('Unknown attendance status.', 'BAD_STATUS');
  const session = lesson || await ownLesson(tx, lessonId, actor, true);
  assertMarkable(session, actor);
  const row = await attendanceModel.lockRow(lessonId, userId, tx);
  if (!row || row.attendance_status === 'Cancelled') throw notFound('That person is not on this class.', 'NOT_ON_CLASS');
  const from = row.attendance_status;
  const out = { status, changed: false, hours: 0, credited: false };
  if (from === status) return out;                                  // marking the same thing again changes nothing
  if (from === 'Attended') throw conflict('This student is already counted as present. Attendance cannot be undone.', 'ALREADY_COUNTED');
  const markedBy = actor.role === 'instructor' ? actor.id : null;
  await attendanceModel.setStatus(lessonId, userId, status, markedBy, clock.now(), reason, tx);
  out.changed = true;
  if (status === 'Attended') {
    const hours = lessonHours(session);
    out.credited = await studentModel.addHours(userId, hours, session.class_type === 'Weapons', tx);   // false for a guest: no hours counter
    out.hours = out.credited ? hours : 0;
  }
  return out;
}

/* End class: lists get their status, everyone still Booked becomes a No-Show, then the lesson is locked */
async function endClass(tx, { lessonId, actor, present = [], noShow = [] }) {
  const session = await ownLesson(tx, lessonId, actor, true);
  assertMarkable(session, actor);
  for (const userId of present) await mark(tx, { lessonId, userId, status: 'Attended', actor, lesson: session });
  for (const userId of noShow) {
    const row = await attendanceModel.lockRow(lessonId, userId, tx);
    if (row && row.attendance_status === 'Attended') continue;       // already counted present: it stays that way
    await mark(tx, { lessonId, userId, status: 'No-Show', actor, lesson: session });
  }
  for (const userId of await attendanceModel.listBookedIds(lessonId, tx)) await mark(tx, { lessonId, userId, status: 'No-Show', actor, lesson: session });
  const endedAt = clock.now();
  await sessionModel.markEnded(lessonId, endedAt, tx);
  const c = await attendanceModel.counts(lessonId, tx);
  return { present: c.present, noShow: c.no_show, endedAt: endedAt.toISOString() };
}

module.exports = { mark, endClass, stateOf, lessonHours, ownLesson, OPEN_LEAD_MIN };
