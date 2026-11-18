'use strict';
/* Instructor area. Every lesson route checks class_session.instructor_id = the signed-in instructor (403 NOT_YOUR_CLASS);
   every grading route checks grading_examiner (403 NOT_EXAMINER, in gradingService). Ids always come from req.user. */
const { withTx } = require('../config/db');
const closureModel = require('../models/closureModel');
const clock = require('../utils/clock');
const { badRequest, notFound, conflict, forbidden } = require('../utils/errors');
const instructorModel = require('../models/instructorModel');
const studentModel = require('../models/studentModel');
const sessionModel = require('../models/sessionModel');
const attendanceModel = require('../models/attendanceModel');
const remarkModel = require('../models/remarkModel');
const feedbackModel = require('../models/feedbackModel');
const gradingModel = require('../models/gradingModel');
const { nextId } = require('../models/ids');
const rules = require('./gradingRules');
const attendance = require('./attendanceService');
const gradingService = require('./gradingService');

const MAX_RANGE_DAYS = 62;
const daysSince = (day, today) => (day ? Math.max(0, clock.diffDays(day, today)) : null);

/* ---------- profile + anonymous feedback ---------- */
async function profile(user) {
  const today = clock.today();
  const [me, classes, fill, sum, tags, recent, week] = await Promise.all([
    instructorModel.getProfile(user.id), instructorModel.countTemplates(user.id), instructorModel.fillSince(user.id, clock.addDays(today, -28), today),
    feedbackModel.summaryFor(user.id), feedbackModel.tagCounts(user.id), feedbackModel.recentFor(user.id, 60),
    feedbackModel.countSince(user.id, new Date(clock.now().getTime() - 7 * 864e5))
  ]);
  const students = (await instructorModel.studentsOf(user.id, today)).length;
  return {
    id: me.user_id, name: me.full_name, dan: me.dan_grade, photo: me.photo_file, chief: me.is_chief,
    stats: { classesPerWeek: classes, students, fillPct: fill.cap ? Math.round((fill.taken / fill.cap) * 100) : null },
    feedback: {
      count: sum.n, avg: Math.round(sum.avg * 10) / 10, lastSevenDays: week,
      distribution: { 5: sum.r5, 4: sum.r4, 3: sum.r3, 2: sum.r2, 1: sum.r1 },
      tags: tags.map(t => ({ tag: t.tag, count: t.n })),
      recent: recent.map(f => ({ rating: f.rating, tags: f.tags || [], note: f.note || '', date: clock.ymd(f.created_at), type: f.class_type }))
    }
  };
}

/* ---------- schedule ---------- */
const sessionShape = (s, now) => ({
  lessonId: s.lesson_id, date: s.session_date, time: s.start_time, end: s.end_time, mat: s.mat, type: s.class_type, dojoId: s.dojo_id, dojoName: s.dojo_name,
  booked: s.taken, cap: s.capacity, private: s.is_private, studentName: s.is_private ? s.private_student : null,
  ended: !!s.ended_at, endedAt: s.ended_at ? new Date(s.ended_at).toISOString() : null, state: attendance.stateOf(s, now)
});
async function schedule(user, { from, to }) {
  if (to < from) throw badRequest('The end date is before the start date.', 'INVALID_RANGE');
  if (clock.diffDays(from, to) > MAX_RANGE_DAYS) throw badRequest(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`, 'RANGE_TOO_LONG');
  const now = clock.now();
  const [sessions, panels, closures] = await Promise.all([
    sessionModel.listForInstructor(user.id, from, to), gradingModel.panelsFor(user.id, from, to),
    closureModel.overlapping(from, to)
  ]);
  return {
    sessions: sessions.map(s => sessionShape(s, now)),
    grading: panels.map(p => {
      const win = gradingService.windowOf(p, now), shape = gradingService.panelShape(p);
      return { ...shape, state: p.total && !p.pending ? 'done' : win.state, locked: win.state === 'locked', window: win };
    }),
    closures: closures.map(c => ({ id: c.id, dojoId: c.dojo_id, from: c.from_date, to: c.to_date, note: c.note }))
  };
}

/* ---------- roster ---------- */
const rowShape = (r, today) => ({
  userId: r.user_id, name: r.full_name || 'Guest', memberNo: r.member_no || null, rank: r.rank_name || 'Guest', rankId: r.rank_id || null, photo: null,
  sessions: r.rank_id ? Math.floor(r.accumulated_hours) : 0, need: r.rank_id ? rules.NEED_SESSIONS[r.rank_id] || 0 : 0,
  seen: r.rank_id ? daysSince(r.last_seen || r.joined_on, today) : 0, status: r.attendance_status, how: r.booked_via,
  goingForGrading: !!r.going_for_grading, remark: r.remark || '', gradingNote: r.grading_note || '',
  earlier: (r.earlier || []).map(e => ({ text: e.body, at: e.at, type: e.type || null, date: e.date || null }))
});
async function roster(user, lessonId) {
  const today = clock.today(), now = clock.now();
  const s = await attendance.ownLesson(undefined, lessonId, user);
  const [rows, cr] = await Promise.all([attendanceModel.roster(lessonId, user.id, today), remarkModel.classRemark(lessonId, user.id)]);
  return {
    session: sessionShape(s, now), state: attendance.stateOf(s, now), rows: rows.map(r => rowShape(r, today)),
    classRemark: cr ? { body: cr.body, at: new Date(cr.created_at).toISOString() } : null
  };
}

/* ---------- attendance ---------- */
async function mark(user, lessonId, userId, status) {
  return withTx(async tx => {
    const out = await attendance.mark(tx, { lessonId, userId, status, actor: { role: 'instructor', id: user.id } });
    const after = await studentModel.hoursOf(userId, tx);
    return { status: out.status, changed: out.changed, hours: out.hours, totalHours: after ? after.total_accumulated_hours : null };
  });
}
const endClass = (user, lessonId, body) => withTx(tx => attendance.endClass(tx, { lessonId, actor: { role: 'instructor', id: user.id }, present: body.present, noShow: body.noShow }));

/* ---------- remarks ---------- */
async function upsertRemark(tx, { kind, lessonId, studentId, instructorId, body }) {
  const existing = await remarkModel.findMine({ kind, lessonId, studentId, instructorId }, tx);
  const text = body.trim(), at = clock.now();
  if (!text) { if (existing) await remarkModel.remove(existing.id, tx); return { deleted: true }; }
  if (existing) { await remarkModel.update(existing.id, text, at, tx); return { id: existing.id, body: text, at: at.toISOString() }; }
  const id = await nextId(tx, 'instructor_remark', 'id', 'RM-', 2);
  await remarkModel.insert({ id, kind, lessonId, studentId, instructorId, body: text, at }, tx);
  return { id, body: text, at: at.toISOString() };
}
/* class or student remark. Allowed from the moment the class opens, and still editable after it ends. */
async function remark(user, lessonId, { kind, studentId, body }) {
  return withTx(async tx => {
    const s = await attendance.ownLesson(tx, lessonId, { role: 'instructor', id: user.id });
    if (s.status === 'Cancelled') throw conflict('This class was cancelled.', 'CLASS_CANCELLED');
    if (attendance.stateOf(s) === 'later') throw conflict('Remarks open 30 minutes before the class starts.', 'CLASS_NOT_OPEN');
    if (kind === 'student') {
      if (!studentId) throw badRequest('Say which student the remark is for.', 'STUDENT_REQUIRED');
      if (!(await attendanceModel.onRoster(lessonId, studentId, tx))) throw notFound('That student is not on this class.', 'NOT_ON_CLASS');
    }
    return upsertRemark(tx, { kind, lessonId, studentId: kind === 'student' ? studentId : null, instructorId: user.id, body });
  });
}
/* a note for the examiners and the student. Only for one of my students who has applied for grading or is a candidate. */
async function gradingNote(user, studentId, { lessonId, body }) {
  return withTx(async tx => {
    if (lessonId) await attendance.ownLesson(tx, lessonId, { role: 'instructor', id: user.id });
    if (!(await instructorModel.teaches(user.id, studentId, tx))) throw forbidden('That student has not been in one of your classes.', 'NOT_YOUR_STUDENT');
    const list = (await instructorModel.studentsOf(user.id, clock.today(), tx)).find(x => x.user_id === studentId);
    if (!list || !list.going_for_grading) throw conflict('That student has not applied for grading.', 'NOT_GOING_FOR_GRADING');
    return upsertRemark(tx, { kind: 'grading', lessonId: lessonId || null, studentId, instructorId: user.id, body });
  });
}

/* ---------- students ---------- */
async function students(user) {
  const today = clock.today();
  const rows = await instructorModel.studentsOf(user.id, today);
  return rows.map(r => ({
    userId: r.user_id, name: r.full_name, memberNo: r.member_no, rank: r.rank_name, rankId: r.rank_id, photo: null,
    sessions: Math.floor(r.accumulated_hours), need: rules.NEED_SESSIONS[r.rank_id] || 0, seen: daysSince(r.last_seen || r.joined_on, today),
    status: r.account_status, goingForGrading: !!r.going_for_grading
  }));
}

module.exports = { profile, schedule, roster, mark, endClass, remark, gradingNote, students, MAX_RANGE_DAYS };
