'use strict';
/* AIKIDO SHINJU-KAI — student-data.js
   Loads the signed-in student's data from the API into the shapes the student pages render (MY_PASSES, BOOKINGS, ATTENDANCE, GRADE, PAYS, ...).
   Arrays and objects are filled IN PLACE because other code holds references to them. Nothing is stored in the browser.
   ASK.load.* reads (GET). ASK.act.* writes (POST/PATCH/DELETE); the page re-loads the slice it changed afterwards. */

const stuKey = (date, time) => `${isoDate(date)}|${time}`;
const stuDateAt = (day, hhmm) => { const d = ASK.d(day); d.setHours(+hhmm.slice(0, 2), +hhmm.slice(3, 5), 0, 0); return d; };
const PAY_LABEL = { Visa: 'Visa •••• 4242', PayNow: 'PayNow', Stripe: 'Stripe' };

const stuPass = p => ({ id: p.id, name: p.name, total: p.total, left: p.left, bought: ASK.d(p.bought), expires: ASK.d(p.expires), status: p.status });
const stuUnlimited = u => (u ? { id: u.id, since: ASK.d(u.since), until: ASK.d(u.until) } : null);

/* the next-grade figures. A student at the top rank has none: keep neutral numbers so the home page still draws. */
function stuApplyGrade(g, fee) {
  Object.keys(GRADE).forEach(k => delete GRADE[k]);
  if (!g) {
    Object.assign(GRADE, { target: ME.grade, targetLabel: ME.grade, date: null, close: null, memberMonths: 0, monthsInRank: 0, needMonths: 0, sessions: 0, needSessions: 1, feesPaid: true, submitted: null, eligible: false, sessionId: null, late: false, checks: [], fee: null });
    return;
  }
  Object.assign(GRADE, {
    target: g.target, targetLabel: g.targetLabel, date: g.date ? ASK.d(g.date) : null, close: g.close ? ASK.d(g.close) : null, memberMonths: g.memberMonths, monthsInRank: g.monthsInRank,
    needMonths: g.needMonths, sessions: g.sessions, needSessions: g.needSessions, feesPaid: g.feesPaid, submitted: null, eligible: g.eligible, sessionId: g.sessionId, late: g.late, checks: g.checks, fee: fee || null
  });
}

ASK.load.home = async () => {
  const h = await ASK.get('/student/home');
  Object.assign(ME, { expiry: h.profile.expiry ? ASK.d(h.profile.expiry) : null, status: h.profile.status, joinedOn: h.profile.joinedOn ? ASK.d(h.profile.joinedOn) : null });
  ASK.fill(MY_PASSES, h.packages.map(stuPass));
  DB.unlimited = stuUnlimited(h.unlimited);
  ASK.fill(BOOKINGS, h.upcoming.map(b => {
    const date = ASK.d(b.date);
    return { lessonId: b.lessonId, c: { type: b.type, time: b.time, end: b.end, ins: b.ins, dojo: HQ }, date, key: stuKey(date, b.time), passId: b.packageId, unlimited: b.unlimited };
  }));
  ASK.fill(ATTENDANCE, h.attendance.map(a => ({ lessonId: a.lessonId, date: ASK.d(a.date), time: a.time, type: a.type, ins: a.ins, status: a.status })));
  stuApplyGrade(h.grade);
  ASK.fill(DB.remarks, h.remarks.map(r => {
    const date = r.date ? ASK.d(r.date) : null;
    return {
      kind: r.kind, key: date ? stuKey(date, r.time) : 'note-' + r.id, student: r.kind === 'class' ? null : ME.name, text: r.text, at: ASK.ts(r.at), by: r.by,
      label: date ? `${r.type} · ${dayName(date)} ${fmtShort(date)}` : 'Note for you'
    };
  }));
  ASK.fill(DB.rateQueue, h.rateQueue.map(q => {
    const date = ASK.d(q.date);
    return { lessonId: q.lessonId, c: { type: q.type, time: q.time, ins: q.ins }, date, end: stuDateAt(q.date, q.end), key: stuKey(date, q.time) };
  }));
  ASK.fill(DB.levelUps, h.levelUps.map(l => (l.kind === 'session' ? { kind: 'session', ref: l.refId, date: ASK.d(l.date), type: l.type } : { kind: 'promotion', ref: l.refId, to: l.to })));
  return h;
};

ASK.load.packages = async () => {
  const p = await ASK.get('/student/packages');
  ASK.fill(MY_PASSES, p.passes.map(stuPass));
  DB.unlimited = stuUnlimited(p.unlimited);
  ASK.fill(MC_REQS, p.mcRequests.map(r => ({
    id: r.id, n: ME.name, no: ME.no, passId: r.passId, passName: r.passName, kind: r.kind, days: r.days, date: ASK.ts(r.date), status: r.status, newExp: r.newExp ? ASK.d(r.newExp) : null, file: r.file
  })));
  return p;
};

ASK.load.payments = async () => {
  const rows = await ASK.get('/student/payments');
  ASK.fill(PAYS, rows.map(p => ({ id: p.id, item: p.item, date: fmtDate(ASK.ts(p.date)), method: PAY_LABEL[p.method] || p.method, amt: p.amount, st: p.status, inv: p.invoiceNo, kind: p.kind })));
  return rows;
};

ASK.load.grading = async () => {
  const g = await ASK.get('/student/grading');
  stuApplyGrade(g.grade, g.fee);
  if (g.application) GRADE.submitted = { ref: g.application.id, total: g.application.total, date: fmtDate(ASK.ts(g.application.date)), status: g.application.status };
  GRADE.passedOn = g.currentRank.passedOn ? ASK.d(g.currentRank.passedOn) : null;
  GRADE.currentRank = g.currentRank.name;
  ASK.fill(GRADE_FB, g.feedback.map(f => ({ from: f.from, to: f.to, date: ASK.d(f.date), by: f.by, result: f.result, well: f.well, next: f.next, status: f.status })));
  return g;
};

ASK.load.profile = async () => ASK.get('/student/profile');

/* the HQ timetable of one week (weekStart = a Monday, 'YYYY-MM-DD') */
ASK.load.timetable = async weekStart => ASK.get('/student/timetable' + (weekStart ? `?weekStart=${weekStart}` : ''));

ASK.act.book = lessonId => ASK.post('/student/bookings', { lessonId });
ASK.act.cancel = lessonId => ASK.del('/student/bookings/' + encodeURIComponent(lessonId));
ASK.act.buy = (packageId, method = 'Visa') => ASK.post('/student/packages', { packageId, method });
ASK.act.extension = (packId, body) => ASK.post(`/student/packages/${encodeURIComponent(packId)}/extension-requests`, body);
ASK.act.withdrawExtension = id => ASK.del('/student/extension-requests/' + encodeURIComponent(id));
ASK.act.ackLevelUp = (kind, refId) => ASK.post('/student/level-ups/ack', { kind, refId });
ASK.act.rate = body => ASK.post('/student/feedback', body);
ASK.act.applyGrading = body => ASK.post('/student/grading/applications', body);
ASK.act.updateProfile = body => ASK.patch('/student/profile', body);
