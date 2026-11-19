'use strict';
/* The weekly timetable (Business Admin): a class_template is the plan, a class_session is one dated lesson made from it (12 weeks ahead).
   A plan cannot be saved when the same mat or the same instructor is already in use at that time, when the instructor examines on a
   grading day at that time, or when the HQ hall is used for grading then (the same rules as the view v_grading_conflict). Only HQ classes are bookable online. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const templateModel = require('../models/templateModel');
const memberModel = require('../models/memberModel');
const closureModel = require('../models/closureModel');
const closureService = require('./closureService');
const auditService = require('./auditService');
const { nextId } = require('../models/ids');

const WEEKS_AHEAD = 12;
const DAY3 = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayOf = ymd => (new Date(ymd + 'T00:00:00Z').getUTCDay() + 6) % 7;
const hour12 = hhmm => Number(hhmm.slice(0, 2)) % 12 || 12;
const addMinutes = (hhmm, n) => { const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + n, h = Math.floor(t / 60), m = t % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

const shape = t => ({
  id: t.id, code: t.code, dojoId: t.dojo_id, dojoName: t.dojo_name, day: t.weekday, time: t.start_time, end: t.end_time, mat: t.mat, type: t.class_type,
  instructorId: t.instructor_id, ins: t.instructor_name, cap: t.capacity, kids: t.kids_only, online: t.online_bookable,
  nextLesson: t.next_lesson || null, nextDate: t.next_date || null, booked: t.next_booked || 0
});

async function list({ dojo } = {}) {
  const rows = await templateModel.list(dojo || null, clock.today());
  return { templates: rows.map(shape) };
}

/* a readable code like HQ-MON7-5821 that is not used yet */
async function makeCode(dojoId, weekday, start, tx) {
  const key = dojoId.toUpperCase();
  for (let i = 0; i < 30; i++) {
    const code = `${key}-${DAY3[weekday]}${hour12(start)}-${1000 + Math.floor(Math.random() * 9000)}`;
    if (!(await templateModel.codeTaken(code, tx))) return code;
  }
  throw conflict('Could not make a unique class code. Try again.', 'CODE_TAKEN');
}

/* turn the request into what is stored, and refuse a plan that clashes with something else */
async function prepare(tx, body, selfId) {
  const start = body.start, end = body.end || addMinutes(start, 60);
  if (end <= start) throw badRequest('The class must end after it starts.', 'VALIDATION_ERROR');
  if (!(await memberModel.dojoExists(body.dojoId, tx))) throw notFound('That dojo does not exist.', 'INVALID_DOJO');
  const ins = await templateModel.activeInstructor(body.instructorId, tx);
  if (!ins) throw notFound('That instructor does not exist or is deactivated.', 'INSTRUCTOR_NOT_FOUND');
  if (body.onlineBookable === true && body.dojoId !== 'hq') throw conflict('Only HQ classes can be booked online.', 'ONLINE_HQ_ONLY');
  const t = {
    dojoId: body.dojoId, weekday: body.weekday, start, end, mat: body.mat, type: body.type, instructorId: body.instructorId, capacity: body.capacity,
    kidsOnly: /^Children/.test(body.type), onlineBookable: body.dojoId === 'hq' ? body.onlineBookable !== false : false, selfId
  };
  const when = `on ${DAY_NAME[t.weekday]}`;
  const byIns = await templateModel.instructorClash(t, tx);
  if (byIns) throw conflict(`${ins.full_name} already teaches ${byIns.class_type} at ${byIns.start_time} ${when}.`, 'INSTRUCTOR_BUSY');
  const byMat = await templateModel.matClash(t, tx);
  if (byMat) throw conflict(`${t.mat} is already used by ${byMat.class_type} at ${byMat.start_time} ${when}.`, 'MAT_BUSY');
  const exam = await templateModel.examinerClash(t, tx);
  if (exam) throw conflict(`${ins.full_name} is an examiner for ${exam.label} (${exam.day}) at that time. Pick another time or instructor.`, 'GRADING_CLASH');
  const hall = await templateModel.hallClash(t, tx);
  if (hall) throw conflict(`The hall is used for ${hall.label} (${hall.day}) at that time. Pick another time.`, 'GRADING_CLASH');
  return t;
}

/* the dated lessons for the next 12 weeks. A lesson on a closed day is created as Cancelled and belongs to that closure. */
async function generate(tx, id, t) {
  const today = clock.today(), nowHm = clock.hhmm(), last = clock.addDays(today, WEEKS_AHEAD * 7 - 1);
  const closures = await templateModel.closuresCovering(t.dojoId, today, last, tx);
  const matLetter = (/([A-Za-z0-9])$/.exec(t.mat) || [])[1] || 'A';
  let made = 0;
  for (let day = today; day <= last; day = clock.addDays(day, 1)) {
    if (weekdayOf(day) !== t.weekday) continue;
    if (day === today && t.start <= nowHm) continue;   // a class that has already begun today is not created
    const closure = closures.find(c => c.from_date <= day && day <= c.to_date);
    const lessonId = `LS-${day.replace(/-/g, '')}-${t.start.replace(':', '')}-${t.dojoId.toUpperCase()}-${matLetter.toUpperCase()}`;
    if (await templateModel.insertLesson({
      lessonId, templateId: id, dojoId: t.dojoId, date: day, start: t.start, end: t.end, mat: t.mat, type: t.type, instructorId: t.instructorId, capacity: t.capacity,
      status: closure ? 'Cancelled' : 'Scheduled', closureId: closure ? closure.id : null
    }, tx)) made += 1;
  }
  return made;
}

async function create(user, body) {
  return withTx(async tx => {
    const t = await prepare(tx, body, null);
    const id = await nextId(tx, 'class_template', 'id', 'CT-', 2);
    t.code = await makeCode(t.dojoId, t.weekday, t.start, tx);
    await templateModel.insert({ id, code: t.code, ...t }, tx);
    const lessons = await generate(tx, id, t);
    const row = await templateModel.get(id, tx);
    await auditService.record(tx, user, { action: 'timetable.changed', entityType: 'timetable', entityId: id, summary: `Added a ${t.type} class on ${DAY_NAME[t.weekday]} at ${t.start}`,
      details: { change: 'created', dojoId: t.dojoId, weekday: t.weekday, start: t.start, type: t.type, lessons } });
    return { template: shape(row), lessons };
  });
}

async function update(user, id, body) {
  return withTx(async tx => {
    const cur = await templateModel.get(id, tx, true);
    if (!cur || cur.is_private) throw notFound('That class does not exist.', 'TEMPLATE_NOT_FOUND');
    const t = await prepare(tx, body, id);
    const today = clock.today();
    const upcoming = await templateModel.upcomingLessons(id, today, tx, true);
    const moved = cur.dojo_id !== t.dojoId || cur.weekday !== t.weekday || cur.start_time !== t.start || cur.end_time !== t.end || cur.mat !== t.mat;
    if (upcoming.some(l => l.booked > t.capacity)) throw conflict('A coming lesson already has more bookings than that capacity.', 'CAPACITY_TOO_LOW');
    let lessons = 0;
    if (moved) {
      const withBookings = upcoming.filter(l => l.booked > 0);
      if (withBookings.length) throw conflict(`${withBookings.length} coming ${withBookings.length === 1 ? 'lesson has' : 'lessons have'} bookings. Cancel those lessons first, or change only the instructor, capacity or class type.`, 'HAS_BOOKINGS');
      for (const l of upcoming) await templateModel.deleteLesson(l.lesson_id, tx);
      await templateModel.update(id, t, tx);
      lessons = await generate(tx, id, t);
    } else {
      await templateModel.update(id, t, tx);
      await templateModel.refreshLessons(id, today, t, tx);
    }
    const row = await templateModel.get(id, tx);
    await auditService.record(tx, user, { action: 'timetable.changed', entityType: 'timetable', entityId: id, summary: `Updated the ${t.type} class on ${DAY_NAME[t.weekday]} at ${t.start}`,
      details: { change: 'updated', dojoId: t.dojoId, weekday: t.weekday, start: t.start, type: t.type, moved, lessons } });
    return { template: shape(row), lessons };
  });
}

/* delete the plan: lessons with bookings are cancelled and their lessons returned, empty lessons are removed */
async function remove(user, id) {
  return withTx(async tx => {
    const cur = await templateModel.get(id, tx, true);
    if (!cur || cur.is_private) throw notFound('That class does not exist.', 'TEMPLATE_NOT_FOUND');
    const today = clock.today();
    const upcoming = await templateModel.upcomingLessons(id, today, tx, true);
    let students = 0, lessons = 0, cancelled = 0;
    for (const l of upcoming) {
      if (l.booked > 0) {
        await closureModel.cancelLesson(l.lesson_id, null, tx);
        const r = await closureService.returnLesson(tx, l.lesson_id, 'Cancelled class', today);
        students += r.students; lessons += r.lessons; cancelled += 1;
      } else await templateModel.deleteLesson(l.lesson_id, tx);
    }
    await templateModel.remove(id, tx);
    if (students) await closureService.logNotice(tx, user, `${cur.class_type} · ${DAY_NAME[cur.weekday].slice(0, 3)} ${closureService.to12(cur.start_time)}`, 'Session removed. Lessons returned.', null);
    await auditService.record(tx, user, { action: 'timetable.changed', entityType: 'timetable', entityId: id, summary: `Removed the ${cur.class_type} class on ${DAY_NAME[cur.weekday]} at ${closureService.to12(cur.start_time)}`,
      details: { change: 'removed', dojoId: cur.dojo_id, weekday: cur.weekday, start: cur.start_time, type: cur.class_type, cancelledLessons: cancelled, students } });
    return { deleted: true, cancelledLessons: cancelled, students, lessons };
  });
}
module.exports = { list, create, update, remove, shape };
