'use strict';
/* AIKIDO SHINJU-KAI — instructor-data.js
   Loads the signed-in instructor's data from the API into the shapes the instructor pages render (STUDENTS, CANDIDATES, FEEDBACK, SCHED).
   Arrays and objects are filled IN PLACE because other code holds references to them. Nothing is stored in the browser.
   ASK.load.* reads (GET). ASK.act.* writes (PUT/POST); the page reloads the slice it changed afterwards. */

/* the lessons and grading panels of the date range on screen (GET /instructor/schedule). Dates stay 'YYYY-MM-DD' strings. */
const SCHED = { sessions: [], grading: [], from: null, to: null };

/* a person on a roster or in the students list, in the short field names the render code uses */
const insPerson = r => ({
  userId: r.userId, n: r.name, no: r.memberNo, g: r.rank, s: r.sessions, need: r.need, seen: r.seen, photo: r.photo, st: r.status, how: r.how || null,
  goingForGrading: !!r.goingForGrading, remark: r.remark || '', gradingNote: r.gradingNote || '',
  earlier: (r.earlier || []).map(e => ({ text: e.text, at: ASK.ts(e.at), label: e.date ? `${e.type} · ${dayName(ASK.d(e.date))} ${fmtShort(ASK.d(e.date))}` : 'Class' }))
});

ASK.load.schedule = async (from, to) => {
  const r = await ASK.get(`/instructor/schedule?from=${from}&to=${to}`);
  SCHED.sessions = r.sessions; SCHED.grading = r.grading; SCHED.from = from; SCHED.to = to;
  return r;
};

/* one class: its session, state and roster rows */
ASK.load.roster = async lessonId => {
  const r = await ASK.get('/instructor/sessions/' + encodeURIComponent(lessonId));
  return { session: r.session, state: r.state, rows: r.rows.map(insPerson), classRemark: r.classRemark };
};

/* every student who booked or attended one of my classes (the "away" count in the bell, the student drawer) */
ASK.load.students = async () => {
  const r = await ASK.get('/instructor/students');
  ASK.fill(STUDENTS, r.map(insPerson));
  return r;
};

/* the instructor's profile figures and the anonymous ratings */
ASK.load.profile = async () => {
  const p = await ASK.get('/instructor/profile');
  ASK.insProfile = p;
  ASK.fill(FEEDBACK, p.feedback.recent.map(f => ({ ins: p.name, type: f.type, date: ASK.d(f.date), rating: f.rating, tags: f.tags, note: f.note })));
  return p;
};

/* the open grading panel and its candidates. The server answers 403 / 409 outside the examiner window; the page then goes back to the schedule. */
ASK.load.grading = async () => {
  const shift = examinerShift();
  if (!shift) throw new ApiError(409, 'GRADING_NOT_OPEN', 'Grading is open only to the examiner panel during their shift.');
  const r = await ASK.get(`/instructor/grading/sessions/${encodeURIComponent(shift.id)}/candidates`);
  ASK.fill(CANDIDATES, r.candidates.map(c => ({
    userId: c.userId, n: c.name, from: c.from, to: c.to, done: c.done, result: c.result, score: c.score, fb: c.done ? { well: c.well, next: c.toImprove } : null,
    notes: c.notes.map(x => ({ by: x.by, label: x.label, text: x.text, at: ASK.ts(x.at) }))
  })));
  return r;
};

ASK.act.mark = (lessonId, userId, status) => ASK.put(`/instructor/sessions/${encodeURIComponent(lessonId)}/attendance/${encodeURIComponent(userId)}`, { status });
ASK.act.end = (lessonId, present, noShow) => ASK.post(`/instructor/sessions/${encodeURIComponent(lessonId)}/end`, { present, noShow });
ASK.act.remark = (lessonId, kind, studentId, body) => ASK.put(`/instructor/sessions/${encodeURIComponent(lessonId)}/remarks`, studentId ? { kind, studentId, body } : { kind, body });
ASK.act.gradingNote = (userId, lessonId, body) => ASK.put(`/instructor/students/${encodeURIComponent(userId)}/grading-note`, lessonId ? { lessonId, body } : { body });
ASK.act.submitResult = (sessionId, userId, body) => ASK.post(`/instructor/grading/sessions/${encodeURIComponent(sessionId)}/candidates/${encodeURIComponent(userId)}/result`, body);
