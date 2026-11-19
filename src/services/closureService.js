'use strict';
/* Closures and class cancellations (Business Admin). Closing a dojo for dates, or cancelling one class, cancels the dated lessons and
   returns the lesson to every student who had booked. A closure always returns the lesson: the "cancel at least N hours before" rule does not apply,
   because the dojo cancelled, not the student. Everything happens in one transaction. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const closureModel = require('../models/closureModel');
const packageModel = require('../models/packageModel');
const notificationModel = require('../models/notificationModel');
const sentLogModel = require('../models/sentLogModel');
const memberModel = require('../models/memberModel');
const { nextId } = require('../models/ids');
const auditService = require('./auditService');

const MAX_DAYS = 60;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayOf = ymd => DAY[(new Date(ymd + 'T00:00:00Z').getUTCDay() + 6) % 7];
const niceDate = ymd => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;
const to12 = hhmm => { const h = Number(hhmm.slice(0, 2)); return `${h % 12 || 12}${hhmm.slice(3) === '00' ? '' : ':' + hhmm.slice(3)} ${h < 12 ? 'AM' : 'PM'}`; };

/* Cancel every live booking of a lesson and give the lesson back. `prefix` is 'Cancelled by closure CL-07' or 'Cancelled class': the booking
   note starts with it, so the counts on the Closures list can be read back from the rows. Returns { students, lessons, names }. */
async function returnLesson(tx, lessonId, prefix, today) {
  const rows = await closureModel.bookedOn(lessonId, tx);
  const out = { students: 0, lessons: 0, names: [] };
  for (const r of rows) {
    let note = `${prefix}; no lesson to return`;
    if (!r.is_guest) {
      const pack = r.student_package_id ? await packageModel.getById(r.student_package_id, tx, true) : null;
      if (pack && !pack.unlimited) { await packageModel.returnLesson(pack.id, today, tx); note = `${prefix}; lesson returned`; out.lessons += 1; }
      out.students += 1; out.names.push(r.name);
    }
    await closureModel.cancelBooking(lessonId, r.user_id, note, tx);
  }
  return out;
}

/* a notice for the students: the project sends nothing, the sent_log row is the notice */
async function logNotice(tx, user, audience, title, templateId) {
  const tpl = templateId ? await notificationModel.template(templateId, tx) : null;
  const id = await nextId(tx, 'sent_log', 'id', 'SL-', 2);
  await sentLogModel.insert({ id, at: clock.now(), sentBy: user.id, audience: audience.slice(0, 250), title: title.slice(0, 250), templateId: tpl ? tpl.id : null }, tx);
  return id;
}

const closureShape = c => ({
  id: c.id, scope: c.dojo_id === 'hq' ? 'HQ' : 'dojo', dojoId: c.dojo_id, dojoName: c.dojo_name, from: c.from_date, to: c.to_date, note: c.note || '',
  sessions: c.sessions, students: c.students, lessons: c.lessons
});

/* closures (newest first) and the single classes that were cancelled in the last 30 days or are still to come */
async function list() {
  const today = clock.today();
  const [closures, classes] = await Promise.all([closureModel.listAll(), closureModel.cancelledClasses(clock.addDays(today, -30))]);
  return {
    closures: closures.map(closureShape),
    cancelledClasses: classes.map(c => ({
      lessonId: c.lesson_id, dojoId: c.dojo_id, dojoName: c.dojo_name, date: c.session_date, time: c.start_time, type: c.class_type, students: c.students, lessons: c.lessons,
      label: `${c.class_type} ${to12(c.start_time)}`
    }))
  };
}

function checkRange(from, to, today) {
  if (from < today) throw badRequest('A closure starts today or later.', 'PAST_DATE');
  if (to < from) throw badRequest('The last day is before the first day.', 'INVALID_RANGE');
  if (clock.diffDays(from, to) + 1 > MAX_DAYS) throw badRequest(`Close at most ${MAX_DAYS} days at a time.`, 'INVALID_RANGE');
}

/* who would be affected, without changing anything (the form shows this before it saves) */
async function preview({ dojoId, from, to, lessonId }) {
  const today = clock.today();
  let lessons;
  if (lessonId) {
    const l = await closureModel.lessonForCancel(lessonId);
    if (!l) throw notFound('That class does not exist.', 'LESSON_NOT_FOUND');
    if (l.status !== 'Scheduled' || l.session_date < today) throw conflict('That class can no longer be cancelled.', 'CLASS_NOT_CANCELLABLE');
    lessons = [{ lesson_id: l.lesson_id, session_date: l.session_date, start_time: l.start_time, class_type: l.class_type }];
  } else {
    checkRange(from, to || from, today);
    if (!(await memberModel.dojoExists(dojoId))) throw notFound('That dojo does not exist.', 'INVALID_DOJO');
    lessons = await closureModel.lessonsInRange(dojoId, from, to || from);
  }
  const people = [];
  for (const l of lessons) for (const r of await closureModel.bookedOn(l.lesson_id)) if (!r.is_guest) people.push({ name: r.name, class: `${l.class_type} ${to12(l.start_time)}`, date: l.session_date });
  return { classes: lessons.length, students: people.length, people: people.slice(0, 50) };
}

async function create(user, { dojoId, from, to, note }) {
  const today = clock.today(), last = to || from;
  checkRange(from, last, today);
  return withTx(async tx => {
    if (!(await memberModel.dojoExists(dojoId, tx))) throw notFound('That dojo does not exist.', 'INVALID_DOJO');
    const id = await nextId(tx, 'class_closure', 'id', 'CL-', 2);
    await closureModel.insert({ id, dojoId, from, to: last, note }, tx);
    const lessons = await closureModel.lessonsInRange(dojoId, from, last, tx, true);
    let students = 0, returned = 0;
    for (const l of lessons) {
      await closureModel.cancelLesson(l.lesson_id, id, tx);
      const r = await returnLesson(tx, l.lesson_id, `Cancelled by closure ${id}`, today);
      students += r.students; returned += r.lessons;
    }
    const dojo = dojoId === 'hq' ? 'HQ students' : `${dojoId} students`;
    await logNotice(tx, user, dojo, `Dojo closed${note ? ': ' + note : ''}. Lesson returned.`, 'T-3');
    await auditService.record(tx, user, { action: 'closure.created', entityType: 'closure', entityId: id, summary: `Closed ${dojoId} from ${from} to ${last}`,
      details: { dojoId, from, to: last, classes: lessons.length, students, lessonsReturned: returned } });
    return { id, scope: dojoId === 'hq' ? 'HQ' : 'dojo', dojoId, from, to: last, note: note || '', sessions: lessons.length, students, lessons: returned };
  });
}

/* delete a closure: the lessons it cancelled are open again. Bookings that were cancelled stay cancelled and their lessons stay returned. */
async function remove(user, id) {
  return withTx(async tx => {
    const c = await closureModel.get(id, tx, true);
    if (!c) throw notFound('That closure does not exist.', 'CLOSURE_NOT_FOUND');
    const reopened = await closureModel.reopenLessons(id, tx);
    await closureModel.remove(id, tx);
    await auditService.record(tx, user, { action: 'closure.deleted', entityType: 'closure', entityId: id, summary: `Deleted closure ${id}`, details: { dojoId: c.dojo_id, reopened: reopened.length } });
    return { deleted: true, reopened: reopened.length };
  });
}

/* cancel one dated class */
async function cancelClass(user, lessonId, { note }) {
  return withTx(async tx => {
    const today = clock.today();
    const l = await closureModel.lessonForCancel(lessonId, tx, true);
    if (!l) throw notFound('That class does not exist.', 'LESSON_NOT_FOUND');
    if (l.status !== 'Scheduled' || l.session_date < today) throw conflict('That class can no longer be cancelled.', 'CLASS_NOT_CANCELLABLE');
    await closureModel.cancelLesson(lessonId, null, tx);
    const r = await returnLesson(tx, lessonId, 'Cancelled class', today);
    await logNotice(tx, user, `${l.class_type} · ${dayOf(l.session_date)} ${niceDate(l.session_date)} ${to12(l.start_time)}`, `Class cancelled${note ? ': ' + note : ''}. Lesson returned.`, 'T-1');
    await auditService.record(tx, user, { action: 'class.cancelled', entityType: 'lesson', entityId: lessonId, summary: `Cancelled the ${l.class_type} class ${lessonId} on ${l.session_date}`,
      details: { date: l.session_date, students: r.students, lessonsReturned: r.lessons } });
    return { lessonId, students: r.students, lessons: r.lessons };
  });
}

module.exports = { list, preview, create, remove, cancelClass, returnLesson, logNotice, dayOf, niceDate, to12 };
