// Student endpoints: rules, ownership, credits, cancel window, grading, feedback, extensions, 401/403 matrix. Spawns its own app.
import { spawnApp, resetDb, client, login, pgConnect, suite, ACCOUNTS } from './lib.mjs';
await resetDb();
const app = await spawnApp();
const S = suite('api-student');
const { check, expect } = S;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const sgParts = d => { const o = {}; for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)) o[p.type] = p.value; return o; };
try {
  const anon = client(app.base);
  const L = await login(app.base, ...ACCOUNTS.student);
  const J = await login(app.base, 'student', 'ASK-2024-0921');          // Jamie Tan (student B), Unlimited plan
  const M = await login(app.base, 'student', 'ASK-2026-0102');          // Marcus Lim, no package
  const E = await login(app.base, 'student', 'ASK-2026-3102');          // Ethan Goh (child), 1-month pass
  const K = await login(app.base, 'student', 'ASK-2023-0456');          // Kenji Sato, 3rd Kyu
  const A = await login(app.base, 'student', 'ASK-2025-1522');          // Ahmad Karim
  const INS = await login(app.base, ...ACCOUNTS.instructor);
  const ADM = await login(app.base, ...ACCOUNTS.business);

  // ---- 401 / 403 matrix
  const routes = [['GET', '/student/home'], ['GET', '/student/profile'], ['PATCH', '/student/profile', { contactNo: '91234567' }], ['GET', '/student/packages'], ['POST', '/student/packages', { packageId: 'a10' }],
    ['GET', '/student/timetable'], ['GET', '/student/bookings'], ['POST', '/student/bookings', { lessonId: 'x' }], ['DELETE', '/student/bookings/x'], ['GET', '/student/attendance'], ['GET', '/student/payments'],
    ['GET', '/student/payments/L-1001'], ['GET', '/student/grading'], ['POST', '/student/feedback', { lessonId: 'x' }]];
  let bad401 = [], bad403a = [], bad403b = [];
  for (const [m, p, b] of routes) {
    if ((await anon.api(m, p, b)).status !== 401) bad401.push(p);
    const a = await INS.api(m, p, b); if (a.status !== 403 || a.json.error.code !== 'WRONG_ROLE') bad403a.push(p);
    const c = await ADM.api(m, p, b); if (c.status !== 403 || c.json.error.code !== 'WRONG_ROLE') bad403b.push(p);
  }
  check('every student route: 401 without a cookie', !bad401.length, bad401.join());
  check('every student route: 403 WRONG_ROLE for an instructor', !bad403a.length, bad403a.join());
  check('every student route: 403 WRONG_ROLE for an admin', !bad403b.length, bad403b.join());

  // ---- home, packages, payments (Lervyn seed values)
  const home = await L.get('/student/home');
  const h = home.json;
  check('home: Lervyn, 4th Kyu, HQ, adult, male', home.status === 200 && h.profile.name === 'Lervyn Wong' && h.profile.rank === '4th Kyu' && h.profile.group === 'adult' && h.profile.gender === 'Male', home.text.slice(0, 200));
  check('home: no password_hash anywhere', !/password|hash/i.test(home.text));
  check('home: the 25-lesson pack bought 15 Sep has 18 left (first used)', h.packages[0].id === 'SP-001' && h.packages[0].left === 18 && h.packages[0].total === 25 && h.packages[1].left === 25 && h.credits === 43, JSON.stringify(h.packages));
  // the fake day is 6 Nov but the clock is real: the 19:00-20:00 class of that day drops out of "upcoming" once it is over (20:00 Singapore time)
  const sgHour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', hour12: false }).format(new Date());
  const firstOver = sgHour >= 20 && sgHour < 24;
  check(`home: ${firstOver ? '2' : '3'} upcoming bookings (${firstOver ? '' : '6, '}9 and 11 Nov)`, h.upcoming.length === (firstOver ? 2 : 3) && h.upcoming[0].lessonId === (firstOver ? 'LS-20261109-1900-HQ-A' : 'LS-20261106-1900-HQ-A'), JSON.stringify(h.upcoming.map(x => x.lessonId)));
  check('home: attendance history has present + noshow outcomes', h.attendance.some(a => a.status === 'present') && h.attendance.some(a => a.status === 'noshow'));
  check('home: grade target 3rd Kyu, 29 of 36 sessions, not eligible yet', h.grade.target === '3rd Kyu' && h.grade.sessions === 29 && h.grade.needSessions === 36 && h.grade.eligible === false && h.grade.date === '2026-12-13' && h.grade.close === '2026-11-29', JSON.stringify(h.grade));
  check('home: remarks are Lervyn\'s (RM-03..05), no grading note (RM-06 hidden), none about other students', h.remarks.length === 3 && !h.remarks.some(r => r.kind === 'grading' || /Shodan|Strong ukemi|suwari-waza/.test(r.text)), JSON.stringify(h.remarks.map(r => r.id)));
  check('home: rate queue lists attended classes of the last 7 days', h.rateQueue.length === 4, JSON.stringify(h.rateQueue.map(r => r.lessonId)));

  // ---- grading notes are for instructors/examiners only (user decision): never in any student response
  const studentGets = routes.filter(([m]) => m === 'GET').map(([, p]) => p).concat(['/student/payments/L-1022', '/student/timetable?weekStart=2026-11-09']);
  const leakScan = async (needle) => { const bad = []; for (const p of studentGets) { const r = await L.get(p); if (r.text.includes(needle) || /"kind":"grading"/.test(r.text)) bad.push(p); } return bad; };
  const rm06 = 'On track for the next grading';
  let leaked = await leakScan(rm06);
  check('grading note RM-06 body is absent from every student GET', !leaked.length, leaked.join());
  await q(`insert into instructor_remark (id, kind, lesson_id, student_id, instructor_id, body, created_at) values ('RM-FIXG', 'grading', null, 'S-001', 'INS-0042', 'FIXTURE grading note for examiners only', now())`);
  leaked = await leakScan('FIXTURE grading note');
  check('a fresh grading remark inserted by SQL is also hidden from the student', !leaked.length, leaked.join());
  check('home still has no remark of kind grading after the insert', !(await L.get('/student/home')).json.remarks.some(r => r.kind === 'grading'));
  const ros = await INS.get('/instructor/sessions/LS-20261030-1900-HQ-A');
  const lrow = ros.status === 200 ? ros.json.rows.find(r => r.userId === 'S-001') : null;
  check('instructor roster still shows the grading note (RM-06) to the instructor', !!lrow && lrow.gradingNote.startsWith(rm06), ros.text.slice(0, 200));
  await q(`delete from instructor_remark where id = 'RM-FIXG'`);
  const dbPay = await q(`select count(*)::int n from payment where user_id = 'S-001'`);
  const pays = await L.get('/student/payments');
  check('payments: Lervyn sees exactly his own rows (count equals the db)', pays.json.length === dbPay[0].n && pays.json.length === 7 && pays.json.every(p => !('userId' in p)), `n=${pays.json.length}`);
  expect('payment of another student -> 404', await J.get('/student/payments/L-1022'), 404, 'PAYMENT_NOT_FOUND');
  expect('own payment by id', await L.get('/student/payments/L-1022'), 200);
  const jp = await J.get('/student/payments');
  check('payments: Jamie does not see Lervyn\'s', jp.json.every(p => !['L-1022', 'L-1023', 'L-1024'].includes(p.id)));
  const pk = await L.get('/student/packages');
  check('packages: adult defs (4), 2 held, max 2', pk.json.defs.length === 4 && pk.json.passes.length === 2 && pk.json.maxPackages === 2 && pk.json.unlimited === null, pk.text.slice(0, 200));
  const ep = await E.get('/student/packages');
  check('packages: a child sees the kids packages only', ep.json.defs.length === 3 && ep.json.defs.every(d => d.id.startsWith('k')));

  // ---- timetable
  expect('timetable: not a Monday -> 400', await L.get('/student/timetable?weekStart=2026-11-10'), 400, 'INVALID_WEEK');
  expect('timetable: past week -> 400', await L.get('/student/timetable?weekStart=2026-10-26'), 400, 'INVALID_WEEK');
  expect('timetable: bad query field -> 400', await L.get('/student/timetable?foo=1'), 400, 'VALIDATION_ERROR');
  const tt = await L.get('/student/timetable?weekStart=2026-11-09');
  const byId = Object.fromEntries(tt.json.sessions.map(s => [s.lessonId, s]));
  check('timetable: 19 HQ group classes this week, no private lessons', tt.status === 200 && tt.json.sessions.length === 19, `n=${tt.json.sessions && tt.json.sessions.length}`);
  check('timetable: Monday 19:00 is booked, Advanced/Ladies/kids are blocked with a reason', byId['LS-20261109-1900-HQ-A'].state === 'booked' && byId['LS-20261112-2000-HQ-A'].state === 'blocked' && byId['LS-20261112-2000-HQ-A'].whyNot === '1st Kyu & above'
    && byId['LS-20261110-2000-HQ-A'].whyNot === 'Ladies only' && byId['LS-20261109-1800-HQ-A'].whyNot === 'Children only' && byId['LS-20261109-2000-HQ-A'].state === 'open');

  // ---- booking rules
  const IM = 'LS-20261109-2000-HQ-A';
  expect('book: unknown field -> 400', await L.post('/student/bookings', { lessonId: IM, passId: 'SP-002' }), 400, 'VALIDATION_ERROR');
  expect('book: unknown lesson -> 404', await L.post('/student/bookings', { lessonId: 'LS-NOPE' }), 404, 'CLASS_NOT_FOUND');
  expect('book: Advanced at 4th Kyu -> NOT_ELIGIBLE', await L.post('/student/bookings', { lessonId: 'LS-20261112-2000-HQ-A' }), 403, 'NOT_ELIGIBLE');
  expect('book: Ladies as a man -> NOT_ELIGIBLE', await L.post('/student/bookings', { lessonId: 'LS-20261110-2000-HQ-A' }), 403, 'NOT_ELIGIBLE');
  expect('book: children class as an adult -> NOT_ELIGIBLE', await L.post('/student/bookings', { lessonId: 'LS-20261109-1800-HQ-A' }), 403, 'NOT_ELIGIBLE');
  expect('book: an adult class as a child -> NOT_ELIGIBLE', await E.post('/student/bookings', { lessonId: 'LS-20261110-1900-HQ-A' }), 403, 'NOT_ELIGIBLE');
  expect('book: SG50 under 50 -> NOT_ELIGIBLE', await L.post('/student/bookings', { lessonId: 'LS-20261108-1000-HQ-A' }), 403, 'NOT_ELIGIBLE');
  expect('book: a class today -> TOO_LATE (minimum 1 day ahead)', await L.post('/student/bookings', { lessonId: 'LS-20261106-1900-HQ-A' }), 409, 'TOO_LATE');
  expect('book: past 1 month ahead -> TOO_EARLY', await L.post('/student/bookings', { lessonId: 'LS-20261207-1900-HQ-A' }), 409, 'TOO_EARLY');
  expect('book: a class already booked -> ALREADY_BOOKED', await L.post('/student/bookings', { lessonId: 'LS-20261109-1900-HQ-A' }), 409, 'ALREADY_BOOKED');
  expect('book: private lesson is not bookable online -> 403', await L.post('/student/bookings', { lessonId: (await q(`select lesson_id from class_session s join class_template t on t.id = s.template_id where t.is_private and s.session_date = '2026-11-09' limit 1`))[0].lesson_id }), 403, 'NOT_BOOKABLE');
  expect('book: Intermediate at 4th Kyu is allowed', await L.post('/student/bookings', { lessonId: IM }), 201);
  const afterBook = await L.get('/student/packages');
  check('book: one lesson taken from the pack that expires first (18 -> 17)', afterBook.json.passes[0].id === 'SP-001' && afterBook.json.passes[0].left === 17 && afterBook.json.passes[1].left === 25, JSON.stringify(afterBook.json.passes));
  const cx = await L.del(`/student/bookings/${IM}`);
  check('cancel > 4 h ahead returns the lesson', cx.status === 200 && cx.json.refunded === true && cx.json.package.left === 18, cx.text);
  const back = (await q(`select lessons_left from student_package where id = 'SP-001'`))[0].lessons_left;
  check('db: lessons_left back to 18', back === 18);
  expect('cancel again -> NOT_BOOKED', await L.del(`/student/bookings/${IM}`), 404, 'NOT_BOOKED');
  expect('re-book after cancelling works (row reused)', await L.post('/student/bookings', { lessonId: IM }), 201);
  await L.del(`/student/bookings/${IM}`);
  expect('cancel another student\'s booking -> 404', await M.del('/student/bookings/LS-20261111-1900-HQ-A'), 404, 'NOT_BOOKED');
  check('...and it is still booked', (await q(`select attendance_status s from class_attendance where lesson_id = 'LS-20261111-1900-HQ-A' and user_id = 'S-001'`))[0].s === 'Booked');

  // fixtures relative to the server clock
  const meta = (await client(app.base).get('/meta')).json;
  const mk = async (id, day, start, end, type, cap, status = 'Scheduled') => q(
    `insert into class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity, status) values ($1,'hq',$2,$3,$4,'Mat C',$5,'INS-0042',$6,$7)`, [id, day, start, end, type, cap, status]);
  await mk('LS-FIX-OVERLAP', '2026-11-09', '20:30', '21:30', 'Adults', 10);
  expect('book: overlapping another booking -> TIME_CLASH', await (async () => { await L.post('/student/bookings', { lessonId: IM }); const r = await L.post('/student/bookings', { lessonId: 'LS-FIX-OVERLAP' }); await L.del(`/student/bookings/${IM}`); return r; })(), 409, 'TIME_CLASH');
  await mk('LS-FIX-FULL', '2026-11-08', '15:00', '16:00', 'Adults', 1);
  await q(`insert into class_attendance (lesson_id, user_id, attendance_status) values ('LS-FIX-FULL', 'S-002', 'Booked')`);
  expect('book: full class -> CLASS_FULL', await L.post('/student/bookings', { lessonId: 'LS-FIX-FULL' }), 409, 'CLASS_FULL');
  await mk('LS-FIX-CANCELLED', '2026-11-08', '17:00', '18:00', 'Adults', 10, 'Cancelled');
  expect('book: a cancelled class -> CLASS_CLOSED', await L.post('/student/bookings', { lessonId: 'LS-FIX-CANCELLED' }), 409, 'CLASS_CLOSED');
  await q(`insert into class_closure (id, dojo_id, from_date, to_date, note) values ('CL-FIX', 'hq', '2026-11-14', '2026-11-14', 'fixture')`);
  expect('book: a closure day -> CLASS_CLOSED', await L.post('/student/bookings', { lessonId: 'LS-20261114-1100-HQ-A' }), 409, 'CLASS_CLOSED');
  expect('book: no package -> NO_CREDIT', await M.post('/student/bookings', { lessonId: 'LS-20261108-0900-HQ-A' }), 409, 'NO_CREDIT');
  const dojoOnly = await q(`select lesson_id from class_session where dojo_id = 'bedok' and session_date > '2026-11-06' limit 1`);
  expect('book: a non-HQ class -> 403 NOT_BOOKABLE', await L.post('/student/bookings', { lessonId: dojoOnly[0].lesson_id }), 403, 'NOT_BOOKABLE');
  expect('book: lapsed member -> MEMBERSHIP_INACTIVE', await (await login(app.base, 'student', 'ASK-2022-1177')).post('/student/bookings', { lessonId: 'LS-20261108-0900-HQ-A' }), 403, 'MEMBERSHIP_INACTIVE');

  // Unlimited: no lesson is taken
  const jl = (await q("select s.lesson_id from class_session s join class_template t on t.id = s.template_id where s.dojo_id = 'hq' and t.class_type = 'Adults' and s.session_date between '2026-11-12' and '2026-11-30' and not exists (select 1 from class_attendance a where a.lesson_id = s.lesson_id and a.user_id = 'S-002') order by s.session_date limit 1"))[0].lesson_id;
  const jb = await J.post('/student/bookings', { lessonId: jl });
  check('unlimited plan covers a booking and nothing is deducted', jb.status === 201 && jb.json.package.unlimited === true && jb.json.package.left === null, jb.text);
  const jc = await J.del('/student/bookings/' + jl);
  check('cancelling an unlimited booking refunds nothing', jc.status === 200 && jc.json.refunded === false);

  // cancel window with fixtures starting soon: book 7 Nov, then move the class to today
  await mk('LS-FIX-LATE', '2026-11-07', '15:00', '16:00', 'Adults', 10);
  await mk('LS-FIX-STARTED', '2026-11-07', '16:00', '17:00', 'Adults', 10);
  const nowMs = Date.parse(meta.now), p2 = sgParts(new Date(nowMs + 2 * 36e5)), p0 = sgParts(new Date(nowMs - 20 * 6e4));
  if (+p2.hour <= 22 && p2.day === sgParts(new Date(nowMs)).day && +p0.hour < 23 && p0.day === sgParts(new Date(nowMs)).day) {
    const bk1 = await L.post('/student/bookings', { lessonId: 'LS-FIX-LATE' }), bk2 = await L.post('/student/bookings', { lessonId: 'LS-FIX-STARTED' });
    check('fixture classes booked', bk1.status === 201 && bk2.status === 201, bk1.text + bk2.text);
    const leftBefore = (await q(`select lessons_left from student_package where id = 'SP-001'`))[0].lessons_left;
    const st = `${p2.hour}:${p2.minute}`, en = `${String(+p2.hour + 1).padStart(2, '0')}:${p2.minute}`;
    await q(`update class_session set session_date = '2026-11-06', start_time = $1, end_time = $2 where lesson_id = 'LS-FIX-LATE'`, [st, en]);
    const late = await L.del('/student/bookings/LS-FIX-LATE');
    check('cancel < 4 h before: lesson is NOT returned', late.status === 200 && late.json.refunded === false && late.json.package.left === leftBefore, late.text);
    check('late cancellation is noted on the row', /Late cancellation/.test((await q(`select remarks from class_attendance where lesson_id = 'LS-FIX-LATE' and user_id = 'S-001'`))[0].remarks));
    await q(`update class_session set session_date = '2026-11-06', start_time = $1, end_time = $2 where lesson_id = 'LS-FIX-STARTED'`, [`${p0.hour}:${p0.minute}`, `${String(+p0.hour + 1).padStart(2, '0')}:${p0.minute}`]);
    expect('cancel after the class started -> TOO_LATE', await L.del('/student/bookings/LS-FIX-STARTED'), 409, 'TOO_LATE');
  } else check('(skipped: server clock too close to midnight for the < 4 h fixtures)', true);

  // Used up and back: Marcus holds one lesson
  const mb = await M.post('/student/packages', { packageId: 'a10', method: 'PayNow' });
  check('buy: a10 for 270 from package_def, 10 lessons, valid 77 days', mb.status === 201 && mb.json.payment.amount === 270 && mb.json.package.total === 10 && mb.json.package.expires === '2027-01-22' && mb.json.payment.method === 'PayNow' && mb.json.payment.status === 'Paid', mb.text);
  const pay = (await q(`select kind, amount, channel, student_package_id from payment where id = $1`, [mb.json.payment.id]))[0];
  check('buy: payment row Package/online linked to the pack', pay.kind === 'Package' && pay.channel === 'online' && pay.student_package_id === mb.json.package.id);
  await q(`update student_package set lessons_left = 1 where id = $1`, [mb.json.package.id]);
  const mbk = await M.post('/student/bookings', { lessonId: 'LS-20261108-0900-HQ-A' });
  check('booking the last lesson marks the pack Used up', mbk.status === 201 && mbk.json.package.left === 0 && mbk.json.package.status === 'Used up', mbk.text);
  const mc = await M.del('/student/bookings/LS-20261108-0900-HQ-A');
  check('cancelling early gives it back and the pack is Active again', mc.json.refunded === true && mc.json.package.left === 1 && mc.json.package.status === 'Active', mc.text);

  // ---- packages: price tampering, limit, audience, unlimited twice
  expect('buy: client amount is rejected (strict body)', await M.post('/student/packages', { packageId: 'a25', amount: 1 }), 400, 'VALIDATION_ERROR');
  expect('buy: unknown package -> 404', await M.post('/student/packages', { packageId: 'zzz' }), 404, 'PACKAGE_NOT_FOUND');
  expect('buy: a children package for an adult -> 403', await M.post('/student/packages', { packageId: 'k1' }), 403, 'NOT_ELIGIBLE');
  expect('buy: bad payment method -> 400', await M.post('/student/packages', { packageId: 'a25', method: 'Bitcoin' }), 400, 'VALIDATION_ERROR');
  expect('buy: Unlimited as the second pack works', await M.post('/student/packages', { packageId: 'aun' }), 201);
  expect('buy: a third package -> PACKAGE_LIMIT', await M.post('/student/packages', { packageId: 'a50' }), 409, 'PACKAGE_LIMIT');
  expect('buy: Lervyn already holds 2 -> PACKAGE_LIMIT', await L.post('/student/packages', { packageId: 'a10' }), 409, 'PACKAGE_LIMIT');
  expect('buy: Unlimited twice -> ALREADY_ACTIVE', await (async () => { await A.post('/student/packages', { packageId: 'aun' }); return A.post('/student/packages', { packageId: 'aun' }); })(), 409, 'ALREADY_ACTIVE');
  check('Used up / Expired packs do not count toward the limit (Lervyn\'s 10-lesson pack is Used up)', (await q(`select status from student_package where id = 'SP-023'`))[0].status === 'Used up');
  await q(`update student_package set expires_at = '2026-11-01' where id = 'SP-022'`);
  const sweepRes = await (await login(app.base, 'student', 'ASK-2025-2064')).get('/student/packages');
  check('status sweep marks a past-date pack Expired', sweepRes.json.passes.length === 0 && (await q(`select status from student_package where id = 'SP-022'`))[0].status === 'Expired');

  // ---- extension requests
  expect('extension: compassion for an adult pack -> 403', await L.post('/student/packages/SP-001/extension-requests', { kind: 'Compassion', days: 7 }), 403, 'NOT_ELIGIBLE');
  expect('extension: MC without a document -> 400', await L.post('/student/packages/SP-001/extension-requests', { kind: 'MC', days: 5 }), 400, 'VALIDATION_ERROR');
  expect('extension: pack of another student -> 404', await L.post('/student/packages/SP-005/extension-requests', { kind: 'MC', days: 5, documentRef: 'mc.pdf' }), 404, 'PACKAGE_NOT_FOUND');
  expect('extension: Unlimited cannot be extended', await J.post('/student/packages/SP-003/extension-requests', { kind: 'MC', days: 5, documentRef: 'mc.pdf' }), 409, 'NOT_EXTENDABLE');
  expect('extension: compassion over 14 days -> 400', await E.post('/student/packages/SP-010/extension-requests', { kind: 'Compassion', days: 15 }), 400, 'VALIDATION_ERROR');
  const ex = await E.post('/student/packages/SP-010/extension-requests', { kind: 'Compassion', days: 14 });
  check('extension: compassion 14 days accepted, pending', ex.status === 201 && ex.json.kind === 'compassion' && ex.json.status === 'pending' && ex.json.days === 14, ex.text);
  expect('extension: a second one while waiting -> ALREADY_PENDING', await E.post('/student/packages/SP-010/extension-requests', { kind: 'Compassion', days: 7 }), 409, 'ALREADY_PENDING');
  const exm = await L.post('/student/packages/SP-001/extension-requests', { kind: 'MC', days: 5, documentRef: 'mc-lervyn.pdf' });
  check('extension: MC with a document accepted', exm.status === 201 && exm.json.kind === 'mc' && exm.json.file === 'mc-lervyn.pdf', exm.text);
  expect('extension: another student cannot withdraw it', await J.del(`/student/extension-requests/${exm.json.id}`), 404, 'REQUEST_NOT_FOUND');
  expect('extension: the owner can withdraw it', await L.del(`/student/extension-requests/${exm.json.id}`), 200);
  check('extension: listed on the packages page for the owner only', (await E.get('/student/packages')).json.mcRequests.some(r => r.id === ex.json.id) && !(await L.get('/student/packages')).json.mcRequests.some(r => r.id === ex.json.id));

  // ---- feedback (anonymous)
  expect('feedback: a class not attended -> 403', await L.post('/student/feedback', { lessonId: 'LS-20261111-1900-HQ-A', rating: 4 }), 403, 'NOT_ATTENDED');
  expect('feedback: rating out of range -> 400', await L.post('/student/feedback', { lessonId: 'LS-20261104-1900-HQ-A', rating: 9 }), 400, 'VALIDATION_ERROR');
  const before = (await q(`select count(*)::int n from class_feedback`))[0].n;
  expect('feedback: rate an attended class', await L.post('/student/feedback', { lessonId: 'LS-20261104-1900-HQ-A', rating: 5, tags: ['Good pace'], note: 'Great' }), 201);
  check('feedback: one anonymous row added', (await q(`select count(*)::int n from class_feedback`))[0].n === before + 1);
  const cols = (await q(`select column_name from information_schema.columns where table_name = 'class_feedback'`)).map(r => r.column_name);
  check('feedback: class_feedback has no student column', !cols.some(c => /user|student/.test(c)), cols.join());
  const newest = (await q(`select to_char(created_at at time zone 'Asia/Singapore', 'YYYY-MM-DD HH24:MI:SS') t, note from class_feedback where note = 'Great'`))[0];
  check('feedback: stored time is cut to the day (midnight)', /\d{4}-\d{2}-\d{2} 00:00:00/.test(newest.t.replace('T', ' ')), newest.t);
  expect('feedback: a second answer -> ALREADY_RATED', await L.post('/student/feedback', { lessonId: 'LS-20261104-1900-HQ-A', rating: 1 }), 409, 'ALREADY_RATED');
  expect('feedback: skip a class (no feedback row)', await L.post('/student/feedback', { lessonId: 'LS-20261102-1900-HQ-A', skipped: true }), 201);
  check('feedback: skipped adds no row', (await q(`select count(*)::int n from class_feedback`))[0].n === before + 1);
  check('feedback: rate queue shrinks to 2', (await L.get('/student/home')).json.rateQueue.length === 2);

  // ---- profile
  expect('profile: name cannot be changed -> 400', await L.patch('/student/profile', { fullName: 'Hacker' }), 400, 'VALIDATION_ERROR');
  expect('profile: rank cannot be changed -> 400', await L.patch('/student/profile', { rankId: '1d' }), 400, 'VALIDATION_ERROR');
  expect('profile: hours cannot be changed -> 400', await L.patch('/student/profile', { accumulatedHours: 99 }), 400, 'VALIDATION_ERROR');
  expect('profile: bad phone -> 400', await L.patch('/student/profile', { contactNo: 'abc' }), 400, 'VALIDATION_ERROR');
  const j0 = (await q(`select email from users where id = 'S-002'`))[0].email;
  expect('profile: email taken by Jamie -> 409', await L.patch('/student/profile', { email: j0 }), 409, 'EMAIL_IN_USE');
  const pp = await L.patch('/student/profile', { contactNo: '9000 1234', emergencyContact: 'May Wong (Parent) 9876 5432', email: 'Lervyn.New@Email.com' });
  check('profile: whitelisted fields saved, email lower-cased', pp.status === 200 && pp.json.contactNo === '9000 1234' && pp.json.email === 'lervyn.new@email.com' && pp.json.name === 'Lervyn Wong', pp.text);
  check('profile: the other student is untouched', (await q(`select contact_no from student_profile where user_id = 'S-002'`))[0].contact_no === '9010 2211');
  const gp = await L.get('/student/profile');
  check('profile GET: contact, emergency, joined and membership', gp.json.joinedOn === '2025-06-14' && gp.json.expiry === '2027-01-02' && gp.json.status === 'Active' && gp.json.emergencyContact.startsWith('May Wong') && !/password/i.test(gp.text), gp.text.slice(0, 200));

  // ---- grading
  const g0 = await L.get('/student/grading');
  check('grading: 4 checklist items, sessions 29/36 is the unmet one', g0.json.grade.checks.length === 4 && g0.json.grade.checks.filter(c => !c[2]).length === 1 && g0.json.grade.checks[2][1] === '29 / 36', JSON.stringify(g0.json.grade.checks));
  check('grading: fee for the target rank 3rd Kyu is 50, no late fee', g0.json.fee.base === 50 && g0.json.fee.late === 0 && g0.json.fee.total === 50);
  check('grading: feedback is Lervyn\'s two gradings, newest first', g0.json.feedback.length === 2 && g0.json.feedback[0].from === '5th Kyu' && g0.json.feedback[0].to === '4th Kyu' && g0.json.feedback[1].to === '5th Kyu', JSON.stringify(g0.json.feedback.map(f => f.to)));
  expect('grading: not eligible -> NOT_ELIGIBLE', await L.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'book.jpg' }), 403, 'NOT_ELIGIBLE');
  await q(`update student_profile set accumulated_hours = 36 where user_id = 'S-001'`);
  check('grading: with 36 sessions the checklist is met', (await L.get('/student/grading')).json.grade.eligible === true);
  expect('grading: client fee is rejected (strict body)', await L.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'b.jpg', fee: 1 }), 400, 'VALIDATION_ERROR');
  expect('grading: a past session -> SESSION_CLOSED', await L.post('/student/grading/applications', { sessionId: 'GR-20260927', bookFile: 'b.jpg' }), 409, 'SESSION_CLOSED');
  expect('grading: unknown session -> 404', await L.post('/student/grading/applications', { sessionId: 'GR-NOPE', bookFile: 'b.jpg' }), 404, 'SESSION_NOT_FOUND');
  const ga = await L.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'book.jpg', method: 'Visa' });
  check('grading: applied, fee 50 for the 3rd Kyu target', ga.status === 201 && ga.json.fee.total === 50 && ga.json.application.status === 'Submitted' && ga.json.payment.amount === 50, ga.text);
  const gpay = (await q(`select kind, amount, item, status from payment where id = $1`, [ga.json.payment.id]))[0];
  check('grading: payment row Grading fee 50 Paid, application linked', gpay.kind === 'Grading fee' && Number(gpay.amount) === 50 && gpay.item === 'Grading fee · 3rd Kyu' && (await q(`select count(*)::int n from grading_application where id = $1 and fee_payment_id = $2 and to_rank_id = '3k' and from_rank_id = '4k'`, [ga.json.application.id, ga.json.payment.id]))[0].n === 1);
  expect('grading: a second application -> ALREADY_APPLIED', await L.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'b.jpg' }), 409, 'ALREADY_APPLIED');
  expect('grading: another student cannot withdraw it', await J.del(`/student/grading/applications/${ga.json.application.id}`), 404, 'APPLICATION_NOT_FOUND');
  check('grading: overview shows the application', (await L.get('/student/grading')).json.application.id === ga.json.application.id);
  expect('grading: the owner withdraws', await L.del(`/student/grading/applications/${ga.json.application.id}`), 200);
  expect('grading: withdrawing twice -> 409', await L.del(`/student/grading/applications/${ga.json.application.id}`), 409, 'NOT_WITHDRAWABLE');
  await q(`update grading_session set application_close_date = '2026-11-01' where id = 'GR-20261213'`);
  const gl = await L.get('/student/grading');
  check('grading: after the close date the late fee 20 is added (70)', gl.json.fee.late === 20 && gl.json.fee.total === 70, JSON.stringify(gl.json.fee));
  const ga2 = await L.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'book.jpg' });
  check('grading: late application paid 70', ga2.status === 201 && ga2.json.fee.total === 70 && ga2.json.payment.amount === 70, ga2.text);
  await q(`update grading_session set application_close_date = '2026-11-29' where id = 'GR-20261213'`);
  // a different rank: Kenji 3rd Kyu -> 2nd Kyu fee 60
  await q(`update student_profile set accumulated_hours = 40, total_accumulated_hours = 98, weapon_hours = 8 where user_id = 'S-008'`);
  const kg = await K.get('/student/grading');
  check('grading: Kenji (3rd Kyu) targets 2nd Kyu, fee 60, eligible', kg.json.grade.target === '2nd Kyu' && kg.json.fee.base === 60 && kg.json.grade.eligible === true, JSON.stringify(kg.json.grade));
  const kga = await K.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'k.jpg' });
  check('grading: Kenji paid 60', kga.status === 201 && kga.json.fee.total === 60);
  // top rank
  await q(`update student_profile set rank_id = '1d' where user_id = 'S-002'`);
  expect('grading: a 1st Dan has nothing to grade for -> TOP_RANK', await J.post('/student/grading/applications', { sessionId: 'GR-20261213', bookFile: 'b.jpg' }), 409, 'TOP_RANK');
  await q(`update student_profile set rank_id = '3k' where user_id = 'S-002'`);

  // ---- generic error shape and no stack leaks
  const bad = await L.get('/student/payments/%00');
  check('weird id -> clean 4xx JSON error, no stack', bad.status >= 400 && bad.status < 500 && !/at .*\.js/.test(bad.text), `${bad.status} ${bad.text.slice(0, 120)}`);
} catch (e) { check('suite crashed: ' + e.message, false, e.stack); }
await pg.end();
await app.stop();
S.done();
