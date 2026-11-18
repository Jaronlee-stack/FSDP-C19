'use strict';
/* Public trial / guest-pass booking. The price is looked up here by pass id; the client amount is never read.
   A guest is a users row with role 'guest' and a random hash nobody knows, so a guest cannot sign in. */
const crypto = require('node:crypto');
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { conflict, badRequest, notFound } = require('../utils/errors');
const password = require('../utils/password');
const userModel = require('../models/userModel');
const guestModel = require('../models/guestModel');
const sessionModel = require('../models/sessionModel');
const attendanceModel = require('../models/attendanceModel');
const closureModel = require('../models/closureModel');
const { nextId } = require('../models/ids');

/* id -> [stored pass_type, price (S$), needs: 'session' | 'first' | 'time', days the pass is valid including the first day] */
const PASSES = {
  local: { trial: ['trial', 29, 'session', 1], single: ['single', 40, 'session', 1], day: ['day', 50, 'first', 1], week: ['week', 150, 'first', 7], private: ['private', 120, 'time', 1] },
  overseas: { trial: ['trial', 29, 'session', 1], oday: ['day', 40, 'first', 1], oweek: ['week', 120, 'first', 7], omonth: ['month', 350, 'first', 30], private: ['private', 120, 'time', 1] }
};
const TRIAL_BLOCKED = ['Intermediate', 'Advanced', 'Weapons'];
const WINDOW_DAYS = 30;

const sessionShape = s => ({ lessonId: s.lesson_id, time: s.start_time, end: s.end_time, type: s.class_type, ins: s.instructor_name, cap: s.capacity, left: Math.max(0, s.capacity - s.taken), kids: !!s.kids_only });

function dateInWindow(date) {
  const today = clock.today();
  if (date < today || date > clock.addDays(today, WINDOW_DAYS)) throw badRequest(`Pick a date within the next ${WINDOW_DAYS} days.`, 'INVALID_DATE');
}

/* HQ classes a visitor can join on a day (full classes are listed with left = 0 so the page can hide them) */
async function sessionsOn(date) {
  dateInWindow(date);
  const closed = (await closureModel.listOverlapping('hq', date, date)).length > 0;
  if (closed) return [];
  return (await sessionModel.listHqDay(date)).map(sessionShape);
}

async function book(input) {
  return withTx(async tx => {
    const today = clock.today(), now = clock.now();
    const table = input.overseas ? PASSES.overseas : PASSES.local;
    const pass = table[input.passId];
    if (!pass) throw badRequest('That pass is not available.', 'INVALID_PASS');
    const [passType, amount, need, days] = pass;
    dateInWindow(input.date);
    let session = null;
    if (need === 'time') {
      if (!input.time) throw badRequest('Pick a preferred time.', 'VALIDATION_ERROR');
    } else if (need === 'session' || input.lessonId) {
      if (!input.lessonId) throw badRequest('Pick a class.', 'VALIDATION_ERROR');
      session = await sessionModel.getForBooking(input.lessonId, tx);
      if (!session || session.dojo_id !== 'hq' || session.is_private || !session.online_bookable || session.status !== 'Scheduled' || session.session_date !== input.date) throw notFound('That class is not available.', 'CLASS_NOT_FOUND');
      if ((await closureModel.listOverlapping('hq', input.date, input.date, tx)).length) throw conflict('HQ is closed on that day.', 'CLASS_CLOSED');
      const child = input.who === 'Child';
      const suits = child ? (session.kids_only || session.class_type === 'Mixed') : !session.kids_only && session.class_type !== 'SG50';
      if (!suits) throw conflict(`That class is not suitable for ${child ? 'a child' : 'an adult'}.`, 'NOT_ELIGIBLE');
      if (passType === 'trial' && TRIAL_BLOCKED.includes(session.class_type)) throw conflict('A trial session must be a beginner-friendly class.', 'NOT_ELIGIBLE');
      if (session.taken >= session.capacity) throw conflict('This class is full.', 'CLASS_FULL');
    }
    let user = await userModel.findByEmail(input.email, tx);
    if (user && user.role !== 'guest') throw conflict('Please use a different email address for guest passes.', 'EMAIL_IN_USE');
    if (!user) {
      const id = await nextId(tx, 'users', 'id', 'G-', 2);
      const hash = await password.hash(crypto.randomBytes(24).toString('hex'));
      await userModel.insertUser({ id, role: 'guest', email: input.email, passwordHash: hash, createdAt: now }, tx);
      await guestModel.insertProfile({ userId: id, fullName: input.name, contactNo: input.mobile }, tx);
      user = { id };
    } else {
      await guestModel.updateContact(user.id, input.name, input.mobile, tx);
    }
    if (passType === 'trial' && (await guestModel.hasTrial(user.id, tx))) throw conflict('A trial session is once per person.', 'TRIAL_USED');
    const passRef = await nextId(tx, 'guest_pass', 'id', 'GP-', 2);
    await guestModel.insertPass({ id: passRef, userId: user.id, passType, amount, at: now, validUntil: passType === 'trial' ? null : clock.addDays(input.date, days - 1) }, tx);
    if (session) await attendanceModel.addGuestBooking(session.lesson_id, user.id, now, tx);
    return { reference: passRef, guestId: user.id, passId: input.passId, passType, amount, lessonId: session ? session.lesson_id : null, date: input.date, today };
  });
}

module.exports = { sessionsOn, book, PASSES };
