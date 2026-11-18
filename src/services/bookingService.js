'use strict';
/* Booking and cancelling HQ classes. All rules are enforced here (the pages only show hints).
   Rules: HQ + online-bookable + not private; not closed or cancelled; inside the booking window (policy_setting);
   the class suits the student (classRules); no duplicate or overlapping booking; a seat is free; a valid lesson pack or Unlimited plan covers it.
   Cancel: at least cancel_hours before the start returns the lesson, later does not. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden, badRequest, AppError } = require('../utils/errors');
const studentModel = require('../models/studentModel');
const packageModel = require('../models/packageModel');
const attendanceModel = require('../models/attendanceModel');
const sessionModel = require('../models/sessionModel');
const closureModel = require('../models/closureModel');
const policyModel = require('../models/policyModel');
const classRules = require('./classRules');
const { ageOn } = require('./accountService');

const startOf = s => clock.at(s.session_date, s.start_time);

/* the student facts classRules needs, for a given class day */
const studentFacts = (profile, day) => ({ ageGroup: profile.age_group, gender: profile.gender, ageOnDay: ageOn(profile.dob, day), rankOrder: profile.rank_order });

async function book(user, lessonId) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    const today = clock.today(), now = clock.now();
    const profile = await studentModel.getProfile(user.id, tx);
    if (!profile || profile.account_status !== 'Active') throw forbidden('Your membership is not active. Please contact the HQ office.', 'MEMBERSHIP_INACTIVE');
    const s = await sessionModel.getForBooking(lessonId, tx);
    if (!s) throw notFound('That class does not exist.', 'CLASS_NOT_FOUND');
    if (s.dojo_id !== 'hq' || s.is_private || !s.online_bookable) throw forbidden('Only HQ group classes can be booked online.', 'NOT_BOOKABLE');
    if (s.status !== 'Scheduled') throw conflict('That class is cancelled.', 'CLASS_CLOSED');
    const closures = await closureModel.listOverlapping('hq', s.session_date, s.session_date, tx);
    if (closures.length) throw conflict('HQ is closed on that day.', 'CLASS_CLOSED');
    const policies = await policyModel.getAll(tx);
    if (s.session_date < clock.addDays(today, policies.booking_min_days)) throw conflict(`Classes can be booked until ${policies.booking_min_days} day before they start.`, 'TOO_LATE');
    if (s.session_date > clock.addMonths(today, policies.booking_ahead_months)) throw conflict(`Classes can be booked up to ${policies.booking_ahead_months} month ahead.`, 'TOO_EARLY');
    const why = classRules.whyNot(studentFacts(profile, s.session_date), s);
    if (why) throw forbidden(`${s.class_type} is for ${why.toLowerCase()}.`, 'NOT_ELIGIBLE', { reason: why });
    const mine = await attendanceModel.getRow(lessonId, user.id, tx, true);
    if (mine && mine.attendance_status !== 'Cancelled') throw conflict('You have already booked this class.', 'ALREADY_BOOKED');
    const clash = await attendanceModel.findOverlap(user.id, s.session_date, s.start_time, s.end_time, lessonId, tx);
    if (clash) throw conflict(`This clashes with your ${clash.class_type} class at the same time.`, 'TIME_CLASH');
    if (s.taken >= s.capacity) throw conflict('This class is full.', 'CLASS_FULL');
    await packageModel.sweep(user.id, today, tx);
    const pack = await packageModel.pickCredit(user.id, s.session_date, tx);
    if (!pack) throw conflict('You have no lessons that cover this class. Top up your package first.', 'NO_CREDIT');
    if (!pack.unlimited) await packageModel.useLesson(pack.id, tx);
    const ok = await attendanceModel.book({ lessonId, userId: user.id, packageId: pack.id, bookedAt: now, via: 'online' }, tx);
    if (!ok) throw conflict('You have already booked this class.', 'ALREADY_BOOKED');
    const after = await packageModel.getOwn(pack.id, user.id, tx);
    return {
      booking: { lessonId, date: s.session_date, time: s.start_time, end: s.end_time, type: s.class_type, ins: s.instructor_name, packageId: pack.id, unlimited: !!pack.unlimited },
      package: { id: after.id, name: after.name, left: after.lessons_left, status: after.status, unlimited: !!after.unlimited }
    };
  });
}

async function cancel(user, lessonId) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    const today = clock.today(), now = clock.now();
    const row = await attendanceModel.getRow(lessonId, user.id, tx, true);
    if (!row || row.attendance_status !== 'Booked') throw notFound('You have no booking for that class.', 'NOT_BOOKED');
    const start = clock.at(row.session_date, row.start_time);
    if (now >= start) throw conflict('That class has already started.', 'TOO_LATE');
    const policies = await policyModel.getAll(tx);
    const hours = clock.diffHours(now, start);
    const pack = row.student_package_id ? await packageModel.getOwn(row.student_package_id, user.id, tx, true) : null;
    const early = hours >= policies.cancel_hours;
    let refunded = false;
    if (pack && !pack.unlimited && early) { await packageModel.returnLesson(pack.id, today, tx); refunded = true; }
    const note = !pack ? 'Cancelled by student' : pack.unlimited ? 'Cancelled by student (Unlimited plan, nothing deducted)'
      : early ? 'Cancelled by student; lesson returned' : `Late cancellation (under ${policies.cancel_hours} hours); lesson kept`;
    if (!(await attendanceModel.cancel(lessonId, user.id, note, tx))) throw new AppError(409, 'NOT_BOOKED', 'That booking was already changed.');
    const after = pack ? await packageModel.getOwn(pack.id, user.id, tx) : null;
    return { refunded, package: after ? { id: after.id, name: after.name, left: after.lessons_left, status: after.status, unlimited: !!after.unlimited } : null };
  });
}

const mondayOf = day => {
  const wd = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return clock.addDays(day, -wd);
};

/* the HQ timetable for one week, with this student's view of each class */
async function timetable(user, weekStart) {
  return withTx(async tx => {
    const today = clock.today();
    const thisMon = mondayOf(today);
    const week = weekStart || thisMon;
    if (mondayOf(week) !== week || week < thisMon || week > clock.addDays(thisMon, 28)) throw badRequest('Choose a week between this week and 4 weeks ahead.', 'INVALID_WEEK');
    const profile = await studentModel.getProfile(user.id, tx);
    const policies = await policyModel.getAll(tx);
    const to = clock.addDays(week, 6);
    const [rows, closures] = await Promise.all([sessionModel.listHqRange(week, to, user.id, tx), closureModel.listOverlapping('hq', week, to, tx)]);
    const minDay = clock.addDays(today, policies.booking_min_days), maxDay = clock.addMonths(today, policies.booking_ahead_months);
    const closed = day => closures.find(c => c.from_date <= day && day <= c.to_date);
    const sessions = rows.map(s => {
      const why = classRules.whyNot(studentFacts(profile, s.session_date), s);
      let state = 'open';
      if (s.status === 'Cancelled') state = 'cancelled';
      else if (s.my_status && s.my_status !== 'Cancelled') state = 'booked';
      else if (why) state = 'blocked';
      else if (closed(s.session_date)) state = 'closed';
      else if (s.session_date < minDay) state = 'tooSoon';
      else if (s.session_date > maxDay) state = 'tooLate';
      else if (s.taken >= s.capacity) state = 'full';
      return { lessonId: s.lesson_id, templateId: s.template_id, date: s.session_date, time: s.start_time, end: s.end_time, type: s.class_type, ins: s.instructor_name, cap: s.capacity, left: Math.max(0, s.capacity - s.taken), kids: !!s.kids_only, state, whyNot: why };
    });
    return {
      weekStart: week, today, sessions,
      closures: closures.map(c => ({ id: c.id, from: c.from_date, to: c.to_date, note: c.note })),
      policies: { aheadMonths: policies.booking_ahead_months, minDays: policies.booking_min_days, cancelHours: policies.cancel_hours }
    };
  });
}

module.exports = { book, cancel, timetable, mondayOf };
