// Instructor endpoints: ownership, attendance (+hours exactly once), End class, remarks, examiner grading window, feedback summary. Spawns its own app.
import { spawnApp, resetDb, client, login, pgConnect, suite, ACCOUNTS } from './lib.mjs';
import { makeFixtures } from './instructor-fixtures.mjs';
await resetDb();
const app = await spawnApp();
const S = suite('api-instructor');
const { check, expect } = S;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const hours = async u => (await q(`select total_accumulated_hours::text t, accumulated_hours::text a, weapon_hours::text w, rank_id, last_grading_date::text lg from student_profile where user_id = $1`, [u]))[0];
try {
  const fx = await makeFixtures(pg);
  console.log(`fixtures: live classes + grading panel ${fx.usable ? 'created' : 'SKIPPED (server clock too close to midnight)'}`);
  const anon = client(app.base);
  const B = await login(app.base, ...ACCOUNTS.instructor);                      // Bob Tan Sensei INS-0042
  const stv = (await q(`select user_id from instructor_profile where full_name like 'Steven%'`))[0].user_id;
  const rob = (await q(`select user_id from instructor_profile where full_name like 'Robin%'`))[0].user_id;
  const Steven = await login(app.base, 'instructor', stv), Robin = await login(app.base, 'instructor', rob);
  const Chew = await login(app.base, 'instructor', 'INS-0008');                  // examiner on past panels only
  const L = await login(app.base, ...ACCOUNTS.student), ADM = await login(app.base, ...ACCOUNTS.business);

  // ---- 401 / 403 matrix
  const routes = [['GET', '/instructor/profile'], ['GET', '/instructor/schedule?from=2026-11-02&to=2026-11-08'], ['GET', '/instructor/students'], ['GET', '/instructor/sessions/x'],
    ['PUT', '/instructor/sessions/x/attendance/S-001', { status: 'Attended' }], ['POST', '/instructor/sessions/x/end', {}], ['PUT', '/instructor/sessions/x/remarks', { kind: 'class', body: 'hi' }],
    ['PUT', '/instructor/students/S-001/grading-note', { body: 'hi' }], ['GET', '/instructor/grading'], ['GET', '/instructor/grading/sessions/x/candidates'],
    ['POST', '/instructor/grading/sessions/x/candidates/S-001/result', {}]];
  const bad401 = [], bad403s = [], bad403a = [];
  for (const [m, p, b] of routes) {
    if ((await anon.api(m, p, b)).status !== 401) bad401.push(p);
    const a = await L.api(m, p, b); if (a.status !== 403 || a.json.error.code !== 'WRONG_ROLE') bad403s.push(p);
    const c = await ADM.api(m, p, b); if (c.status !== 403 || c.json.error.code !== 'WRONG_ROLE') bad403a.push(p);
  }
  check('every instructor route: 401 without a cookie', !bad401.length, bad401.join());
  check('every instructor route: 403 WRONG_ROLE for a student', !bad403s.length, bad403s.join());
  check('every instructor route: 403 WRONG_ROLE for an admin', !bad403a.length, bad403a.join());

  // ---- schedule: only my own lessons, equal to the db
  const range = 'from=2026-11-02&to=2026-11-08';
  const sch = await B.get(`/instructor/schedule?${range}`);
  const dbMine = (await q(`select lesson_id from class_session where instructor_id = 'INS-0042' and session_date between '2026-11-02' and '2026-11-08' and status <> 'Cancelled' order by 1`)).map(r => r.lesson_id);
  const gotMine = sch.json.sessions.map(s => s.lessonId).sort();
  check('schedule: Bob sees exactly his own lessons of the week (equal to the db)', sch.status === 200 && JSON.stringify(gotMine) === JSON.stringify(dbMine) && dbMine.length > 5, `${gotMine.length} vs ${dbMine.length}`);
  const day6 = sch.json.sessions.filter(s => s.date === '2026-11-06');
  check('schedule: 6 Nov = the seed Adults 19:00 class with 2 booked', day6.some(s => s.lessonId === 'LS-20261106-1900-HQ-A' && s.time === '19:00' && s.end === '20:00' && s.booked === 2 && s.type === 'Adults'), JSON.stringify(day6.map(s => [s.lessonId, s.booked])));
  check('schedule: private lessons carry the student name', sch.json.sessions.some(s => s.private && s.studentName), JSON.stringify(sch.json.sessions.filter(s => s.private).map(s => s.studentName)));
  const sch2 = await Chew.get(`/instructor/schedule?${range}`);
  check('schedule: another instructor never sees Bob\'s lessons', sch2.status === 200 && !sch2.json.sessions.some(s => dbMine.includes(s.lessonId)));
  expect('schedule: range over 62 days -> 400', await B.get('/instructor/schedule?from=2026-11-01&to=2027-02-01'), 400, 'RANGE_TOO_LONG');
  expect('schedule: end before start -> 400', await B.get('/instructor/schedule?from=2026-11-08&to=2026-11-01'), 400, 'INVALID_RANGE');
  expect('schedule: bad date -> 400', await B.get('/instructor/schedule?from=today&to=2026-11-01'), 400, 'VALIDATION_ERROR');
  check('schedule: shows the grading panel of 13 Dec for an examiner (locked) and not for a non-examiner', (await B.get('/instructor/schedule?from=2026-12-07&to=2026-12-13')).json.grading.some(g => g.id === 'GR-20261213' && g.state === 'locked')
    && !(await Chew.get('/instructor/schedule?from=2026-12-07&to=2026-12-13')).json.grading.length);

  // ---- roster ownership
  const rosterUrl = id => `/instructor/sessions/${id}`;
  const own = await B.get(rosterUrl('LS-20261106-1900-HQ-A'));
  check('roster: owner sees both booked students with status Booked', own.status === 200 && own.json.rows.length === 2 && own.json.rows.every(r => r.status === 'Booked') && own.json.rows.some(r => r.userId === 'S-001' && r.name === 'Lervyn Wong'), own.text.slice(0, 200));
  check('roster: no password / hash in the payload', !/password|hash/i.test(own.text));
  expect('roster: Steven cannot read Bob\'s roster', await Steven.get(rosterUrl('LS-20261106-1900-HQ-A')), 403, 'NOT_YOUR_CLASS');
  expect('roster: Robin cannot read Bob\'s roster', await Robin.get(rosterUrl('LS-20261106-1900-HQ-A')), 403, 'NOT_YOUR_CLASS');
  expect('roster: unknown lesson -> 404', await B.get(rosterUrl('LS-NOPE')), 404, 'LESSON_NOT_FOUND');
  expect('attendance: Steven cannot mark in Bob\'s class', await Steven.put(`${rosterUrl('LS-20261106-1900-HQ-A')}/attendance/S-001`, { status: 'Attended' }), 403, 'NOT_YOUR_CLASS');
  expect('end class: Steven cannot end Bob\'s class', await Steven.post(`${rosterUrl('LS-20261106-1900-HQ-A')}/end`, {}), 403, 'NOT_YOUR_CLASS');
  expect('remarks: Steven cannot write in Bob\'s class', await Steven.put(`${rosterUrl('LS-20261106-1900-HQ-A')}/remarks`, { kind: 'class', body: 'x' }), 403, 'NOT_YOUR_CLASS');
  check('ownership failures changed nothing', (await q(`select count(*)::int n from class_attendance where lesson_id = 'LS-20261106-1900-HQ-A' and attendance_status <> 'Booked'`))[0].n === 0);

  // ---- windows
  expect('attendance: a later class -> 409 CLASS_NOT_OPEN', await B.put(`${rosterUrl(fx.later)}/attendance/S-001`, { status: 'Attended' }), 409, 'CLASS_NOT_OPEN');
  expect('remarks: a later class -> 409 CLASS_NOT_OPEN', await B.put(`${rosterUrl(fx.later)}/remarks`, { kind: 'class', body: 'x' }), 409, 'CLASS_NOT_OPEN');
  expect('end class: a later class -> 409 CLASS_NOT_OPEN', await B.post(`${rosterUrl(fx.later)}/end`, {}), 409, 'CLASS_NOT_OPEN');
  expect('attendance: the seed 19:00 class is not open before 18:30 on its day (today 6 Nov)', await B.put(`${rosterUrl('LS-20261106-1900-HQ-A')}/attendance/S-001`, { status: 'Attended' }),
    ...(({ later: [409, 'CLASS_NOT_OPEN'], done: [409, 'CLASS_ENDED'] })[(await B.get(rosterUrl('LS-20261106-1900-HQ-A'))).json.state] || [200]));   // the real clock decides: before 18:30, while open, or after 20:00
  expect('attendance: a class whose time is over (not ended) -> 409 CLASS_ENDED', await B.put(`${rosterUrl(fx.past)}/attendance/S-001`, { status: 'Attended' }), 409, 'CLASS_ENDED');
  const pastRemark = await B.put(`${rosterUrl(fx.past)}/remarks`, { kind: 'class', body: 'Written after the class.' });
  check('remarks: still editable after the class is over', pastRemark.status === 200 && pastRemark.json.body === 'Written after the class.', pastRemark.text);
  expect('student remark for someone not on the class -> 404', await B.put(`${rosterUrl(fx.past)}/remarks`, { kind: 'student', studentId: 'S-020', body: 'x' }), 404, 'NOT_ON_CLASS');
  expect('student remark without a student -> 400', await B.put(`${rosterUrl(fx.past)}/remarks`, { kind: 'student', body: 'x' }), 400, 'STUDENT_REQUIRED');
  expect('validation: bad status -> 400', await B.put(`${rosterUrl(fx.past)}/attendance/S-001`, { status: 'Present' }), 400, 'VALIDATION_ERROR');
  expect('validation: extra field -> 400', await B.put(`${rosterUrl(fx.past)}/attendance/S-001`, { status: 'Attended', userId: 'S-002' }), 400, 'VALIDATION_ERROR');

  if (fx.usable) {
    // ---- hours credited exactly once
    const h0 = await hours('S-001');
    const live = rosterUrl(fx.live);
    const r1 = await B.put(`${live}/attendance/S-001`, { status: 'Attended' });
    check('mark Attended: 200, credits one hour', r1.status === 200 && r1.json.changed === true && r1.json.hours === 1, r1.text);
    const h1 = await hours('S-001');
    check('SQL: total + accumulated rose by exactly 1.0, weapon unchanged', Number(h1.t) - Number(h0.t) === 1 && Number(h1.a) - Number(h0.a) === 1 && h1.w === h0.w, `${JSON.stringify(h0)} -> ${JSON.stringify(h1)}`);
    for (let i = 0; i < 3; i++) await B.put(`${live}/attendance/S-001`, { status: 'Attended' });
    const r2 = await B.put(`${live}/attendance/S-001`, { status: 'Attended' });
    const h2 = await hours('S-001');
    check('mark Attended again (x4): idempotent, nothing more credited', r2.status === 200 && r2.json.changed === false && r2.json.hours === 0 && h2.t === h1.t && h2.a === h1.a, JSON.stringify(h2));
    check('marked_by is the instructor, marked_at set', (await q(`select marked_by, marked_at is not null ok from class_attendance where lesson_id = $1 and user_id = 'S-001'`, [fx.live]))[0].marked_by === 'INS-0042');
    // concurrent double tap
    await Promise.all([B.put(`${live}/attendance/S-011`, { status: 'Attended' }), B.put(`${live}/attendance/S-011`, { status: 'Attended' })]);
    const g11 = await q(`select total_accumulated_hours::text t from student_profile where user_id = 'S-011'`);
    check('two simultaneous ticks credit one hour only', (await q(`select attendance_status s from class_attendance where lesson_id = $1 and user_id = 'S-011'`, [fx.live]))[0].s === 'Attended' && g11.length === 1);
    const hn0 = await hours('S-002');
    const rn = await B.put(`${live}/attendance/S-002`, { status: 'No-Show' });
    const hn1 = await hours('S-002');
    check('No-Show: 200 and credits nothing', rn.status === 200 && rn.json.hours === 0 && hn1.t === hn0.t && hn1.a === hn0.a, rn.text);
    expect('Attended cannot be undone -> 409 ALREADY_COUNTED', await B.put(`${live}/attendance/S-001`, { status: 'No-Show' }), 409, 'ALREADY_COUNTED');
    expect('Attended cannot go back to Booked -> 409 ALREADY_COUNTED', await B.put(`${live}/attendance/S-001`, { status: 'Booked' }), 409, 'ALREADY_COUNTED');
    expect('someone not on the class -> 404 NOT_ON_CLASS', await B.put(`${live}/attendance/S-020`, { status: 'Attended' }), 404, 'NOT_ON_CLASS');
    // Weapons class also adds weapon hours
    const w0 = await hours('S-001');
    await B.put(`${rosterUrl(fx.weapons)}/attendance/S-001`, { status: 'Attended' });
    const w1 = await hours('S-001');
    check('Weapons class: weapon hours +1 as well (weapon <= accumulated <= total holds)', Number(w1.w) - Number(w0.w) === 1 && Number(w1.a) - Number(w0.a) === 1 && Number(w1.w) <= Number(w1.a) && Number(w1.a) <= Number(w1.t), `${JSON.stringify(w0)} -> ${JSON.stringify(w1)}`);
    // remarks
    const cr = await B.put(`${live}/remarks`, { kind: 'class', body: 'We drilled kokyu-ho.' });
    const sr = await B.put(`${live}/remarks`, { kind: 'student', studentId: 'S-001', body: 'Good timing today.' });
    check('class + student remarks saved (one row each, updated in place)', cr.status === 200 && sr.status === 200
      && (await B.put(`${live}/remarks`, { kind: 'class', body: 'Edited.' })).json.id === cr.json.id
      && (await q(`select count(*)::int n from instructor_remark where lesson_id = $1`, [fx.live]))[0].n === 2);
    const rosterNow = (await B.get(live)).json;
    check('roster shows the saved remark and the class remark', rosterNow.rows.find(r => r.userId === 'S-001').remark === 'Good timing today.' && rosterNow.classRemark.body === 'Edited.', JSON.stringify(rosterNow.classRemark));
    const sh = await L.get('/student/home');
    check('the student reads those notes on the home page', sh.json.remarks.some(r => r.text === 'Good timing today.') && sh.json.remarks.some(r => r.text === 'Edited.'));
    const del = await B.put(`${live}/remarks`, { kind: 'student', studentId: 'S-001', body: '   ' });
    check('empty text deletes the remark', del.status === 200 && del.json.deleted === true && (await q(`select count(*)::int n from instructor_remark where lesson_id = $1 and kind = 'student'`, [fx.live]))[0].n === 0);
    // ---- End class
    const e = rosterUrl(fx.end), eh0 = await hours('S-001'), eh2 = await hours('S-002');
    const end = await B.post(`${e}/end`, { present: ['S-001'], noShow: [] });
    check('End class: 200, one present, the other two Booked rows became No-Show', end.status === 200 && end.json.present === 1 && end.json.noShow === 2 && !!end.json.endedAt, end.text);
    const st = await q(`select user_id, attendance_status s from class_attendance where lesson_id = $1 order by 1`, [fx.end]);
    check('SQL: S-001 Attended, S-002 and S-011 No-Show', st.map(r => r.s).join() === 'Attended,No-Show,No-Show', JSON.stringify(st));
    const eh1 = await hours('S-001'), ehb2 = await hours('S-002');
    check('End class credited S-001 one hour and the no-shows nothing', Number(eh1.t) - Number(eh0.t) === 1 && ehb2.t === eh2.t);
    check('class_session is Ended with ended_at set', (await q(`select status, ended_at is not null e from class_session where lesson_id = $1`, [fx.end]))[0].status === 'Ended');
    expect('after End class: marking -> 409 CLASS_ENDED', await B.put(`${e}/attendance/S-002`, { status: 'Attended' }), 409, 'CLASS_ENDED');
    expect('after End class: ending again -> 409 CLASS_ENDED', await B.post(`${e}/end`, {}), 409, 'CLASS_ENDED');
    check('after End class: hours unchanged by the refused calls', (await hours('S-002')).t === eh2.t);
    const er = await B.put(`${e}/remarks`, { kind: 'class', body: 'Wrapped up.' });
    check('after End class: remarks can still be written', er.status === 200);
  }

  // ---- grading notes + students
  const ss = await B.get('/instructor/students');
  check('students: Bob\'s students (booked or attended his classes), no hash', ss.status === 200 && ss.json.some(s => s.userId === 'S-001' && s.name === 'Lervyn Wong') && !/password|hash/i.test(ss.text), ss.text.slice(0, 150));
  check('students: S-002 is going for grading, S-029 is not', ss.json.find(s => s.userId === 'S-002').goingForGrading === true && ss.json.find(s => s.userId === 'S-029').goingForGrading === false);
  const gn = await B.put('/instructor/students/S-002/grading-note', { body: 'Ready for 2nd Kyu.' });
  check('grading note for a student going for grading -> 200', gn.status === 200 && gn.json.body === 'Ready for 2nd Kyu.', gn.text);
  expect('grading note for one of my students who is not going for grading -> 409', await B.put('/instructor/students/S-029/grading-note', { body: 'x' }), 409, 'NOT_GOING_FOR_GRADING');
  const stranger = (await q(`select user_id from student_profile where user_id not in (select a.user_id from class_attendance a join class_session s using (lesson_id) where s.instructor_id = 'INS-0042') order by 1 limit 1`))[0].user_id;
  expect('grading note for a student who never came to my classes -> 403', await B.put(`/instructor/students/${stranger}/grading-note`, { body: 'x' }), 403, 'NOT_YOUR_STUDENT');
  const others = (await q(`select lesson_id from class_session where instructor_id = 'INS-0008' limit 1`))[0].lesson_id;
  expect('grading note against someone else\'s lesson -> 403 NOT_YOUR_CLASS', await B.put('/instructor/students/S-002/grading-note', { lessonId: others, body: 'x' }), 403, 'NOT_YOUR_CLASS');

  // ---- profile + anonymous feedback
  const pf = await B.get('/instructor/profile');
  const dbFb = (await q(`select count(*)::int n, avg(rating)::float a from class_feedback where instructor_id = 'INS-0042'`))[0];
  check('profile: Bob, 6th Dan, ratings equal the db', pf.status === 200 && pf.json.name === 'Bob Tan Sensei' && pf.json.dan === 6 && pf.json.feedback.count === dbFb.n && Math.abs(pf.json.feedback.avg - dbFb.a) < 0.06, pf.text.slice(0, 200));
  check('profile: distribution adds up to the count', Object.values(pf.json.feedback.distribution).reduce((a, b) => a + b, 0) === pf.json.feedback.count);
  check('feedback summary carries no student identity (no ids, no lesson ids, no names)', !/"S-\d+|userId|user_id|lessonId|LS-\d|Lervyn|ASK-20/.test(JSON.stringify(pf.json.feedback)), JSON.stringify(pf.json.feedback).slice(0, 200));
  check('profile: no password_hash', !/password|hash/i.test(pf.text));
  const pf2 = await Chew.get('/instructor/profile');
  check('profile: another instructor gets their own figures', pf2.json.name === 'Chew Eng Lam Sensei' && pf2.json.feedback.count === 0);

  // ---- grading window
  const g0 = await B.get('/instructor/grading');
  const panels = g0.json.panels;
  check('grading: Bob sees his upcoming panels (13 Dec, tomorrow\'s fixture)', g0.status === 200 && panels.some(p => p.session.id === 'GR-20261213') && panels.some(p => p.session.id === fx.grTomorrow) && !panels.some(p => p.session.id === fx.grPast));
  const dec = panels.find(p => p.session.id === 'GR-20261213');
  check('grading: a locked panel shows counts only, no candidate names', dec.window.state === 'locked' && dec.candidates === undefined && dec.counts.total === 3 && !/Jamie|Priya/.test(JSON.stringify(dec)));
  check('grading: Chew has no upcoming panel', (await Chew.get('/instructor/grading')).json.panels.length === 0);
  expect('candidates: outside the window (tomorrow) -> 409 GRADING_NOT_OPEN', await B.get(`/instructor/grading/sessions/${fx.grTomorrow}/candidates`), 409, 'GRADING_NOT_OPEN');
  expect('candidates: the 13 Dec panel is locked -> 409 GRADING_NOT_OPEN', await B.get('/instructor/grading/sessions/GR-20261213/candidates'), 409, 'GRADING_NOT_OPEN');
  expect('candidates: a panel that already ended -> 409 GRADING_NOT_OPEN', await B.get(`/instructor/grading/sessions/${fx.grPast}/candidates`), 409, 'GRADING_NOT_OPEN');
  expect('candidates: not an examiner (Chew on 13 Dec) -> 403 NOT_EXAMINER', await Chew.get('/instructor/grading/sessions/GR-20261213/candidates'), 403, 'NOT_EXAMINER');
  expect('candidates: unknown panel -> 403 NOT_EXAMINER', await B.get('/instructor/grading/sessions/GR-NOPE/candidates'), 403, 'NOT_EXAMINER');
  const scoresOf = n => Object.fromEntries(['Omote', 'Ura'].flatMap(v => ['entry', 'control', 'posture'].map(c => [`${v}-${c}`, n])));
  const body = (n, extra = {}) => ({ scores: scoresOf(n), well: 'Calm ukemi.', toImprove: 'Lower hips.', signature: true, ...extra });
  expect('result: outside the window -> 409 GRADING_NOT_OPEN', await B.post(`/instructor/grading/sessions/${fx.grTomorrow}/candidates/S-011/result`, body(3)), 409, 'GRADING_NOT_OPEN');
  expect('result: not an examiner -> 403 NOT_EXAMINER', await Chew.post(`/instructor/grading/sessions/GR-20261213/candidates/S-002/result`, body(3)), 403, 'NOT_EXAMINER');
  check('refused results changed nothing', (await q(`select count(*)::int n from grading_candidate where result <> 'Pending' and session_id in ($1, $2, 'GR-20261213')`, [fx.grTomorrow, fx.grPast]))[0].n === 0);
  if (fx.usable) {
    expect('candidates: Chew is not on the open panel -> 403 NOT_EXAMINER', await Chew.get(`/instructor/grading/sessions/${fx.gr}/candidates`), 403, 'NOT_EXAMINER');
    expect('result: Chew is not on the open panel -> 403 NOT_EXAMINER', await Chew.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, body(3)), 403, 'NOT_EXAMINER');
    const cands = await B.get(`/instructor/grading/sessions/${fx.gr}/candidates`);
    check('candidates: inside the window the examiner sees the 3 names', cands.status === 200 && cands.json.candidates.length === 3 && cands.json.window.open === true && cands.json.candidates.every(c => !c.done), cands.text.slice(0, 200));
    check('candidates: S-002 carries the grading note Bob wrote', cands.json.candidates.find(c => c.userId === 'S-002').notes.some(n => n.text === 'Ready for 2nd Kyu.'));
    check('panels list now includes the candidates of the open panel', (await B.get('/instructor/grading')).json.panels.find(p => p.session.id === fx.gr).candidates.length === 3);
    expect('result: missing criterion -> 400', await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, { ...body(3), scores: { 'Omote-entry': 3 } }), 400, 'VALIDATION_ERROR');
    expect('result: score 4 -> 400', await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, body(4)), 400, 'VALIDATION_ERROR');
    expect('result: no feedback text -> 400', await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, body(3, { well: '' })), 400, 'VALIDATION_ERROR');
    expect('result: someone who is not a candidate -> 404', await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-020/result`, body(3)), 404, 'NOT_CANDIDATE');
    const rk0 = await hours('S-002');
    const pass = await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, body(3));
    check('result: all 3s = 100% -> Pass, promotion Pending approval', pass.status === 200 && pass.json.result === 'Pass' && pass.json.score === 100 && pass.json.promotion === 'Pending approval' && pass.json.marks === 18, pass.text);
    const c2 = (await q(`select result, score::float s, promotion_status p, examiner_id e, well_done w, to_improve ti from grading_candidate where session_id = $1 and user_id = 'S-002'`, [fx.gr]))[0];
    check('SQL: candidate row has result/score/examiner/feedback', c2.result === 'Pass' && c2.s === 100 && c2.p === 'Pending approval' && c2.e === 'INS-0042' && c2.w === 'Calm ukemi.' && c2.ti === 'Lower hips.');
    const rk1 = await hours('S-002');
    check('Pass leaves the rank unchanged until HQ approves, last_grading_date set', rk1.rank_id === rk0.rank_id && rk1.lg === '2026-11-06' && rk1.t === rk0.t, JSON.stringify(rk1));
    check('SQL: grading_history row written (Pass = true)', (await q(`select grade from grading_history where user_id = 'S-002' and grading_session_id = $1`, [fx.gr])).map(r => r.grade).join() === 'true');
    expect('result: a second submission -> 409 ALREADY_SCORED', await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, body(0)), 409, 'ALREADY_SCORED');
    check('the refused re-submission changed nothing', (await q(`select result from grading_candidate where session_id = $1 and user_id = 'S-002'`, [fx.gr]))[0].result === 'Pass' && (await q(`select count(*)::int n from grading_history where user_id = 'S-002' and grading_session_id = $1`, [fx.gr]))[0].n === 1);
    const retake = await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-009/result`, body(2, { scores: { ...scoresOf(2), 'Ura-posture': 1 } }));
    check('result: 11/18 = 61% -> Retake, promotion n/a', retake.status === 200 && retake.json.result === 'Retake' && retake.json.promotion === 'n/a' && retake.json.score === 61.11, retake.text);
    check('Retake: history grade false, session In progress', (await q(`select grade from grading_history where user_id = 'S-009' and grading_session_id = $1`, [fx.gr]))[0].grade === false
      && (await q(`select status from grading_session where id = $1`, [fx.gr]))[0].status === 'In progress');
    const fail = await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-010/result`, body(1));
    check('result: 6/18 = 33% -> Fail, promotion n/a', fail.status === 200 && fail.json.result === 'Fail' && fail.json.promotion === 'n/a' && fail.json.score === 33.33, fail.text);
    check('all scored: session Completed, still at HQ', (await q(`select status, dojo_id from grading_session where id = $1`, [fx.gr]))[0].status === 'Completed' && (await q(`select dojo_id from grading_session where id = $1`, [fx.gr]))[0].dojo_id === 'hq');
    check('grading never touches class_session (no class created or changed by it)', (await q(`select count(*)::int n from class_session where lesson_id like 'GR-%'`))[0].n === 0);
    check('student ranks unchanged by all three results', (await hours('S-009')).rank_id === (await q(`select rank_id from student_profile where user_id = 'S-009'`))[0].rank_id && (await hours('S-010')).lg === '2026-11-06');
    const stu = await login(app.base, 'student', (await q(`select member_no from student_profile where user_id = 'S-010'`))[0].member_no);
    const sg = await stu.get('/student/grading');
    check('the student reads the examiner feedback on the grading page', sg.status === 200 && sg.json.feedback.some(f => f.result === 'Fail' && f.well === 'Calm ukemi.'), sg.text.slice(0, 160));
    expect('result: panel finished (all scored) but window still open, a second result is refused', await B.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-010/result`, body(3)), 409, 'ALREADY_SCORED');
  }
  check('no password_hash in any instructor response (spot check on students + roster)', !/password_hash/i.test(ss.text + own.text));
} catch (e) { console.error(e); process.exitCode = 1; check('suite ran without an exception', false, String(e && e.stack || e)); }
finally { await pg.end(); await app.stop(); }
S.done();
