'use strict';
/* Front desk: the Today page, the Classes page and a class roster (book, cancel, walk-ins, waitlist, attendance, submit).
   Front desk and Business Admin both use these. The only Business-Admin-only step is a booking override (checked here, not only on the route).
   Every rule is enforced here; the page only shows hints. */
const crypto = require('node:crypto');
const config = require('../config');
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden, badRequest } = require('../utils/errors');
const password = require('../utils/password');
const sessionModel = require('../models/sessionModel');
const attendanceModel = require('../models/attendanceModel');
const waitlistModel = require('../models/waitlistModel');
const memberModel = require('../models/memberModel');
const studentModel = require('../models/studentModel');
const packageModel = require('../models/packageModel');
const closureModel = require('../models/closureModel');
const policyModel = require('../models/policyModel');
const guestModel = require('../models/guestModel');
const userModel = require('../models/userModel');
const paymentModel = require('../models/paymentModel');
const equipmentModel = require('../models/equipmentModel');
const followupModel = require('../models/followupModel');
const mcModel = require('../models/mcModel');
const applicationModel = require('../models/applicationModel');
const { nextId } = require('../models/ids');
const classRules = require('./classRules');
const attendanceService = require('./attendanceService');
const { ageOn } = require('./accountService');
const auditService = require('./auditService');

const isBA = user => user.adminType === 'business';
const actorOf = user => ({ role: 'admin', id: user.id });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = ymd => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;
const money = n => `S$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const HOW = { online: 'Online', desk: 'Desk', 'walk-in': 'Walk-in', waitlist: 'Waitlist offer' };
const STATUS_OUT = { Booked: 'booked', Attended: 'present', 'No-Show': 'noshow' };
const TRIAL_BLOCKED = ['Intermediate', 'Advanced', 'Weapons'];

/* where a class is in its day: Upcoming, Check-in open, Attendance pending, Done or Cancelled. A class from before yesterday that nobody submitted counts as Done. */
function stateOf(s, closure, now = clock.now(), today = clock.today()) {
  if (s.status === 'Cancelled' || closure) return 'Cancelled';
  if (s.status === 'Ended') return 'Done';
  const start = clock.at(s.session_date, s.start_time), end = clock.at(s.session_date, s.end_time);
  if (now < new Date(start.getTime() - 30 * 60000)) return 'Upcoming';
  if (now < end) return 'Check-in open';
  return clock.diffDays(s.session_date, today) > 1 ? 'Done' : 'Attendance pending';
}
const closureOn = (closures, s) => closures.find(c => c.dojo_id === s.dojo_id && c.from_date <= s.session_date && s.session_date <= c.to_date) || null;
const ruleText = s => (s.kids_only ? 'Children only' : s.class_type === 'Ladies' ? 'Ladies only' : s.class_type === 'SG50' ? 'Ages 50 and above'
  : classRules.MIN_RANK_ORDER[s.class_type] ? classRules.MIN_RANK_ORDER[s.class_type].why : 'Open to all grades');

const sessionShape = (s, closure, now, today) => ({
  lessonId: s.lesson_id, date: s.session_date, time: s.start_time, end: s.end_time, mat: s.mat, type: s.class_type, dojoId: s.dojo_id, dojoName: s.dojo_name,
  instructor: s.instructor_name, cap: s.capacity, booked: s.taken, present: s.present, guests: s.guests, waitlist: s.waitlist, kids: !!s.kids_only, private: !!s.is_private,
  status: s.status, state: stateOf(s, closure, now, today), closure: closure ? { id: closure.id, note: closure.note } : null, rule: ruleText(s)
});

/* what the access rules need to know about a student */
const factsOf = (st, day) => ({ ageGroup: st.age_group, gender: st.gender, ageOnDay: ageOn(st.dob, day), rankOrder: st.rank_order });
/* access check for one student on a class day: { s: 'ok' | 'warn' | 'bad', t: text } */
function accessOf(st, session, day) {
  if (!st) return { s: 'ok', t: 'Eligible' };
  const why = classRules.whyNot(factsOf(st, day), session);
  if (why) return { s: 'bad', t: `Not eligible · ${why}` };
  if (st.account_status === 'Lapsed') return { s: 'bad', t: 'Dues unpaid' };
  if (st.account_status !== 'Active') return { s: 'bad', t: `Membership ${String(st.account_status || 'inactive').toLowerCase()}` };
  if (st.owed > 0) return { s: 'bad', t: `Dues unpaid · ${money(st.owed)}` };
  if (st.pkg_exp && st.pkg_exp < day) return { s: 'bad', t: 'Package expired' };
  if (st.pkg_exp && clock.diffDays(day, st.pkg_exp) <= 14) return { s: 'warn', t: `Package expiring · ${fmtShort(st.pkg_exp)}` };
  return { s: 'ok', t: 'Eligible' };
}

/* ---------- Classes page ---------- */
async function listClasses(user, { from, to, dojo = 'hq' }) {
  const now = clock.now(), today = clock.today();
  const [rows, closures] = await Promise.all([sessionModel.listDesk(dojo, from, to), closureModel.listOverlapping(dojo, from, to)]);
  return { today, from, to, dojoId: dojo, sessions: rows.map(s => sessionShape(s, closureOn(closures, s), now, today)), closures: closures.map(c => ({ id: c.id, from: c.from_date, to: c.to_date, note: c.note })) };
}

/* ---------- Roster page ---------- */
async function rosterOf(lessonId, db) {
  const s = await sessionModel.getDesk(lessonId, db);
  if (!s) throw notFound('That class was not found.', 'LESSON_NOT_FOUND');
  const today = clock.today(), now = clock.now();
  const closure = closureOn(await closureModel.listOverlapping(s.dojo_id, s.session_date, s.session_date, db), s);
  const [rows, wait] = await Promise.all([attendanceModel.deskRoster(lessonId, db), waitlistModel.list(lessonId, db)]);
  const stats = new Map((await memberModel.statsByIds(rows.filter(r => !r.is_guest).map(r => r.user_id), today, db)).map(x => [x.user_id, x]));
  const out = rows.map(r => {
    const st = stats.get(r.user_id);
    const guest = !!r.is_guest;
    const access = guest ? { s: 'ok', t: 'Guest pass' } : accessOf(st, s, s.session_date);
    const rem = r.remarks || '';
    return {
      userId: r.user_id, memberNo: r.member_no || null, name: r.full_name, rankId: r.rank_id || null, rank: r.rank_name || null, guest, mobile: guest ? r.guest_mobile : null,
      how: HOW[r.booked_via] || 'Online', status: STATUS_OUT[r.attendance_status] || 'booked', access,
      override: /^Override:/.test(rem) ? rem.replace(/^Override:\s*/, '') : null, correction: /^Correction by/.test(rem) ? rem : null
    };
  });
  const submitted = s.status === 'Ended' ? { at: s.ended_at } : null;
  return {
    session: sessionShape(s, closure, now, today), rows: out,
    waitlist: wait.map(w => ({ userId: w.user_id, memberNo: w.member_no, name: w.full_name })),
    corrections: out.filter(r => r.correction).map(r => ({ userId: r.userId, name: r.name, text: r.correction })),
    submitted, counts: { booked: out.length, present: out.filter(r => r.status === 'present').length, walkins: out.filter(r => r.guest).length, wait: wait.length }
  };
}
const roster = (user, lessonId) => rosterOf(lessonId);

/* a class that can still take changes: HQ, not cancelled, not ended, HQ open that day */
async function openLesson(tx, lessonId, { needHq = true } = {}) {
  const s = await sessionModel.getDesk(lessonId, tx, true);
  if (!s) throw notFound('That class was not found.', 'LESSON_NOT_FOUND');
  if (needHq && s.dojo_id !== 'hq') throw forbidden('The desk only manages HQ classes.', 'NOT_BOOKABLE');
  if (s.status === 'Cancelled') throw conflict('This class is cancelled.', 'CLASS_CLOSED');
  if (s.status === 'Ended') throw conflict('This class has been submitted, so it is closed.', 'CLASS_ENDED');
  if ((await closureModel.listOverlapping(s.dojo_id, s.session_date, s.session_date, tx)).length) throw conflict('HQ is closed on that day.', 'CLASS_CLOSED');
  return s;
}

/* ---------- book a student ---------- */
async function addBooking(user, lessonId, { memberNo, override = false, reason = null, via = 'desk' }, tx) {
  const today = clock.today(), now = clock.now();
  const s = await openLesson(tx, lessonId);
  if (s.is_private) throw forbidden('A private lesson is not booked from the roster.', 'NOT_BOOKABLE');
  if (clock.at(s.session_date, s.start_time) <= now) throw conflict('This class has already started.', 'TOO_LATE');
  const policies = await policyModel.getAll(tx);
  if (s.session_date > clock.addMonths(today, policies.booking_ahead_months)) throw conflict(`Classes can be booked up to ${policies.booking_ahead_months} month ahead.`, 'TOO_EARLY');
  if (override && !isBA(user)) throw forbidden('Only a Business Admin can override a booking rule.', 'BUSINESS_ADMIN_ONLY');
  if (override && !reason) throw badRequest('An override needs a reason.', 'REASON_REQUIRED');
  const st = await memberModel.findByMemberNo(memberNo, today, tx);
  if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
  await studentModel.lock(st.user_id, tx);
  const mine = await attendanceModel.getRow(lessonId, st.user_id, tx, true);
  if (mine && mine.attendance_status !== 'Cancelled') throw conflict('This student is already booked on this class.', 'ALREADY_BOOKED');
  const clash = await attendanceModel.findOverlap(st.user_id, s.session_date, s.start_time, s.end_time, lessonId, tx);
  if (clash) throw conflict(`This clashes with their ${clash.class_type} class at the same time.`, 'TIME_CLASH');
  const access = accessOf(st, s, s.session_date);
  if (access.s === 'bad' && !override) throw forbidden(access.t, 'NOT_ELIGIBLE', { reason: access.t });
  if (s.taken >= s.capacity && !override) throw conflict('This class is full.', 'CLASS_FULL');
  await packageModel.sweep(st.user_id, today, tx);
  const pack = await packageModel.pickCredit(st.user_id, s.session_date, tx);
  if (!pack && !override) throw conflict('This student has no lessons that cover this class.', 'NO_CREDIT');
  if (pack && !pack.unlimited) await packageModel.useLesson(pack.id, tx);
  await attendanceModel.book({ lessonId, userId: st.user_id, packageId: pack ? pack.id : null, bookedAt: now, via, remarks: override ? `Override: ${reason}` : null }, tx);
  if (override) {
    await auditService.record(tx, user, { action: 'booking.overridden', entityType: 'lesson', entityId: lessonId, summary: `Booked ${st.full_name} (${st.member_no}) onto ${lessonId} with an override`,
      details: { memberNo: st.member_no, userId: st.user_id, reason, noCredit: !pack } });
  }
  return { userId: st.user_id, memberNo: st.member_no, name: st.full_name, lessonUsed: !!(pack && !pack.unlimited) };
}
const book = (user, lessonId, body) => withTx(async tx => ({ row: await addBooking(user, lessonId, body, tx) }));

/* ---------- cancel a booking ---------- */
async function cancelBooking(user, lessonId, userId, { refund, reason }) {
  return withTx(async tx => {
    const today = clock.today(), now = clock.now();
    const s = await openLesson(tx, lessonId);
    const row = await attendanceModel.getRow(lessonId, userId, tx, true);
    if (!row || row.attendance_status !== 'Booked') throw notFound('That student has no booking on this class.', 'NOT_BOOKED');
    const policies = await policyModel.getAll(tx);
    const early = clock.diffHours(now, clock.at(s.session_date, s.start_time)) >= policies.cancel_hours;
    const giveBack = refund === undefined ? early : refund;
    const pack = row.student_package_id ? await packageModel.getById(row.student_package_id, tx, true) : null;
    let refunded = false;
    if (giveBack && pack && !pack.unlimited) { await packageModel.returnLesson(pack.id, today, tx); refunded = true; }
    const note = `Cancelled at the desk by ${user.id}${reason ? ': ' + reason : ''}; ${refunded ? 'lesson returned' : 'lesson not returned'}`;
    if (!(await attendanceModel.cancel(lessonId, userId, note, tx))) throw conflict('That booking was already changed.', 'NOT_BOOKED');
    await auditService.record(tx, user, { action: 'booking.cancelled_by_staff', entityType: 'lesson', entityId: lessonId, summary: `Cancelled the booking of ${userId} on ${lessonId} (${refunded ? 'lesson returned' : 'lesson not returned'})`,
      details: { userId, refund: refunded, reasonGiven: !!reason } });
    return { refunded };
  });
}

/* ---------- walk-in guests ---------- */
const digitsOf = s => String(s || '').replace(/\D/g, '');
async function newGuest(tx, { name, mobile, email }) {
  const id = await nextId(tx, 'users', 'id', 'G-', 2);
  const hash = await password.hash(crypto.randomBytes(24).toString('hex'));
  const mail = email || `walk-in-${id.toLowerCase()}@guest.invalid`;
  if (await userModel.findByEmail(mail, tx)) throw conflict('That email is already used by another account.', 'EMAIL_IN_USE');
  await userModel.insertUser({ id, role: 'guest', email: mail, passwordHash: hash, createdAt: clock.now() }, tx);
  await guestModel.insertProfile({ userId: id, fullName: name, contactNo: mobile }, tx);
  const passId = await nextId(tx, 'guest_pass', 'id', 'GP-', 2);
  await guestModel.insertPass({ id: passId, userId: id, passType: 'trial', amount: 0, at: clock.now(), validUntil: null }, tx);
  return id;
}
async function walkIn(user, lessonId, { guestId, guest }) {
  return withTx(async tx => {
    const now = clock.now();
    const s = await openLesson(tx, lessonId);
    if (s.is_private) throw forbidden('A private lesson does not take walk-ins.', 'NOT_BOOKABLE');
    if (now >= clock.at(s.session_date, s.end_time)) throw conflict('This class is over.', 'CLASS_ENDED');
    let id = guestId;
    if (id) { if (!(await guestModel.exists(id, tx))) throw notFound('No guest has that id.', 'GUEST_NOT_FOUND'); }
    else {
      const digits = digitsOf(guest.mobile);
      if (digits.length < 8) throw badRequest('Add a mobile number with at least 8 digits.', 'VALIDATION_ERROR');
      const same = await guestModel.findByMobile(digits, tx);
      if (same) id = same.user_id;
      else id = await newGuest(tx, guest);
    }
    const pass = await guestModel.usablePass(id, s.session_date, tx, true);
    if (!pass) throw conflict('This guest has no valid pass for this date. A trial is once per person: they need a day or week pass.', 'NO_VALID_PASS');
    if (pass.pass_type === 'trial' && TRIAL_BLOCKED.includes(s.class_type)) throw conflict('A trial session must be a beginner-friendly class.', 'NOT_ELIGIBLE');
    if (s.taken >= s.capacity) throw conflict('This class is full.', 'CLASS_FULL');
    const mine = await attendanceModel.getRow(lessonId, id, tx, true);
    if (mine && mine.attendance_status !== 'Cancelled') throw conflict('This guest is already on this class.', 'ALREADY_BOOKED');
    const clash = await attendanceModel.findOverlap(id, s.session_date, s.start_time, s.end_time, lessonId, tx);
    if (clash) throw conflict('This guest is on another class at the same time.', 'TIME_CLASH');
    await attendanceModel.book({ lessonId, userId: id, packageId: null, bookedAt: now, via: 'walk-in' }, tx);
    let consumed = false;
    if (pass.pass_type === 'trial' || pass.pass_type === 'single') { await guestModel.markPassUsed(pass.id, tx); consumed = true; }
    return { guestId: id, passType: pass.pass_type, passConsumed: consumed };
  });
}
async function listGuests() {
  const rows = await guestModel.listWithPass();
  return rows.map(g => ({
    id: g.user_id, name: g.full_name, mobile: g.contact_no, email: g.email, pass: g.pass_type, passId: g.pass_id, used: !!g.used, until: g.valid_until, issuedAt: g.issued_at
  }));
}

/* ---------- waitlist ---------- */
async function waitlistAdd(user, lessonId, { memberNo }) {
  return withTx(async tx => {
    const today = clock.today();
    const s = await openLesson(tx, lessonId);
    const st = await memberModel.findByMemberNo(memberNo, today, tx);
    if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
    if (s.taken < s.capacity) throw conflict('This class still has space. Book the student directly.', 'NOT_FULL');
    if (await attendanceModel.onRoster(lessonId, st.user_id, tx)) throw conflict('This student is already booked on this class.', 'ALREADY_BOOKED');
    const why = accessOf(st, s, s.session_date);
    if (why.s === 'bad') throw forbidden(why.t, 'NOT_ELIGIBLE', { reason: why.t });
    if (!(await waitlistModel.add(lessonId, st.user_id, clock.now(), tx))) throw conflict('This student is already on the waitlist.', 'ALREADY_WAITING');
    return { userId: st.user_id, memberNo: st.member_no, name: st.full_name };
  });
}
async function waitlistRemove(user, lessonId, userId) {
  return withTx(async tx => {
    await openLesson(tx, lessonId);
    if (!(await waitlistModel.remove(lessonId, userId, tx))) throw notFound('That student is not on the waitlist.', 'NOT_WAITING');
    return { ok: true };
  });
}
/* the first in line gets the place if one is free (the booking rules apply, no override) */
async function waitlistOffer(user, lessonId, userId) {
  return withTx(async tx => {
    const s = await openLesson(tx, lessonId);
    if (!(await waitlistModel.has(lessonId, userId, tx))) throw notFound('That student is not on the waitlist.', 'NOT_WAITING');
    if (s.taken >= s.capacity) throw conflict('No space yet. A booking has to be cancelled first.', 'CLASS_FULL');
    const st = (await memberModel.statsByIds([userId], clock.today(), tx))[0];
    const row = await addBooking(user, lessonId, { memberNo: st.member_no, via: 'waitlist' }, tx);
    await waitlistModel.remove(lessonId, userId, tx);
    return { row };
  });
}

/* ---------- attendance ---------- */
async function setAttendance(user, lessonId, userId, { status, reason }) {
  return withTx(async tx => {
    const lesson = await attendanceService.ownLesson(tx, lessonId, actorOf(user), true);
    if (lesson.status === 'Ended' && !reason) throw badRequest('This class was already submitted, so a correction needs a reason.', 'REASON_REQUIRED');
    const text = reason ? `Correction by ${user.id} (${user.name}): ${reason}` : null;
    const before = await attendanceModel.getRow(lessonId, userId, tx);
    const out = await attendanceService.mark(tx, { lessonId, userId, status, actor: actorOf(user), reason: text, lesson });
    await auditService.record(tx, user, { action: 'attendance.corrected', entityType: 'lesson', entityId: lessonId, summary: `Set attendance of ${userId} on ${lessonId} to ${status}`,
      details: { userId, before: before ? before.attendance_status : null, after: status, changed: out.changed, reasonGiven: !!reason } });
    return { status: out.status, changed: out.changed, hours: out.hours };
  });
}
async function submit(user, lessonId, { rows }) {
  return withTx(async tx => {
    const lesson = await attendanceService.ownLesson(tx, lessonId, actorOf(user), true);
    if (lesson.status === 'Ended') throw conflict('This class was already submitted.', 'ALREADY_SUBMITTED');
    if (lesson.status === 'Cancelled') throw conflict('This class was cancelled.', 'CLASS_CANCELLED');
    const roster = await attendanceModel.deskRoster(lessonId, tx);
    if (!roster.length) throw conflict('Nobody is booked for this class.', 'EMPTY_ROSTER');
    const ids = new Set(roster.map(r => r.user_id));
    const given = new Map();
    for (const r of rows) { if (!ids.has(r.userId)) throw notFound('That person is not on this class.', 'NOT_ON_CLASS'); given.set(r.userId, r.status); }
    const present = [], noShow = [];
    for (const r of roster) {
      const st = r.attendance_status === 'Attended' ? 'Attended' : (given.get(r.user_id) || r.attendance_status);
      if (st === 'Attended') present.push(r.user_id); else if (st === 'No-Show') noShow.push(r.user_id);
      else throw conflict('Mark every student present or no-show first.', 'UNMARKED_ROWS');
    }
    const out = await attendanceService.endClass(tx, { lessonId, actor: actorOf(user), present, noShow });
    await auditService.record(tx, user, { action: 'attendance.submitted', entityType: 'lesson', entityId: lessonId, summary: `Submitted attendance for ${lessonId}`, details: { present: out.present, noShow: out.noShow } });
    return out;
  });
}

/* ---------- Today page ---------- */
async function today(user) {
  const day = clock.today(), now = clock.now();
  const [rows, closures] = await Promise.all([sessionModel.listDesk('hq', day, day), closureModel.listOverlapping('hq', day, day)]);
  const classes = rows.map(s => sessionShape(s, closureOn(closures, s), now, day));
  const yesterday = clock.addDays(day, -1);
  const [prev, closuresY] = await Promise.all([sessionModel.listDesk('hq', yesterday, yesterday), closureModel.listOverlapping('hq', yesterday, yesterday)]);
  const pendingY = prev.filter(s => stateOf(s, closureOn(closuresY, s), now, day) === 'Attendance pending').length;
  const pending = classes.filter(c => c.state === 'Attendance pending').length + pendingY;
  const stats = await paymentModel.stats(day, config.APP_TZ);
  // arrivals with an access warning: students booked on the classes still to come today
  const warns = [];
  for (const c of classes.filter(x => ['Upcoming', 'Check-in open'].includes(x.state))) {
    const r = await rosterOf(c.lessonId);
    for (const x of r.rows) if (x.access.s !== 'ok' && !x.guest) warns.push({ name: x.name, text: x.access.t, lessonId: c.lessonId, type: c.type, time: c.time });
  }
  const [apps, eq, fu, mc] = await Promise.all([applicationModel.openCount(), equipmentModel.openCount(), followupModel.dueCount(day), mcModel.pendingCount()]);
  return {
    date: day, dojoName: 'HQ Dojo', closure: closures[0] ? { id: closures[0].id, note: closures[0].note } : null, classes,
    stats: { sessionsToday: classes.filter(c => c.state !== 'Cancelled').length, attendancePending: pending, outstandingCount: stats.outstanding_count, outstandingTotal: stats.outstanding_total, applicationsWaiting: apps },
    waiting: { accessWarnings: warns.slice(0, 10), accessWarningCount: warns.length, equipmentToCollect: eq, followupsDue: fu, mcPending: mc, applications: apps }
  };
}
module.exports = { listClasses, roster, book, cancelBooking, walkIn, listGuests, waitlistAdd, waitlistRemove, waitlistOffer, setAttendance, submit, today, accessOf, stateOf, sessionShape, rosterOf };
