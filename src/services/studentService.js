'use strict';
/* The signed-in student's own data: home, profile, payments, attendance and class ratings.
   Every function takes `user` (req.user) and only ever reads or writes rows of user.id. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden } = require('../utils/errors');
const studentModel = require('../models/studentModel');
const userModel = require('../models/userModel');
const packageModel = require('../models/packageModel');
const paymentModel = require('../models/paymentModel');
const attendanceModel = require('../models/attendanceModel');
const remarkModel = require('../models/remarkModel');
const feedbackModel = require('../models/feedbackModel');
const gradingModel = require('../models/gradingModel');
const { nextId } = require('../models/ids');
const { ageOn } = require('./accountService');
const packageService = require('./packageService');
const gradingService = require('./gradingService');
const { memberStatus } = require('../utils/membership');

const STATUS = { Attended: 'present', 'No-Show': 'noshow', Booked: 'pending' };


const profileShape = (p, today) => ({
  name: p.full_name, memberNo: p.member_no, email: p.email, rank: p.rank_name, rankId: p.rank_id, dojoId: p.dojo_id,
  group: p.age_group === 'Child' ? 'child' : 'adult', gender: p.gender, age: ageOn(p.dob, today),
  joinedOn: p.joined_on, status: memberStatus(p.account_status, p.membership_expiry, today), expiry: p.membership_expiry, lastRenewedAt: p.last_renewed_at,
  hours: { total: p.total_accumulated_hours, accumulated: p.accumulated_hours, weapon: p.weapon_hours }
});
const fullProfileShape = (p, today) => ({
  ...profileShape(p, today), contactNo: p.contact_no, emergencyContact: p.emergency_contact || '', medicalNotes: p.medical_notes || '',
  guardianName: p.guardian_name || '', guardianContact: p.guardian_contact || ''
});

const bookingShape = u => ({ lessonId: u.lesson_id, date: u.session_date, time: u.start_time, end: u.end_time, type: u.class_type, ins: u.instructor_name, packageId: u.student_package_id, packageName: u.package_name || null, unlimited: !!u.unlimited });
const attendanceShape = a => ({ lessonId: a.lesson_id, date: a.session_date, time: a.start_time, end: a.end_time, type: a.class_type, ins: a.instructor_name, status: STATUS[a.attendance_status] });
const paymentShape = p => ({ id: p.id, invoiceNo: p.invoice_no, item: p.item, kind: p.kind, date: p.paid_at || p.created_at, method: p.method, amount: p.amount, status: p.status });

async function home(user) {
  return withTx(async tx => {
    const today = clock.today(), now = clock.now(), nowHm = clock.hhmm(now);
    await packageModel.sweep(user.id, today, tx);
    const profile = await studentModel.getProfile(user.id, tx);
    const active = await packageModel.listActive(user.id, tx);
    const upcoming = await attendanceModel.listUpcoming(user.id, today, nowHm, tx);
    const history = await attendanceModel.listHistory(user.id, today, nowHm, clock.addDays(today, -90), 60, tx);
    const queue = await feedbackModel.rateQueue(user.id, clock.addDays(today, -7), today, nowHm, tx);
    const remarks = await remarkModel.forStudent(user.id, 30, tx);
    const promos = await gradingModel.promotedSince(user.id, clock.at(clock.addDays(today, -7), '00:00'), tx);
    const { grade } = await gradingService.gradeFor(profile, tx, today);
    const dayAgo = new Date(now.getTime() - 24 * 36e5);
    const { passes, unlimited } = packageService.splitActive(active);
    const levelUps = [
      ...history.filter(a => a.attendance_status === 'Attended' && a.marked_at && new Date(a.marked_at) >= dayAgo).map(a => ({ kind: 'session', date: a.session_date, type: a.class_type, lessonId: a.lesson_id })),
      ...promos.map(p => ({ kind: 'promotion', to: p.to_name }))
    ];
    return {
      profile: profileShape(profile, today), packages: passes, unlimited,
      credits: passes.reduce((n, p) => n + p.left, 0),
      upcoming: upcoming.map(bookingShape), attendance: history.map(attendanceShape),
      grade,
      remarks: remarks.map(r => ({ id: r.id, kind: r.kind, lessonId: r.lesson_id, text: r.body, at: r.created_at, by: r.instructor_name, date: r.session_date || null, time: r.start_time || null, type: r.class_type || null })),
      rateQueue: queue.map(q => ({ lessonId: q.lesson_id, date: q.session_date, time: q.start_time, end: q.end_time, type: q.class_type, ins: q.instructor_name })),
      levelUps
    };
  });
}

async function profile(user) {
  const p = await studentModel.getProfile(user.id);
  if (!p) throw notFound('Profile not found.', 'PROFILE_NOT_FOUND');
  return fullProfileShape(p, clock.today());
}

async function updateProfile(user, fields) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    if (fields.email !== undefined) {
      const other = await userModel.findByEmail(fields.email, tx);
      if (other && other.id !== user.id) throw conflict('That email is used by another account.', 'EMAIL_IN_USE');
      await userModel.updateEmail(user.id, fields.email, tx);
    }
    await studentModel.updateProfile(user.id, fields, tx);
    return fullProfileShape(await studentModel.getProfile(user.id, tx), clock.today());
  });
}

async function payments(user) {
  return (await paymentModel.listForUser(user.id)).map(paymentShape);
}
async function payment(user, id) {
  const p = await paymentModel.getOwn(id, user.id);
  if (!p) throw notFound('Payment not found.', 'PAYMENT_NOT_FOUND');
  return paymentShape(p);
}

async function upcoming(user) {
  return (await attendanceModel.listUpcoming(user.id, clock.today(), clock.hhmm(clock.now()))).map(bookingShape);
}
async function attendance(user, limit) {
  const today = clock.today();
  return (await attendanceModel.listHistory(user.id, today, clock.hhmm(clock.now()), clock.addDays(today, -365), limit)).map(attendanceShape);
}

/* anonymous class rating. Only a lesson the student attended can be rated, once. */
async function rate(user, { lessonId, rating, tags, note, skipped }) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    if (!(await attendanceModel.wasAttended(lessonId, user.id, tx))) throw forbidden('You can only rate a class you attended.', 'NOT_ATTENDED');
    if (await feedbackModel.promptState(lessonId, user.id, tx)) throw conflict('You have already answered this class.', 'ALREADY_RATED');
    const now = clock.now();
    if (!skipped) {
      const id = await nextId(tx, 'class_feedback', 'id', 'FB-', 2);
      // cut to the day so a rating cannot be matched to a person by its time
      await feedbackModel.insertAnonymous({ id, lessonId, rating, tags, note: note || null, at: clock.at(clock.today(), '00:00') }, tx);
    }
    await feedbackModel.insertPrompt(lessonId, user.id, skipped ? 'skipped' : 'rated', now, tx);
    return { ok: true };
  });
}

module.exports = { home, profile, updateProfile, payments, payment, upcoming, attendance, rate };
