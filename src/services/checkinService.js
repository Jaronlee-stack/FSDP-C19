'use strict';
/* A student scans a QR code (or taps an NFC tag that opens the same link). The page calls this once the student is signed in.
   It never fails for a wrong dojo or a wrong time: nothing is recorded and the student simply lands on their home page.
   When the scan is accepted, the attendance goes through attendanceService.mark, so the hours are credited in the same one place
   as an instructor marking the student present. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { nextId } = require('../models/ids');
const dojoModel = require('../models/dojoModel');
const studentModel = require('../models/studentModel');
const sessionModel = require('../models/sessionModel');
const checkinModel = require('../models/checkinModel');
const attendanceService = require('./attendanceService');
const rules = require('./checkinRules');

const LANDING = '/student_portal/index.html';
const SUCCESS = '/student_portal/checkin.html';

/* what the page needs: what happened, why not (when nothing was recorded), where to go next, and the class it was recorded for */
const outcome = (status, extra = {}) => ({
  status,                                                   // 'marked' | 'already' | 'none'
  reason: extra.reason || null,                             // INVALID_CODE | WRONG_DOJO | NO_BOOKING | OUTSIDE_WINDOW
  lessonId: extra.lessonId || null,
  lesson: extra.lesson || null,                             // { type, date, start, end, instructor, venue } for marked and already
  at: extra.at || null,                                     // when the check-in was recorded (marked only)
  redirect: status === 'none' ? LANDING : `${SUCCESS}?lesson=${encodeURIComponent(extra.lessonId)}`
});
const lessonView = (l, dojo) => ({ type: l.class_type, date: l.session_date, start: l.start_time, end: l.end_time, instructor: l.instructor_name, venue: dojo.name });

async function scan(user, token) {
  return withTx(async tx => {
    const dojo = await dojoModel.findByQrToken(token, tx);
    if (!dojo) return outcome('none', { reason: 'INVALID_CODE' });

    const now = clock.now();
    const profile = await studentModel.getProfile(user.id, tx);
    const rows = await checkinModel.bookingsAtDojoOn(user.id, dojo.id, clock.ymd(now), tx);
    const bookings = rows.map(r => ({ lessonId: r.lesson_id, start: clock.at(r.session_date, r.start_time), attended: r.attendance_status === 'Attended' }));

    const d = rules.decide({ dojoId: dojo.id, studentDojoId: profile && profile.dojo_id, now, bookings });
    if (d.action === 'none') return outcome('none', d);

    const lesson = await sessionModel.getById(d.lessonId, tx);
    if (d.action === 'marked') {
      await attendanceService.mark(tx, { lessonId: d.lessonId, userId: user.id, status: 'Attended', actor: { role: 'student', id: user.id }, lesson });
      await checkinModel.insert({ id: await nextId(tx, 'check_in', 'id', 'CI-', 2), userId: user.id, dojoId: dojo.id, lessonId: d.lessonId, at: now }, tx);
    }
    return outcome(d.action, { ...d, lesson: lessonView(lesson, dojo), at: d.action === 'marked' ? now.toISOString() : null });
  });
}

module.exports = { scan, LANDING, SUCCESS };
