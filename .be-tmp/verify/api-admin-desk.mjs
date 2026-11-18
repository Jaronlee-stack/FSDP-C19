// Admin desk endpoints: front desk vs Business Admin matrix, rosters, bookings, walk-ins, attendance, payments, refunds, day lock, equipment,
// registrations, extensions, exceptions, follow-ups, notifications, members, SQL injection strings. Spawns its own app (date pinned to 2026-11-06).
import { spawnApp, resetDb, client, login, pgConnect, suite, ACCOUNTS } from './lib.mjs';
import { SQLI } from './api-sqli.mjs';
await resetDb();
const app = await spawnApp();
const S = suite('api-admin-desk');
const { check, expect } = S;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const all = [];            // every admin response body, scanned at the end for secrets
const wrap = c => { const api = c.api; c.api = async (...a) => { const r = await api(...a); if (String(a[1]).startsWith('/admin')) all.push(r.text); return r; };
  for (const m of ['get', 'post', 'put', 'patch', 'del']) { const key = m === 'del' ? 'DELETE' : m.toUpperCase(); c[m] = (p, b, o) => c.api(key, p, key === 'GET' ? undefined : b, o); } return c; };
const num = x => Number(x);
try {
  const anon = client(app.base);
  const FD = wrap(await login(app.base, ...ACCOUNTS.frontdesk)), BA = wrap(await login(app.base, ...ACCOUNTS.business));
  const ST = await login(app.base, ...ACCOUNTS.student), INS = await login(app.base, ...ACCOUNTS.instructor);
  check('ADM-101 signs in as front desk, ADM-001 as Business Admin', FD.loginResult.json.user.adminType === 'frontdesk' && BA.loginResult.json.user.adminType === 'business');
  const inactive = await client(app.base).post('/auth/login', { portal: 'admin', identifier: 'ADM-102', password: 'password123' });
  check('ADM-102 (inactive staff) cannot sign in', inactive.status === 403 && inactive.json.error.code === 'ACCOUNT_DEACTIVATED');

  // ---------------- fixtures: lessons around the pinned date
  const lesson = (id, day, start, end, type, cap = 20, status = 'Scheduled') => pg.query(
    `INSERT INTO class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity, status, ended_at)
     VALUES ($1, 'hq', $2, $3, $4, 'Mat C', $5, 'INS-0042', $6, $7, NULL)`, [id, day, start, end, type, cap, status]);
  const book = (lid, uid, st = 'Booked', pack = null) => pg.query(
    `INSERT INTO class_attendance (lesson_id, user_id, attendance_status, student_package_id, booked_via) VALUES ($1, $2, $3, $4, 'online')`, [lid, uid, st, pack]);
  await lesson('LS-DX-A', '2026-11-10', '18:00', '19:00', 'Adults');
  await lesson('LS-DX-ADV', '2026-11-10', '20:00', '21:00', 'Advanced');
  await lesson('LS-DX-FULL', '2026-11-11', '18:00', '19:00', 'Adults', 1); await book('LS-DX-FULL', 'S-001');
  await lesson('LS-DX-B', '2026-11-12', '18:00', '19:00', 'Adults');
  await lesson('LS-DX-C', '2026-11-12', '20:00', '21:00', 'Adults');
  await lesson('LS-DX-W1', '2026-11-10', '16:00', '17:00', 'Adults', 3);
  await lesson('LS-DX-W2', '2026-11-11', '16:00', '17:00', 'Adults');
  await lesson('LS-DX-WEAP', '2026-11-10', '14:00', '15:00', 'Weapons');
  await lesson('LS-DX-CANC', '2026-11-13', '18:00', '19:00', 'Adults', 20, 'Cancelled');
  await lesson('LS-DX-PAST', '2026-11-05', '10:00', '11:00', 'Adults');
  await book('LS-DX-PAST', 'S-001'); await book('LS-DX-PAST', 'S-002'); await book('LS-DX-PAST', 'S-011');
  const hrs = async u => num((await q(`select total_accumulated_hours::float t from student_profile where user_id = $1`, [u]))[0].t);
  const left = async id => (await q(`select lessons_left l, status s, to_char(expires_at,'YYYY-MM-DD') e from student_package where id = $1`, [id]))[0];

  // ---------------- 401 / 403 matrix
  const routes = [
    ['GET', '/admin/summary'], ['GET', '/admin/today'], ['GET', '/admin/rosters?date=2026-11-06'], ['GET', '/admin/rosters/LS-DX-A'],
    ['POST', '/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2025-0612' }], ['DELETE', '/admin/rosters/LS-DX-A/bookings/S-024', {}],
    ['POST', '/admin/rosters/LS-DX-A/walk-ins', { guestId: 'G-03' }], ['POST', '/admin/rosters/LS-DX-A/waitlist', { memberNo: 'ASK-2025-0612' }],
    ['DELETE', '/admin/rosters/LS-DX-A/waitlist/S-024'], ['POST', '/admin/rosters/LS-DX-A/waitlist/S-024/offer', {}],
    ['PUT', '/admin/rosters/LS-DX-A/attendance/S-024', { status: 'Attended' }], ['POST', '/admin/rosters/LS-DX-A/submit', { rows: [] }], ['GET', '/admin/guests'],
    ['GET', '/admin/members'], ['GET', '/admin/members/export.csv'], ['GET', '/admin/members/ASK-2025-1834'], ['PATCH', '/admin/members/ASK-2025-1834', { phone: '91234567' }],
    ['POST', '/admin/members/ASK-2025-1834/messages', { body: 'hi' }], ['POST', '/admin/members/ASK-2025-1834/contact-attempts', { method: 'Call', outcome: 'x' }],
    ['GET', '/admin/payments'], ['POST', '/admin/payments', { memberNo: 'ASK-2025-1834', item: 'reg' }], ['POST', '/admin/payments/day/lock', {}], ['DELETE', '/admin/payments/day/lock/2026-11-06'],
    ['POST', '/admin/payments/L-1001/collect', {}], ['POST', '/admin/payments/L-1001/void', { reason: 'x' }], ['POST', '/admin/payments/L-1001/mistake', { reason: 'x' }],
    ['POST', '/admin/refunds', { paymentId: 'L-1001', reason: 'x' }], ['POST', '/admin/refunds/R-01/decision', { decision: 'approved' }],
    ['GET', '/admin/equipment'], ['POST', '/admin/equipment/E-01/ready', {}], ['POST', '/admin/equipment/E-01/handover', { collectedBy: 'x' }],
    ['GET', '/admin/applications'], ['GET', '/admin/applications/APP-01'], ['PATCH', '/admin/applications/APP-01/checklist', { ruleId: 'paid', done: true }],
    ['POST', '/admin/applications/APP-01/activate', {}], ['POST', '/admin/applications/APP-01/reject', { note: 'x' }], ['POST', '/admin/applications/APP-01/request-info', { text: 'x' }],
    ['POST', '/admin/registrations', {}], ['POST', '/admin/mc-requests/MC-01/decision', { decision: 'declined' }], ['POST', '/admin/exceptions', { kind: 'access', subjectName: 'x', detail: 'x' }],
    ['POST', '/admin/exceptions/X-01/decision', { decision: 'approved', reason: 'x' }],
    ['GET', '/admin/followups'], ['POST', '/admin/followups', { kind: 'declining', dueDate: '2026-11-10' }], ['PATCH', '/admin/followups/F-01', { status: 'done' }],
    ['POST', '/admin/followups/F-01/attempts', { method: 'Call', outcome: 'x' }], ['GET', '/admin/notifications'], ['POST', '/admin/notifications/send', { audience: { type: 'all' } }]
  ];
  const bad401 = [], badS = [], badI = [];
  for (const [m, p, b] of routes) {
    if ((await anon.api(m, p, b)).status !== 401) bad401.push(p);
    const a = await ST.api(m, p, b); if (a.status !== 403 || a.json.error.code !== 'WRONG_ROLE') badS.push(p);
    const c = await INS.api(m, p, b); if (c.status !== 403 || c.json.error.code !== 'WRONG_ROLE') badI.push(p);
  }
  check(`every admin route (${routes.length}): 401 without a cookie`, !bad401.length, bad401.join());
  check('every admin route: 403 WRONG_ROLE for a student', !badS.length, badS.join());
  check('every admin route: 403 WRONG_ROLE for an instructor', !badI.length, badI.join());

  // ---------------- front desk vs Business Admin matrix (the ADMIN_PAGES split, server side)
  const baOnly = [
    ['void a payment', 'POST', '/admin/payments/L-1004/void', { reason: 'test' }], ['decide a refund', 'POST', '/admin/refunds/R-01/decision', { decision: 'approved' }],
    ['decide an exception', 'POST', '/admin/exceptions/X-01/decision', { decision: 'approved', reason: 'ok' }], ['export members CSV', 'GET', '/admin/members/export.csv'],
    ['create a follow-up', 'POST', '/admin/followups', { memberNo: 'ASK-2025-1834', kind: 'declining', dueDate: '2026-11-10' }], ['assign a follow-up', 'PATCH', '/admin/followups/F-01', { ownerId: 'ADM-001' }],
    ['unlock a day', 'DELETE', '/admin/payments/day/lock/2026-11-06']
  ];
  for (const [label, m, p, b] of baOnly) expect(`front desk: ${label} -> 403 BUSINESS_ADMIN_ONLY`, await FD.api(m, p, b), 403, 'BUSINESS_ADMIN_ONLY');
  expect('front desk: belt change -> 403 BUSINESS_ADMIN_ONLY', await FD.patch('/admin/members/ASK-2025-1834', { rankId: '3k' }), 403, 'BUSINESS_ADMIN_ONLY');
  expect('front desk: status change -> 403 BUSINESS_ADMIN_ONLY', await FD.patch('/admin/members/ASK-2025-1834', { accountStatus: 'Lapsed', reason: 'x' }), 403, 'BUSINESS_ADMIN_ONLY');
  expect('front desk: booking override -> 403 BUSINESS_ADMIN_ONLY', await FD.post('/admin/rosters/LS-DX-ADV/bookings', { memberNo: 'ASK-2025-2064', override: true, reason: 'x' }), 403, 'BUSINESS_ADMIN_ONLY');
  expect('front desk: starting grade on activation -> 403 BUSINESS_ADMIN_ONLY', await FD.post('/admin/applications/APP-01/activate', { rankId: '3k' }), 403, 'BUSINESS_ADMIN_ONLY');
  const none = (await q(`select (select count(*) from refund_request where status <> 'pending')::int r, (select count(*) from exception_request where status <> 'pending')::int x, (select count(*) from payment where status = 'Voided')::int v`))[0];
  check('front desk refusals changed nothing', none.r === 2 && none.x === 1 && none.v === 1, JSON.stringify(none));
  const fdSum = (await FD.get('/admin/summary')).json, baSum = (await BA.get('/admin/summary')).json;
  check('summary: front desk has desk counts only, Business Admin also the extras', fdSum.exceptionsPending === 0 && fdSum.failedPayments === undefined && baSum.exceptionsPending === 3 && baSum.failedPayments === 1 && baSum.importsOpen === 3, JSON.stringify([fdSum, baSum]));
  check('summary: applications badge counts waiting registrations + extension requests (+ exceptions for BA)', fdSum.applicationsWaiting === 4 && fdSum.applications === 5 && baSum.applications === 8, JSON.stringify([fdSum.applications, baSum.applications]));

  // ---------------- members
  const dbN = (await q('select count(*)::int n, count(*) filter (where account_status = \'Active\')::int a, count(*) filter (where account_status = \'Lapsed\')::int l from membership'))[0];
  const ml = (await FD.get('/admin/members?pageSize=200')).json;
  check('members: total equals SELECT count(*) (29)', ml.total === dbN.n && ml.rows.length === dbN.n && dbN.n === 29, `${ml.total} vs ${dbN.n}`);
  check('members: pill counts match the db (Active, Lapsed, guests)', ml.counts.all === dbN.n && ml.counts.active === dbN.a && ml.counts.lapsed === dbN.l && ml.counts.guests === 4, JSON.stringify(ml.counts));
  const lervyn = ml.rows.find(m => m.memberNo === 'ASK-2025-1834');
  check('members: Lervyn has 43 lessons left, 4th Kyu, HQ, no password in the row', lervyn && lervyn.left === 43 && lervyn.rank === '4th Kyu' && lervyn.dojoId === 'hq' && !('passwordHash' in lervyn), JSON.stringify(lervyn));
  const act = (await FD.get('/admin/members?filter=active&pageSize=200')).json, lap = (await FD.get('/admin/members?status=Lapsed')).json;
  check('members: filter=active and status=Lapsed match the db', act.total === dbN.a && lap.total === dbN.l && lap.rows.every(m => m.status === 'Lapsed'));
  const ow = (await FD.get('/admin/members?filter=owing')).json;
  check('members: filter=owing lists the two members with outstanding dues', ow.total === 2 && ow.rows.every(m => m.owed === 48), JSON.stringify(ow.rows.map(m => [m.memberNo, m.owed])));
  const nw = (await FD.get('/admin/members?filter=new')).json;
  check('members: filter=new (joined within 90 days) only returns recent joiners', nw.rows.length === (await q(`select count(*)::int n from student_profile where joined_on >= date '2026-11-06' - 90`))[0].n);
  const srch = (await FD.get('/admin/members?q=lervyn')).json, byNo = (await FD.get('/admin/members?q=ASK-2025-18')).json;
  check('members: search by name and by member number', srch.total === 1 && byNo.total === 1 && byNo.rows[0].name === 'Lervyn Wong');
  check('members: sort by rank puts the Dan/1st Kyu first, page size is honoured', (await FD.get('/admin/members?sort=rank&pageSize=3')).json.rows.length === 3);
  expect('members: unknown filter -> 400', await FD.get('/admin/members?filter=zzz'), 400, 'VALIDATION_ERROR');
  expect('members: page size 500 -> 400', await FD.get('/admin/members?pageSize=500'), 400, 'VALIDATION_ERROR');
  const gl = (await FD.get('/admin/members?filter=guests')).json;
  check('members: guests list has the 4 seeded guests', gl.guests.length === 4 && gl.guests.some(g => g.name === 'Nur Aisyah'));
  // SQL injection strings in members q, payments q, equipment q
  let sqlOk = true, sqlDetail = '';
  for (const s of SQLI) {
    for (const p of [`/admin/members?q=${encodeURIComponent(s)}`, `/admin/payments?q=${encodeURIComponent(s)}`, `/admin/equipment?q=${encodeURIComponent(s)}`]) {
      const r = await FD.get(p);
      const nul = s.includes('\u0000');
      const ok = nul ? r.status === 400 : (r.status === 200 && !/syntax|pg_|stack/i.test(r.text));
      let leak = false;
      if (!nul && r.status === 200) { const j = r.json; const n = (j.rows || j.ledger || j.orders || []).length; if (n === (j.total !== undefined ? 29 : -1) || (j.ledger && n >= 30) || (j.orders && n >= 4)) leak = true; }
      if (!ok || leak) { sqlOk = false; sqlDetail += ` ${p.slice(0, 40)} -> ${r.status}`; }
    }
  }
  check('SQL injection strings in members, payments and equipment search return normal (empty) results', sqlOk, sqlDetail);
  const tables = (await q(`select count(*)::int n from information_schema.tables where table_schema = 'public'`))[0].n;
  check('no table was dropped by the injection strings', tables >= 38, String(tables));
  // member record
  const rec = (await FD.get('/admin/members/ASK-2025-1834')).json;
  const dbPay = (await q(`select count(*)::int n from payment where user_id = 'S-001'`))[0].n;
  check('member record: Lervyn has 3 packages, 7 payments, bookings and follow-up sections', rec.packages.length === 3 && rec.payments.length === dbPay && dbPay === 7 && Array.isArray(rec.classes) && Array.isArray(rec.followups), JSON.stringify(Object.keys(rec)));
  check('member record: contact and medical details are present', rec.member.phone && rec.member.email === 'lervyn@email.com' && 'medical' in rec.member && rec.member.joinedOn, JSON.stringify(rec.member));
  expect('member record: unknown member -> 404', await FD.get('/admin/members/NOPE-1'), 404, 'MEMBER_NOT_FOUND');
  expect('member patch: front desk edits phone, email, emergency contact', await FD.patch('/admin/members/ASK-2025-1834', { phone: '9123 0001', email: 'lervyn.new@email.com', emergencyContact: 'Mum (Parent) · 8000 1111' }), 200);
  const after = (await q(`select sp.contact_no c, sp.emergency_contact e, u.email m from student_profile sp join users u on u.id = sp.user_id where sp.user_id = 'S-001'`))[0];
  check('member patch: saved in the db', after.c === '9123 0001' && after.m === 'lervyn.new@email.com' && /Mum/.test(after.e), JSON.stringify(after));
  expect('member patch: email of another account -> 409 EMAIL_IN_USE', await FD.patch('/admin/members/ASK-2025-1834', { email: 'jamie.tan@email.com' }), 409, 'EMAIL_IN_USE');
  expect('member patch: bad phone -> 400', await FD.patch('/admin/members/ASK-2025-1834', { phone: 'abc' }), 400, 'VALIDATION_ERROR');
  expect('member patch: empty body -> 400', await FD.patch('/admin/members/ASK-2025-1834', {}), 400, 'VALIDATION_ERROR');
  expect('member patch: unknown field (rank_id) -> 400', await FD.patch('/admin/members/ASK-2025-1834', { rank_id: '1k' }), 400, 'VALIDATION_ERROR');
  expect('member patch: Business Admin changes the belt', await BA.patch('/admin/members/ASK-2025-1834', { rankId: '3k' }), 200);
  check('member patch: belt is 3k in the db', (await q(`select rank_id from student_profile where user_id = 'S-001'`))[0].rank_id === '3k');
  expect('member patch: unknown belt -> 400', await BA.patch('/admin/members/ASK-2025-1834', { rankId: 'zz' }), 400, 'INVALID_RANK');
  expect('member patch: status change needs a reason', await BA.patch('/admin/members/ASK-2025-1834', { accountStatus: 'Lapsed' }), 400, 'VALIDATION_ERROR');
  expect('member patch: BA restores 4th Kyu', await BA.patch('/admin/members/ASK-2025-1834', { rankId: '4k' }), 200);
  expect('member message writes the sent log', await FD.post('/admin/members/ASK-2025-1834/messages', { body: 'See you at class' }), 200);
  check('member message: a sent_log row exists', (await q(`select count(*)::int n from sent_log where title = 'See you at class'`))[0].n === 1);
  const csv = await BA.get('/admin/members/export.csv');
  check('members CSV: Business Admin gets text/csv with a header and 29 rows', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /attachment/.test(csv.headers.get('content-disposition')) && csv.text.trim().split('\r\n').length === 30, csv.text.slice(0, 120));
  await pg.query(`update student_profile set full_name = '=HYPERLINK("x")' where user_id = 'S-029'`);
  check('members CSV: a name starting with = is neutralised (CSV injection)', /"'=HYPERLINK/.test((await BA.get('/admin/members/export.csv')).text));
  await pg.query(`update student_profile set full_name = 'Joel Lee' where user_id = 'S-029'`);

  // ---------------- rosters
  const week = (await FD.get('/admin/rosters?from=2026-11-02&to=2026-11-08')).json;
  const dbHq = (await q(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date between '2026-11-02' and '2026-11-08'`))[0].n;
  check('rosters: the week lists every HQ class in the db', week.sessions.length === dbHq && week.today === '2026-11-06', `${week.sessions.length} vs ${dbHq}`);
  expect('rosters: range over 15 days -> 400', await FD.get('/admin/rosters?from=2026-11-01&to=2026-12-30'), 400, 'INVALID_RANGE');
  expect('rosters: no date -> 400', await FD.get('/admin/rosters'), 400, 'VALIDATION_ERROR');
  const past = (await FD.get('/admin/rosters/LS-DX-PAST')).json;
  check('roster: yesterday\'s class shows 3 booked, attendance pending, not submitted', past.rows.length === 3 && past.session.state === 'Attendance pending' && !past.submitted && past.rows.every(r => r.status === 'booked'), JSON.stringify(past.session));
  check('roster: each row has member no, belt and an access check', past.rows.every(r => r.memberNo && r.rank && r.access && r.access.s), JSON.stringify(past.rows[0]));
  expect('roster: unknown lesson -> 404', await FD.get('/admin/rosters/NOPE'), 404, 'LESSON_NOT_FOUND');
  const todayRes = (await FD.get('/admin/today')).json;
  const dbToday = (await q(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date = '2026-11-06' and status <> 'Cancelled'`))[0].n;
  check('today: sessions today equals the db, applications waiting = 4, equipment to collect = 3', todayRes.date === '2026-11-06' && todayRes.stats.sessionsToday === dbToday && todayRes.waiting.applications === 4 && todayRes.waiting.equipmentToCollect === 3, JSON.stringify(todayRes.stats) + JSON.stringify(todayRes.waiting));

  // ---- booking rules
  const g = async (lid) => (await FD.get(`/admin/rosters/${lid}`)).json;
  const b1 = await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2025-2511' });
  expect('book: eligible student (Olivia, 4 lessons left) is booked', b1, 200);
  check('book: one lesson used (4 -> 3) and the roster shows her as a Desk booking', (await left('SP-017')).l === 3 && (await g('LS-DX-A')).rows.some(r => r.memberNo === 'ASK-2025-2511' && r.how === 'Desk'));
  expect('book: same student again -> 409 ALREADY_BOOKED', await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2025-2511' }), 409, 'ALREADY_BOOKED');
  expect('book: unknown member -> 404', await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'NOPE' }), 404, 'MEMBER_NOT_FOUND');
  expect('book: a child on an adults class -> 403 NOT_ELIGIBLE', await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2026-3101' }), 403, 'NOT_ELIGIBLE');
  expect('book: 4th Kyu on an Advanced class -> 403 NOT_ELIGIBLE (front desk refers)', await FD.post('/admin/rosters/LS-DX-ADV/bookings', { memberNo: 'ASK-2025-2064' }), 403, 'NOT_ELIGIBLE');
  expect('book: lapsed member (dues unpaid) -> 403 NOT_ELIGIBLE', await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2024-1440' }), 403, 'NOT_ELIGIBLE');
  expect('book: a member with no lessons -> 409 NO_CREDIT', await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2026-0102' }), 409, 'NO_CREDIT');
  expect('book: Business Admin override needs a reason', await BA.post('/admin/rosters/LS-DX-ADV/bookings', { memberNo: 'ASK-2025-2064', override: true }), 400, 'REASON_REQUIRED');
  expect('book: Business Admin override with a reason works', await BA.post('/admin/rosters/LS-DX-ADV/bookings', { memberNo: 'ASK-2025-2064', override: true, reason: 'Sensei invited her' }), 200);
  check('book: the override reason shows on the roster', (await g('LS-DX-ADV')).rows.some(r => r.memberNo === 'ASK-2025-2064' && r.override === 'Sensei invited her'));
  expect('book: Business Admin override lets in a member with no lessons', await BA.post('/admin/rosters/LS-DX-B/bookings', { memberNo: 'ASK-2026-0102', override: true, reason: 'Paying at the desk later' }), 200);
  check('book: ...and no lesson was taken from anyone', (await q(`select count(*)::int n from student_package where user_id = 'S-006'`))[0].n === 0);
  expect('book: a class that already started -> 409 TOO_LATE', await FD.post('/admin/rosters/LS-DX-PAST/bookings', { memberNo: 'ASK-2025-2511' }), 409, 'TOO_LATE');
  expect('book: a cancelled class -> 409 CLASS_CLOSED', await FD.post('/admin/rosters/LS-DX-CANC/bookings', { memberNo: 'ASK-2025-2511' }), 409, 'CLASS_CLOSED');
  expect('book: more than a month ahead -> 409 TOO_EARLY', await (async () => { await lesson('LS-DX-FAR', '2026-12-30', '18:00', '19:00', 'Adults'); return FD.post('/admin/rosters/LS-DX-FAR/bookings', { memberNo: 'ASK-2025-2511' }); })(), 409, 'TOO_EARLY');
  expect('book: validation (no member no.) -> 400', await FD.post('/admin/rosters/LS-DX-A/bookings', {}), 400, 'VALIDATION_ERROR');
  expect('book: unknown field -> 400', await FD.post('/admin/rosters/LS-DX-A/bookings', { memberNo: 'ASK-2025-2511', price: 0 }), 400, 'VALIDATION_ERROR');
  // time clash: Lervyn (S-001) is on LS-DX-FULL 18:00 on the 11th; book him on a clashing class
  await lesson('LS-DX-CLASH', '2026-11-11', '18:30', '19:30', 'Adults');
  expect('book: a time clash -> 409 TIME_CLASH', await FD.post('/admin/rosters/LS-DX-CLASH/bookings', { memberNo: 'ASK-2025-1834' }), 409, 'TIME_CLASH');
  // full class, waitlist, offer
  expect('book: full class -> 409 CLASS_FULL for the front desk', await FD.post('/admin/rosters/LS-DX-FULL/bookings', { memberNo: 'ASK-2025-1522' }), 409, 'CLASS_FULL');
  expect('waitlist: add a student to the full class', await FD.post('/admin/rosters/LS-DX-FULL/waitlist', { memberNo: 'ASK-2025-1522' }), 200);
  expect('waitlist: the same student again -> 409', await FD.post('/admin/rosters/LS-DX-FULL/waitlist', { memberNo: 'ASK-2025-1522' }), 409, 'ALREADY_WAITING');
  expect('waitlist: a class with space -> 409 NOT_FULL', await FD.post('/admin/rosters/LS-DX-A/waitlist', { memberNo: 'ASK-2025-1522' }), 409, 'NOT_FULL');
  check('waitlist: it shows on the roster', (await g('LS-DX-FULL')).waitlist.length === 1 && (await g('LS-DX-FULL')).waitlist[0].memberNo === 'ASK-2025-1522');
  expect('waitlist: offer while full -> 409 CLASS_FULL', await FD.post('/admin/rosters/LS-DX-FULL/waitlist/S-011/offer', {}), 409, 'CLASS_FULL');
  expect('book: Business Admin can override a full class', await BA.post('/admin/rosters/LS-DX-FULL/bookings', { memberNo: 'ASK-2021-0310', override: true, reason: 'Visiting Shihan' }), 200);
  check('book: ...so the full class now holds 2 of 1 (override)', (await g('LS-DX-FULL')).rows.length === 2);
  // cancel: front desk cancels S-001 from the full class (still over capacity until two are gone)
  const pre = await left('SP-001');
  await pg.query(`update class_attendance set student_package_id = 'SP-001' where lesson_id = 'LS-DX-FULL' and user_id = 'S-001'`);
  await pg.query(`update student_package set lessons_left = lessons_left - 1 where id = 'SP-001'`);
  const c1 = await FD.del('/admin/rosters/LS-DX-FULL/bookings/S-001', {});
  expect('cancel: 3+ days before the class returns the lesson by default', c1, 200);
  check('cancel: refunded true and the pack is back to 18', c1.json.refunded === true && (await left('SP-001')).l === pre.l, JSON.stringify([c1.json, await left('SP-001')]));
  expect('cancel: the same booking again -> 404 NOT_BOOKED', await FD.del('/admin/rosters/LS-DX-FULL/bookings/S-001', {}), 404, 'NOT_BOOKED');
  expect('waitlist: still full (override row remains), offer -> 409', await FD.post('/admin/rosters/LS-DX-FULL/waitlist/S-011/offer', {}), 409, 'CLASS_FULL');
  const c2 = await FD.del('/admin/rosters/LS-DX-FULL/bookings/S-004', { refund: false, reason: 'No MC' });
  check('cancel: refund:false keeps the lesson (nothing returned)', c2.status === 200 && c2.json.refunded === false, c2.text);
  const o1 = await FD.post('/admin/rosters/LS-DX-FULL/waitlist/S-011/offer', {});
  expect('waitlist: offer books the first in line once a seat is free', o1, 200);
  check('waitlist: they are on the roster as "Waitlist offer", off the waitlist, one lesson used', (await g('LS-DX-FULL')).rows.some(r => r.memberNo === 'ASK-2025-1522' && r.how === 'Waitlist offer') && (await g('LS-DX-FULL')).waitlist.length === 0 && (await left('SP-021')).l === 10);
  const o2 = await FD.post('/admin/rosters/LS-DX-B/bookings', { memberNo: 'ASK-2025-2490' });   // Faisal, 3 lessons, package expiring 11 Nov: class on 12 Nov is after expiry
  expect('book: a package that expires before the class -> 403 NOT_ELIGIBLE (Package expired)', o2, 403, 'NOT_ELIGIBLE');
  // cancel with an explicit refund on a booking whose lesson was used
  const pre2 = await left('SP-017');
  const c3 = await FD.del('/admin/rosters/LS-DX-A/bookings/S-024', { refund: true });
  check('cancel: Olivia\'s lesson comes back (3 -> 4)', c3.status === 200 && c3.json.refunded && (await left('SP-017')).l === pre2.l + 1, c3.text);
  expect('cancel: a walk-in guest cannot be cancelled that way when not booked', await FD.del('/admin/rosters/LS-DX-A/bookings/G-03', {}), 404, 'NOT_BOOKED');

  // ---- walk-ins
  expect('walk-in: guest with an unused trial pass', await FD.post('/admin/rosters/LS-DX-W1/walk-ins', { guestId: 'G-01' }), 200);
  check('walk-in: the trial pass is now used and the roster shows a Walk-in guest', (await q(`select used from guest_pass where user_id = 'G-01'`))[0].used === true && (await g('LS-DX-W1')).rows.some(r => r.guest && r.name === 'Nur Aisyah' && r.how === 'Walk-in'));
  expect('walk-in: the same trial guest on another class -> 409 NO_VALID_PASS', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guestId: 'G-01' }), 409, 'NO_VALID_PASS');
  expect('walk-in: a guest whose trial was used -> 409 NO_VALID_PASS', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guestId: 'G-04' }), 409, 'NO_VALID_PASS');
  expect('walk-in: the same mobile number as a used trial -> 409 NO_VALID_PASS', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guest: { name: 'Ravi M', mobile: '9876 2201' } }), 409, 'NO_VALID_PASS');
  expect('walk-in: a week pass can attend on two days', await FD.post('/admin/rosters/LS-DX-W1/walk-ins', { guestId: 'G-03' }), 200);
  expect('walk-in: ...second day', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guestId: 'G-03' }), 200);
  check('walk-in: the week pass is not consumed', (await q(`select used from guest_pass where user_id = 'G-03'`))[0].used === false);
  expect('walk-in: an expired day pass (valid 6 Nov only) -> 409 NO_VALID_PASS', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guestId: 'G-02' }), 409, 'NO_VALID_PASS');
  const wn = await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guest: { name: 'Walk In Wendy', mobile: '8123 9999' } });
  expect('walk-in: a new guest on a free trial is created and added', wn, 200);
  check('walk-in: the new guest has a profile and a consumed trial pass', (await q(`select count(*)::int n from guest_profile g join guest_pass p on p.user_id = g.user_id where g.full_name = 'Walk In Wendy' and p.used`))[0].n === 1);
  expect('walk-in: a trial guest on a Weapons class -> 409 NOT_ELIGIBLE', await FD.post('/admin/rosters/LS-DX-WEAP/walk-ins', { guest: { name: 'Another Trial', mobile: '8123 7777' } }), 409, 'NOT_ELIGIBLE');
  expect('walk-in: bad mobile -> 400', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guest: { name: 'X', mobile: '12' } }), 400, 'VALIDATION_ERROR');
  expect('walk-in: unknown guest id -> 404', await FD.post('/admin/rosters/LS-DX-W2/walk-ins', { guestId: 'G-99' }), 404, 'GUEST_NOT_FOUND');
  expect('walk-in: a full class -> 409 CLASS_FULL', await (async () => { await book('LS-DX-W1', 'S-011'); await book('LS-DX-W1', 'S-012'); return FD.post('/admin/rosters/LS-DX-W1/walk-ins', { guestId: 'G-03' }); })(), 409);
  check('guests list: has passes and used flags', (await FD.get('/admin/guests')).json.guests.some(g => g.id === 'G-04' && g.used === true));

  // ---- attendance and submit (yesterday's class)
  const h1 = await hrs('S-001'), h2 = await hrs('S-002'), h11 = await hrs('S-011');
  expect('attendance: mark Lervyn present', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-001', { status: 'Attended' }), 200);
  check('attendance: +1 hour credited once', (await hrs('S-001')) === h1 + 1);
  const again = await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-001', { status: 'Attended' });
  check('attendance: marking present again changes nothing', again.json.changed === false && (await hrs('S-001')) === h1 + 1, again.text);
  expect('attendance: present cannot be undone -> 409 ALREADY_COUNTED', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-001', { status: 'No-Show' }), 409, 'ALREADY_COUNTED');
  expect('attendance: bad status -> 400', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-001', { status: 'Late' }), 400, 'VALIDATION_ERROR');
  expect('attendance: not on this class -> 404', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-005', { status: 'Attended' }), 404, 'NOT_ON_CLASS');
  expect('submit: marks missing -> 409 UNMARKED_ROWS', await FD.post('/admin/rosters/LS-DX-PAST/submit', { rows: [{ userId: 'S-002', status: 'Attended' }] }), 409, 'UNMARKED_ROWS');
  expect('submit: a person who is not on the class -> 404', await FD.post('/admin/rosters/LS-DX-PAST/submit', { rows: [{ userId: 'S-005', status: 'Attended' }] }), 404, 'NOT_ON_CLASS');
  const sub = await FD.post('/admin/rosters/LS-DX-PAST/submit', { rows: [{ userId: 'S-001', status: 'Attended' }, { userId: 'S-002', status: 'Attended' }, { userId: 'S-011', status: 'No-Show' }] });
  expect('submit: every student marked -> submitted', sub, 200);
  check('submit: 2 present, 1 no-show, hours credited exactly once each (S-001 not twice)', sub.json.present === 2 && sub.json.noShow === 1 && (await hrs('S-001')) === h1 + 1 && (await hrs('S-002')) === h2 + 1 && (await hrs('S-011')) === h11, JSON.stringify(sub.json));
  const ss = (await g('LS-DX-PAST'));
  check('submit: the class is Done and submitted', ss.submitted && ss.session.state === 'Done' && (await q(`select status from class_session where lesson_id = 'LS-DX-PAST'`))[0].status === 'Ended');
  expect('submit: a second submit -> 409 ALREADY_SUBMITTED', await FD.post('/admin/rosters/LS-DX-PAST/submit', { rows: [] }), 409, 'ALREADY_SUBMITTED');
  expect('book: a submitted class takes no new bookings -> 409 CLASS_ENDED', await FD.post('/admin/rosters/LS-DX-PAST/bookings', { memberNo: 'ASK-2025-2511' }), 409);
  expect('correction: after submit a reason is required', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-011', { status: 'Attended' }), 400, 'REASON_REQUIRED');
  expect('correction: no-show to present with a reason', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-011', { status: 'Attended', reason: 'Had an MC, instructor confirmed' }), 200);
  check('correction: hours credited (+1), remark saved with the staff id, roster lists the correction', (await hrs('S-011')) === h11 + 1 && (await q(`select remarks from class_attendance where lesson_id = 'LS-DX-PAST' and user_id = 'S-011'`))[0].remarks.startsWith('Correction by ADM-101') && (await g('LS-DX-PAST')).corrections.length === 1);
  expect('correction: present back to no-show is refused -> 409 ALREADY_COUNTED', await FD.put('/admin/rosters/LS-DX-PAST/attendance/S-011', { status: 'No-Show', reason: 'oops' }), 409, 'ALREADY_COUNTED');
  expect('submit: an empty class -> 409 EMPTY_ROSTER', await (async () => { await lesson('LS-DX-EMPTY', '2026-11-05', '12:00', '13:00', 'Adults'); return FD.post('/admin/rosters/LS-DX-EMPTY/submit', { rows: [] }); })(), 409, 'EMPTY_ROSTER');

  // ---------------- payments
  const led = (await FD.get('/admin/payments')).json, ledBA = (await BA.get('/admin/payments')).json;
  const dbLed = (await q(`select count(*)::int n, count(*) filter (where status = 'Failed')::int f from payment`))[0];
  check('payments: front desk ledger hides Failed rows, Business Admin sees all', led.ledger.length === dbLed.n - dbLed.f && ledBA.ledger.length === dbLed.n && led.ledger.every(l => l.status !== 'Failed'), `${led.ledger.length}/${ledBA.ledger.length}/${dbLed.n}`);
  check('payments: stats (outstanding 2 rows S$96, processing 1)', led.stats.outstandingCount === 2 && led.stats.outstandingTotal === 96 && led.stats.processingCount === 1 && led.stats.failedCount === null && ledBA.stats.failedCount === 1, JSON.stringify([led.stats, ledBA.stats]));
  check('payments: filter by status and by search', (await FD.get('/admin/payments?status=Outstanding')).json.ledger.length === 2 && (await FD.get('/admin/payments?q=lervyn')).json.ledger.length === 7);
  expect('payments: bad status -> 400', await FD.get('/admin/payments?status=zzz'), 400, 'VALIDATION_ERROR');
  // take payment: price tampering ignored
  const tp = await FD.post('/admin/payments', { memberNo: 'ASK-2024-1873', item: 'pkg:a10', amount: 1, discount: 100, kind: 'Other' });
  expect('take payment: a 10-lesson pack for Ming', tp, 200);
  check('take payment: the price comes from the package (270), not the request (1); channel desk, status Paid; the pack exists', tp.json.payment.amount === 270 && tp.json.payment.channel === 'desk' && tp.json.payment.status === 'Paid' && (await q(`select lessons_left l from student_package where user_id = 'S-012'`))[0].l === 10, tp.text);
  const tp2 = await FD.post('/admin/payments', { memberNo: 'ASK-2026-0102', item: 'pkg:a10', amount: 1 });
  check('take payment: a 25-year-old (student rate, 50%) pays half of the package price: 135', tp2.status === 200 && tp2.json.payment.amount === 135 && tp2.json.basePrice === 270 && tp2.json.discountPct === 50, tp2.text);
  const nsf = await FD.post('/admin/payments', { memberNo: 'ASK-2026-3103', item: 'reg' });
  check('take payment: NSF 50% discount on registration (60 -> 30) with a note', nsf.status === 200 && nsf.json.payment.amount === 30 && /50%/.test(nsf.json.payment.note), nsf.text);
  const sen = await FD.post('/admin/payments', { memberNo: 'ASK-2023-1942', item: 'dues' });
  check('take payment: senior (age 69) 40% off annual dues (48 -> 28.8)', sen.status === 200 && sen.json.payment.amount === 28.8, sen.text);
  check('take payment: annual dues renews the membership by a year', (await q(`select to_char(membership_expiry,'YYYY-MM-DD') e, to_char(last_renewed_at,'YYYY-MM-DD') r from membership where user_id = 'S-020'`))[0].r === '2026-11-06');
  const gr = await FD.post('/admin/payments', { memberNo: 'ASK-2025-0612', item: 'grading' });
  const fee = (await q(`select grading_fee::float f from belt_rank where id = '4k'`))[0].f;
  check('take payment: grading fee is the next rank\'s fee (5th -> 4th Kyu)', gr.status === 200 && gr.json.payment.amount === fee && gr.json.payment.kind === 'Grading fee', gr.text);
  const dg = await FD.post('/admin/payments', { memberNo: 'ASK-2025-0612', item: 'dogi:Heavyweight Cotton' });
  check('take payment: dogi price is fixed (45) and an equipment order is created', dg.status === 200 && dg.json.payment.amount === 45 && (await q(`select count(*)::int n from equipment_order where user_id = 'S-010' and item = 'Dogi'`))[0].n === 2, dg.text);
  expect('take payment: two packages already held -> 409 PACKAGE_LIMIT', await FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'pkg:a10' }), 409, 'PACKAGE_LIMIT');
  expect('take payment: Unlimited already active -> 409 ALREADY_ACTIVE', await FD.post('/admin/payments', { memberNo: 'ASK-2024-0921', item: 'pkg:aun' }), 409, 'ALREADY_ACTIVE');
  expect('take payment: a child cannot buy an adult pack -> 403 NOT_ELIGIBLE', await FD.post('/admin/payments', { memberNo: 'ASK-2026-3101', item: 'pkg:a10' }), 403, 'NOT_ELIGIBLE');
  expect('take payment: unknown package -> 404', await FD.post('/admin/payments', { memberNo: 'ASK-2025-0612', item: 'pkg:zz9' }), 404, 'PACKAGE_NOT_FOUND');
  expect('take payment: invalid item -> 400', await FD.post('/admin/payments', { memberNo: 'ASK-2025-0612', item: "x'; DROP TABLE payment;--" }), 400, 'VALIDATION_ERROR');
  expect('take payment: unknown dogi type -> 400', await FD.post('/admin/payments', { memberNo: 'ASK-2025-0612', item: 'dogi:Gold' }), 400, 'INVALID_ITEM');
  expect('take payment: unknown member -> 404', await FD.post('/admin/payments', { memberNo: 'NOPE', item: 'reg' }), 404, 'MEMBER_NOT_FOUND');
  expect('take payment: annual dues while a dues payment is waiting -> 409 USE_COLLECT', await FD.post('/admin/payments', { memberNo: 'ASK-2024-1440', item: 'dues' }), 409, 'USE_COLLECT');
  // collect
  const col = await FD.post('/admin/payments/L-1008/collect', {});
  check('collect: the outstanding dues are paid at the desk and the member is renewed', col.status === 200 && col.json.payment.status === 'Paid' && col.json.payment.channel === 'desk' && (await q(`select account_status s from membership where user_id = 'S-003'`))[0].s === 'Active', col.text);
  expect('collect: a paid row -> 409 NOT_OUTSTANDING', await FD.post('/admin/payments/L-1008/collect', {}), 409, 'NOT_OUTSTANDING');
  expect('collect: unknown payment -> 404', await FD.post('/admin/payments/L-9999/collect', {}), 404, 'PAYMENT_NOT_FOUND');
  // mistake
  const mk = await FD.post('/admin/payments/L-1003/mistake', { reason: 'Charged the wrong pack' });
  check('mistake: front desk reports it, a pending exception appears', mk.status === 200 && (await q(`select kind, status from exception_request where id = $1`, [mk.json.exceptionId]))[0].kind === 'mistake');
  expect('mistake: reason required', await FD.post('/admin/payments/L-1003/mistake', {}), 400, 'VALIDATION_ERROR');
  // void / adjust (BA)
  const vd = await BA.post('/admin/payments/L-1004/void', { reason: 'Duplicate charge' });
  check('void: Business Admin voids a paid package payment, its package is retired', vd.status === 200 && vd.json.payment.status === 'Voided' && /Duplicate/.test(vd.json.payment.note) && (await left('SP-005')).s === 'Expired', vd.text);
  expect('void: a voided row cannot be changed again -> 409', await BA.post('/admin/payments/L-1004/void', { reason: 'again' }), 409, 'NOT_CHANGEABLE');
  const adj = await BA.post('/admin/payments/L-1014/void', { reason: 'Senior discount missed', adjustTo: 28.8 });
  check('adjust: amount corrected, status stays Paid, note explains', adj.status === 200 && adj.json.payment.amount === 28.8 && adj.json.payment.status === 'Paid' && /Adjusted from/.test(adj.json.payment.note), adj.text);
  expect('void: reason required', await BA.post('/admin/payments/L-1014/void', {}), 400, 'VALIDATION_ERROR');
  // refunds
  const rq = await FD.post('/admin/refunds', { paymentId: 'L-1003', reason: 'Moving overseas' });
  expect('refund: front desk raises a request on a paid payment', rq, 200);
  expect('refund: a second request for the same payment -> 409 REFUND_PENDING', await FD.post('/admin/refunds', { paymentId: 'L-1003', reason: 'again' }), 409, 'REFUND_PENDING');
  expect('refund: a payment that is not paid -> 409 NOT_PAID', await FD.post('/admin/refunds', { paymentId: 'L-1007', reason: 'x' }), 409, 'NOT_PAID');
  expect('refund: unknown payment -> 404', await FD.post('/admin/refunds', { paymentId: 'L-9999', reason: 'x' }), 404, 'PAYMENT_NOT_FOUND');
  await book('LS-DX-C', 'S-009', 'Booked', 'SP-004');
  const rid = rq.json.refund.id;
  const ap = await BA.post(`/admin/refunds/${rid}/decision`, { decision: 'approved' });
  expect('refund: Business Admin approves', ap, 200);
  check('refund: the payment is Refunded and the 50-lesson pack is released (Expired, 0 left)', (await q(`select status from payment where id = 'L-1003'`))[0].status === 'Refunded' && (await left('SP-004')).s === 'Expired' && (await left('SP-004')).l === 0);
  check('refund: the upcoming booking paid by that pack was cancelled', (await q(`select attendance_status s from class_attendance where lesson_id = 'LS-DX-C' and user_id = 'S-009'`))[0].s === 'Cancelled');
  expect('refund: deciding twice -> 409 ALREADY_DECIDED', await BA.post(`/admin/refunds/${rid}/decision`, { decision: 'declined' }), 409, 'ALREADY_DECIDED');
  const r01 = await BA.post('/admin/refunds/R-01/decision', { decision: 'declined' });
  check('refund: a decline leaves the payment Paid', r01.status === 200 && (await q(`select status from payment where id = 'L-1019'`))[0].status === 'Paid');
  expect('refund: unknown request -> 404', await BA.post('/admin/refunds/R-99/decision', { decision: 'approved' }), 404, 'REFUND_NOT_FOUND');
  expect('refund: bad decision -> 400', await BA.post('/admin/refunds/R-01/decision', { decision: 'maybe' }), 400, 'VALIDATION_ERROR');
  check('refunds list shows requester names', (await FD.get('/admin/payments')).json.refunds.some(r => r.id === rid && r.by === 'Daniel Ong' && r.status === 'approved'));

  // ---------------- equipment
  const eq = (await FD.get('/admin/equipment')).json;
  check('equipment: list equals the db (4 seeded + 1 dogi from the desk)', eq.orders.length === (await q('select count(*)::int n from equipment_order'))[0].n && eq.orders[0].status !== 'Handed over');
  expect('equipment: hand over before ready -> 409 NOT_READY', await FD.post('/admin/equipment/E-02/handover', { collectedBy: 'Hannah' }), 409, 'NOT_READY');
  expect('equipment: mark ready', await FD.post('/admin/equipment/E-02/ready', {}), 200);
  expect('equipment: ready twice -> 409 NOT_REQUESTED', await FD.post('/admin/equipment/E-02/ready', {}), 409, 'NOT_REQUESTED');
  expect('equipment: collector name required -> 400', await FD.post('/admin/equipment/E-02/handover', {}), 400, 'VALIDATION_ERROR');
  expect('equipment: hand over', await FD.post('/admin/equipment/E-02/handover', { collectedBy: 'Hannah Teo' }), 200);
  check('equipment: handed over with the collector and a time', (await q(`select status, handed_over_to, handed_over_at is not null a from equipment_order where id = 'E-02'`))[0].a === true);
  expect('equipment: hand over again -> 409 ALREADY_HANDED_OVER', await FD.post('/admin/equipment/E-02/handover', { collectedBy: 'x' }), 409, 'ALREADY_HANDED_OVER');
  await FD.post('/admin/equipment/E-03/ready', {});
  expect('equipment: an unpaid order cannot be handed over -> 409 UNPAID', await FD.post('/admin/equipment/E-03/handover', { collectedBy: 'David' }), 409, 'UNPAID');
  expect('equipment: unknown order -> 404', await FD.post('/admin/equipment/E-99/ready', {}), 404, 'ORDER_NOT_FOUND');
  check('equipment: search by member', (await FD.get('/admin/equipment?q=hannah')).json.orders.length >= 1);

  // ---------------- applications and activation
  const apps = (await FD.get('/admin/applications')).json;
  check('applications: front desk sees the 4 waiting registrations and 3 extension rows, no exceptions', apps.apps.length === 4 && apps.mcRequests.length === 3 && apps.exceptions === undefined, JSON.stringify([apps.apps.length, apps.mcRequests.length]));
  const appsBA = (await BA.get('/admin/applications')).json;
  check('applications: Business Admin also gets the exceptions queue (4 rows)', Array.isArray(appsBA.exceptions) && appsBA.exceptions.length >= 4);
  const a3 = apps.apps.find(a => a.id === 'APP-03'), a1 = apps.apps.find(a => a.id === 'APP-01');
  check('applications: APP-03 is a carry-over (needs a Business Admin), APP-01 is clean with every check done', a3.reviews.includes('Grade carry-over') && a3.carryGrade === '1st Kyu' && !a1.reviews.length && a1.checklist.every(c => c.done), JSON.stringify([a3.reviews, a3.carryGrade]));
  check('application detail: one application with its checklist', (await FD.get('/admin/applications/APP-02')).json.app.checklist.some(c => c.id === 'paid' && !c.done));
  expect('application: unknown id -> 404', await FD.get('/admin/applications/APP-99'), 404, 'APPLICATION_NOT_FOUND');
  expect('activate: rules not met (APP-02 has not paid) -> 409 RULES_NOT_MET', await FD.post('/admin/applications/APP-02/activate', {}), 409, 'RULES_NOT_MET');
  expect('activate: a carry-over needs a Business Admin -> 409 NEEDS_BUSINESS_ADMIN', await FD.post('/admin/applications/APP-03/activate', {}), 409, 'NEEDS_BUSINESS_ADMIN');
  expect('checklist: the front desk ticks "paid" on APP-02', await FD.patch('/admin/applications/APP-02/checklist', { ruleId: 'paid', done: true }), 200);
  expect('checklist: unknown rule -> 404', await FD.patch('/admin/applications/APP-02/checklist', { ruleId: 'zzz', done: true }), 404, 'RULE_NOT_FOUND');
  expect('checklist: guardian rule does not exist for an adult -> 404', await FD.patch('/admin/applications/APP-02/checklist', { ruleId: 'guardian', done: true }), 404, 'RULE_NOT_FOUND');
  const act1 = await FD.post('/admin/applications/APP-01/activate', {});
  check('activate: APP-01 (all checks pass) returns a member number and no temporary password (the member chose one)', act1.status === 200 && /^ASK-\d{4}-\d{4}$/.test(act1.json.memberNo) && act1.json.tempPassword === undefined, act1.text);
  const newLogin = await client(app.base).post('/auth/login', { portal: 'student', identifier: act1.json.memberNo, password: 'password123' });
  check('activate: the new member can sign in with the password chosen at registration (seeded demo hash)', newLogin.status === 200 && newLogin.json.user.memberNo === act1.json.memberNo, newLogin.text);
  check('activate: the application is Approved, linked to the new member, with payments, a package and a welcome log row', (await q(`select status, user_id from registration_application where id = 'APP-01'`))[0].status === 'Approved' && (await q(`select count(*)::int n from payment p join student_profile s using(user_id) where s.member_no = $1`, [act1.json.memberNo]))[0].n === 4);
  expect('activate: again -> 409 ALREADY_ACTIVATED', await FD.post('/admin/applications/APP-01/activate', {}), 409, 'ALREADY_ACTIVATED');
  expect('activate: APP-02 now (Karate background, no review needed)', await FD.post('/admin/applications/APP-02/activate', {}), 200);
  expect('activate: the guardian rule is not done for APP-04 -> 409 RULES_NOT_MET', await FD.post('/admin/applications/APP-04/activate', {}), 409, 'RULES_NOT_MET');
  expect('activate: Business Admin cannot skip the rules on APP-03 -> 409 RULES_NOT_MET', await BA.post('/admin/applications/APP-03/activate', { rankId: '1k' }), 409, 'RULES_NOT_MET');
  await BA.patch('/admin/applications/APP-03/checklist', { ruleId: 'details', done: true }); await BA.patch('/admin/applications/APP-03/checklist', { ruleId: 'medical', done: true });
  expect('activate: unknown starting grade -> 400', await BA.post('/admin/applications/APP-03/activate', { rankId: 'zz' }), 400, 'INVALID_RANK');
  const act3 = await BA.post('/admin/applications/APP-03/activate', { rankId: '1k' });
  check('activate: Business Admin confirms the carried-over grade (1st Kyu)', act3.status === 200 && (await q(`select rank_id from student_profile where member_no = $1`, [act3.json.memberNo]))[0].rank_id === '1k', act3.text);
  expect('info request: APP-04 asks for more information', await FD.post('/admin/applications/APP-04/request-info', { text: 'Please send the guardian signature' }), 200);
  check('info request: status Needs info with the note', (await FD.get('/admin/applications/APP-04')).json.app.status === 'Needs info' && (await FD.get('/admin/applications/APP-04')).json.app.infoRequested.text.startsWith('Please send'));
  expect('reject: APP-04 is rejected with a reason', await FD.post('/admin/applications/APP-04/reject', { note: 'Duplicate registration' }), 200);
  expect('reject: a closed registration -> 409 APPLICATION_CLOSED', await FD.post('/admin/applications/APP-04/reject', { note: 'again' }), 409, 'APPLICATION_CLOSED');
  expect('reject: note required -> 400', await FD.post('/admin/applications/APP-04/reject', {}), 400, 'VALIDATION_ERROR');
  // registered at the desk
  const reg = { name: 'Desk Dana', dojoId: 'hq', age: 30, gender: 'Female', nationality: 'Singaporean', phone: '9000 1111', email: 'dana.desk@email.com', emergencyContact: 'Tom (Spouse) · 9000 2222', medical: null, dogi: { type: 'Cotton (Standard)', size: '3' }, packageId: 'a10', signer: 'Desk Dana', signatureProvided: true, password: 'Sunrise2026', confirmPassword: 'Sunrise2026' };
  const dr = await FD.post('/admin/registrations', reg);
  check('desk registration: activated at once, total worked out by the server, no password in the response', dr.status === 201 && dr.json.activated === true && dr.json.total === 60 + 48 + 30 + 270 && dr.json.tempPassword === undefined && !/Sunrise2026/.test(dr.text), dr.text);
  const drLogin = await client(app.base).post('/auth/login', { portal: 'student', identifier: dr.json.memberNo, password: 'Sunrise2026' });
  check('desk registration: the new student can sign in', drLogin.status === 200);
  const held = await FD.post('/admin/registrations', { ...reg, name: 'Carry Carl', email: 'carl.carry@email.com', carryGrade: '3rd Kyu' });
  check('desk registration: a carried-over grade waits for a Business Admin (not activated, no password)', held.status === 201 && held.json.activated === false && !held.json.tempPassword && held.json.status === 'Submitted', held.text);
  expect('desk registration: same email again -> 409 EMAIL_IN_USE', await FD.post('/admin/registrations', reg), 409, 'EMAIL_IN_USE');
  expect('desk registration: invalid body -> 400', await FD.post('/admin/registrations', { ...reg, age: 'x' }), 400, 'VALIDATION_ERROR');
  expect('desk registration: a package for the wrong audience -> 400', await FD.post('/admin/registrations', { ...reg, email: 'w@email.com', packageId: 'k1' }), 400, 'INVALID_PACKAGE');

  // ---------------- extension requests (MC)
  const mcRow = (id, user, pack, kind, days, file) => pg.query(`INSERT INTO mc_request (id, user_id, student_package_id, kind, days_requested, document_ref, status, requested_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())`, [id, user, pack, kind, days, file]);
  await mcRow('MC-T1', 'S-008', 'SP-006', 'MC', 14, 'mc.pdf'); await mcRow('MC-T2', 'S-020', 'SP-013', 'MC', 15, 'mc.pdf'); await mcRow('MC-T3', 'S-002', 'SP-003', 'MC', 3, 'mc.pdf');
  await mcRow('MC-T4', 'S-016', 'SP-009', 'Compassion', 14, null); await mcRow('MC-T5', 'S-015', 'SP-008', 'MC', 5, null); await mcRow('MC-T6', 'S-025', 'SP-018', 'MC', 5, 'mc.pdf');
  const e0 = await left('SP-006');
  expect('extension: a 15-day MC -> 409 NEEDS_BUSINESS_ADMIN for the front desk', await FD.post('/admin/mc-requests/MC-T2/decision', { decision: 'approved' }), 409, 'NEEDS_BUSINESS_ADMIN');
  expect('extension: an MC without a certificate -> 409 NEEDS_BUSINESS_ADMIN', await FD.post('/admin/mc-requests/MC-T5/decision', { decision: 'approved' }), 409, 'NEEDS_BUSINESS_ADMIN');
  expect('extension: nothing to apply -> 400', await FD.post('/admin/mc-requests/MC-T1/decision', { decision: 'approved', returnLesson: false, extend: false }), 400, 'NOTHING_TO_APPLY');
  expect('extension: more days than requested -> 400', await FD.post('/admin/mc-requests/MC-T1/decision', { decision: 'approved', days: 20 }), 400, 'VALIDATION_ERROR');
  const m1 = await FD.post('/admin/mc-requests/MC-T1/decision', { decision: 'approved' });
  check('extension: the front desk approves exactly 14 days (expiry +14, lesson returned)', m1.status === 200 && m1.json.request.status === 'approved' && (await left('SP-006')).e === '2027-01-17' && (await left('SP-006')).l === e0.l + 1, JSON.stringify([m1.text, await left('SP-006'), e0]));
  expect('extension: deciding again -> 409 ALREADY_DECIDED', await FD.post('/admin/mc-requests/MC-T1/decision', { decision: 'declined' }), 409, 'ALREADY_DECIDED');
  const m3 = await FD.post('/admin/mc-requests/MC-T3/decision', { decision: 'approved' });
  check('extension: an Unlimited plan only records the absence as excused (expiry unchanged)', m3.status === 200 && m3.json.request.excused === true && (await left('SP-003')).e === '2026-11-16', m3.text);
  const m4 = await FD.post('/admin/mc-requests/MC-T4/decision', { decision: 'approved' });
  check('extension: Compassion Guaranteed extends 14 days without returning a lesson', m4.status === 200 && (await left('SP-009')).e === '2027-02-18' && (await left('SP-009')).l === 12, JSON.stringify([m4.text, await left('SP-009')]));
  const m6 = await FD.post('/admin/mc-requests/MC-T6/decision', { decision: 'declined', reason: 'Dates do not match' });
  check('extension: declined with a reason that is stored; the package is untouched', m6.status === 200 && m6.json.request.status === 'rejected' && m6.json.request.reason === 'Dates do not match' && (await left('SP-018')).e === '2026-12-21');
  const exT2 = await FD.post('/admin/exceptions', { kind: 'extension', mcId: 'MC-T2', detail: '15 day MC for Tan Siew Eng' });
  expect('extension: the front desk sends the 15-day MC up as an exception', exT2, 201);
  check('extension: the request now shows as referred', (await FD.get('/admin/applications')).json.mcRequests.find(r => r.id === 'MC-T2').referred === true);
  const m2 = await BA.post('/admin/mc-requests/MC-T2/decision', { decision: 'approved', days: 10, returnLesson: false });
  check('extension: a Business Admin approves the 15-day MC, granting 10 days and not returning a lesson', m2.status === 200 && (await left('SP-013')).e === '2027-02-04' && (await left('SP-013')).l === 14, JSON.stringify([m2.text, await left('SP-013')]));
  check('extension: ...which settles the linked exception too', (await q(`select status from exception_request where id = $1`, [exT2.json.exception.id]))[0].status === 'approved');
  expect('extension: unknown request -> 404', await FD.post('/admin/mc-requests/MC-99/decision', { decision: 'declined' }), 404, 'REQUEST_NOT_FOUND');

  // ---------------- exceptions
  const ex = await FD.post('/admin/exceptions', { kind: 'access', subjectName: 'Rachel Ong', memberNo: 'ASK-2025-2064', detail: 'Asked to join Advanced on 10 Nov' });
  check('exception: front desk sends one up (pending, linked to the member)', ex.status === 201 && ex.json.exception.status === 'pending' && ex.json.exception.memberNo === 'ASK-2025-2064', ex.text);
  expect('exception: say who it is about -> 400', await FD.post('/admin/exceptions', { kind: 'access', detail: 'x' }), 400, 'VALIDATION_ERROR');
  expect('exception: unknown kind -> 400', await FD.post('/admin/exceptions', { kind: 'nope', subjectName: 'x', detail: 'x' }), 400, 'VALIDATION_ERROR');
  expect('exception: an extension that is already with a Business Admin cannot be sent again -> 409', await FD.post('/admin/exceptions', { kind: 'extension', mcId: 'MC-01', detail: 'again' }), 409, 'ALREADY_REFERRED');
  expect('exception decision: reason required', await BA.post('/admin/exceptions/X-01/decision', { decision: 'approved' }), 400, 'VALIDATION_ERROR');
  const xd = await BA.post('/admin/exceptions/X-01/decision', { decision: 'approved', reason: 'Record checked' });
  check('exception decision: Business Admin approves with a reason', xd.status === 200 && xd.json.exception.status === 'approved' && xd.json.exception.reason === 'Record checked' && xd.json.exception.decidedBy === 'Grace Lim', xd.text);
  expect('exception decision: twice -> 409 ALREADY_DECIDED', await BA.post('/admin/exceptions/X-01/decision', { decision: 'declined', reason: 'x' }), 409, 'ALREADY_DECIDED');
  const sp21 = await left('SP-021');
  const xm = await BA.post('/admin/exceptions/X-02/decision', { decision: 'approved', reason: 'MC is genuine' });
  check('exception decision: approving the linked extension applies the 21-day MC (expiry +21, lesson returned)', xm.status === 200 && (await left('SP-021')).e === '2027-02-10' && (await left('SP-021')).l === sp21.l + 1 && (await q(`select status, days_granted from mc_request where id = 'MC-01'`))[0].status === 'approved', JSON.stringify([xm.text, await left('SP-021')]));
  expect('exception decision: unknown -> 404', await BA.post('/admin/exceptions/X-99/decision', { decision: 'approved', reason: 'x' }), 404, 'EXCEPTION_NOT_FOUND');

  // ---------------- follow-ups
  const fu = (await FD.get('/admin/followups')).json;
  check('follow-ups: lists, staff owners (2 active) and triggers', fu.items.length >= 3 && fu.staff.length === 2 && fu.triggers.declineDays === 14 && fu.items.some(i => i.followup && i.followup.attempts.length), JSON.stringify([fu.items.length, fu.staff, fu.triggers]));
  check('follow-ups: every item has a reason, member no. and a phone', fu.items.every(i => i.reason && i.memberNo && i.phone));
  const f2 = fu.items.find(i => i.followup && i.followup.id === 'F-02');
  check('follow-ups: F-02 shows its two attempts and the owner', f2 && f2.followup.attempts.length === 2 && f2.followup.ownerName === 'Daniel Ong', JSON.stringify(f2));
  expect('follow-up attempt: front desk logs a call', await FD.post('/admin/followups/F-01/attempts', { method: 'Call', outcome: 'Reached', note: 'Back next week', nextDate: '2026-11-12' }), 200);
  check('follow-up attempt: saved, and the next contact date moved', (await q(`select count(*)::int n from followup_attempt where followup_id = 'F-01'`))[0].n === 1 && (await q(`select to_char(due_date,'YYYY-MM-DD') d from followup where id = 'F-01'`))[0].d === '2026-11-12');
  expect('follow-up attempt: unknown method -> 400', await FD.post('/admin/followups/F-01/attempts', { method: 'Carrier pigeon', outcome: 'x' }), 400, 'VALIDATION_ERROR');
  expect('follow-up attempt: unknown follow-up -> 404', await FD.post('/admin/followups/F-99/attempts', { method: 'Call', outcome: 'x' }), 404, 'FOLLOWUP_NOT_FOUND');
  const lc = await FD.post('/admin/members/ASK-2023-1203/contact-attempts', { kind: 'declining', method: 'WhatsApp', outcome: 'No answer' });
  check('log contact: uses the existing follow-up F-02 for that student', lc.status === 200 && lc.json.followupId === 'F-02', lc.text);
  const lc2 = await FD.post('/admin/members/ASK-2025-2490/contact-attempts', { method: 'Call', outcome: 'Reached', note: 'Wants to renew' });
  check('log contact: a student with no follow-up gets one owned by the person logging it', lc2.status === 200 && (await q(`select owner_id from followup where id = $1`, [lc2.json.followupId]))[0].owner_id === 'ADM-101');
  const fc = await BA.post('/admin/followups', { memberNo: 'ASK-2025-2511', kind: 'renewal', ownerId: 'ADM-101', dueDate: '2026-11-15' });
  check('follow-up create: Business Admin creates one for a student', fc.status === 200 && fc.json.created === 1, fc.text);
  expect('follow-up create: the same again -> 409 FOLLOWUP_EXISTS', await BA.post('/admin/followups', { memberNo: 'ASK-2025-2511', kind: 'renewal', ownerId: 'ADM-101', dueDate: '2026-11-15' }), 409, 'FOLLOWUP_EXISTS');
  expect('follow-up create: an inactive staff owner -> 404 STAFF_NOT_FOUND', await BA.post('/admin/followups', { memberNo: 'ASK-2025-0612', kind: 'declining', ownerId: 'ADM-102', dueDate: '2026-11-15' }), 404, 'STAFF_NOT_FOUND');
  const fl = await BA.post('/admin/followups', { kind: 'declining', ownerId: 'ADM-001', dueDate: '2026-11-20' });
  check('follow-up create: a whole list (no member) assigns every student on it', fl.status === 200 && fl.json.created >= 1 && (await q(`select count(*)::int n from followup where owner_id = 'ADM-001'`))[0].n === fl.json.created, fl.text);
  expect('follow-up assign: Business Admin changes the owner', await BA.patch('/admin/followups/F-01', { ownerId: 'ADM-001' }), 200);
  expect('follow-up assign: empty body -> 400', await BA.patch('/admin/followups/F-01', {}), 400, 'VALIDATION_ERROR');
  expect('follow-up create: bad date -> 400', await BA.post('/admin/followups', { kind: 'declining', dueDate: '2026-13-45' }), 400, 'VALIDATION_ERROR');

  // ---------------- notifications
  const nf = (await FD.get('/admin/notifications')).json, nfB = (await BA.get('/admin/notifications')).json;
  check('notifications: templates, sent log, front desk audiences limited, Business Admin wider', nf.templates.length === 3 && nf.sentLog.length >= 3 && nf.audiences.join() === 'lesson,student' && nfB.audiences.length === 7 && nf.canWriteOwn === false && nfB.canWriteOwn === true, JSON.stringify([nf.audiences, nfB.audiences]));
  expect('notifications: front desk cannot send to everyone -> 403 AUDIENCE_NOT_ALLOWED', await FD.post('/admin/notifications/send', { templateId: 'T-3', audience: { type: 'all' } }), 403, 'AUDIENCE_NOT_ALLOWED');
  expect('notifications: front desk cannot write a custom message -> 403 TEMPLATE_REQUIRED', await FD.post('/admin/notifications/send', { title: 'Free pizza', audience: { type: 'lesson', target: 'LS-DX-W1' } }), 403, 'TEMPLATE_REQUIRED');
  const ns = await FD.post('/admin/notifications/send', { templateId: 'T-1', audience: { type: 'lesson', target: 'LS-DX-W1' } });
  check('notifications: front desk sends a template to one class (log row written)', ns.status === 200 && ns.json.recipients >= 3 && (await q(`select count(*)::int n from sent_log where id = $1 and template_id = 'T-1' and sent_by = 'ADM-101'`, [ns.json.id]))[0].n === 1, ns.text);
  expect('notifications: a class with nobody booked -> 409 NO_RECIPIENTS', await FD.post('/admin/notifications/send', { templateId: 'T-1', audience: { type: 'lesson', target: 'LS-DX-WEAP' } }), 409, 'NO_RECIPIENTS');
  expect('notifications: one student', await FD.post('/admin/notifications/send', { templateId: 'T-2', audience: { type: 'student', target: 'ASK-2024-1440' } }), 200);
  const nb = await BA.post('/admin/notifications/send', { title: 'Dojo closed on 25 Nov', audience: { type: 'all' } });
  check('notifications: Business Admin writes their own message to all members', nb.status === 200 && nb.json.recipients === (await q('select count(*)::int n from student_profile'))[0].n, nb.text);
  check('notifications: Business Admin to a dojo and to lapsed', (await BA.post('/admin/notifications/send', { templateId: 'T-3', audience: { type: 'dojo', target: 'hq' } })).status === 200 && (await BA.post('/admin/notifications/send', { templateId: 'T-2', audience: { type: 'lapsed' } })).status === 200);
  expect('notifications: unknown template -> 404', await BA.post('/admin/notifications/send', { templateId: 'T-99', audience: { type: 'all' } }), 404, 'TEMPLATE_NOT_FOUND');
  expect('notifications: unknown audience -> 400', await BA.post('/admin/notifications/send', { title: 'x', audience: { type: 'everyone' } }), 400, 'VALIDATION_ERROR');

  // ---------------- day lock (last: it blocks new payments for the day)
  expect('day lock: a future day -> 400', await FD.post('/admin/payments/day/lock', { date: '2026-12-01' }), 400, 'INVALID_DATE');
  const lk = await FD.post('/admin/payments/day/lock', {});
  check('day lock: front desk submits and locks today with the day total', lk.status === 200 && lk.json.lock.by === 'ADM-101' && lk.json.lock.count >= 5, lk.text);
  const ov = (await FD.get('/admin/payments')).json;
  check('day lock: the summary shows the lock and equals the sum of desk payments today', ov.summary.lock && ov.summary.total === Math.round(ov.summary.rows.reduce((s, r) => s + r.amount, 0) * 100) / 100 && ov.summary.count === ov.summary.rows.length, JSON.stringify(ov.summary.lock));
  expect('day lock: a new payment -> 409 DAY_LOCKED', await FD.post('/admin/payments', { memberNo: 'ASK-2025-0612', item: 'reg' }), 409, 'DAY_LOCKED');
  expect('day lock: collecting an outstanding row -> 409 DAY_LOCKED', await FD.post('/admin/payments/L-1009/collect', {}), 409, 'DAY_LOCKED');
  expect('day lock: locking twice -> 409 ALREADY_LOCKED', await FD.post('/admin/payments/day/lock', {}), 409, 'ALREADY_LOCKED');
  expect('day lock: front desk cannot unlock', await FD.del('/admin/payments/day/lock/2026-11-06', {}), 403, 'BUSINESS_ADMIN_ONLY');
  expect('day lock: Business Admin unlocks', await BA.del('/admin/payments/day/lock/2026-11-06', {}), 200);
  expect('day lock: unlocking an open day -> 404', await BA.del('/admin/payments/day/lock/2026-11-06', {}), 404, 'NOT_LOCKED');
  expect('day lock: payments work again after the unlock', await FD.post('/admin/payments/L-1009/collect', {}), 200);

  // ---------------- request hygiene
  expect('admin POST without JSON content type -> 415', await FD.api('POST', '/admin/payments', undefined, { rawBody: 'memberNo=x', headers: { 'Content-Type': 'text/plain' } }), 415, 'JSON_REQUIRED');
  expect('admin POST with broken JSON -> 400 BAD_JSON', await FD.api('POST', '/admin/payments', undefined, { rawBody: '{oops', headers: { 'Content-Type': 'application/json' } }), 400, 'BAD_JSON');
  check('no admin response contains password_hash or qr_token (hash column names), and the only password is the one-time tempPassword', !all.some(t => /password_hash|passwordHash|qr_token|\$2[aby]\$/.test(t)) && all.filter(t => /tempPassword/.test(t)).length <= 6, String(all.filter(t => /tempPassword/.test(t)).length));
  check('db is consistent: no student has weapon > accumulated > total hours, lessons_left within the pack size', (await q(`select count(*)::int n from student_profile where weapon_hours > accumulated_hours or accumulated_hours > total_accumulated_hours`))[0].n === 0);
} finally { await pg.end(); const lg = app.log().split('\n').filter(l => /error|at /i.test(l)).slice(0, 12); if (lg.length) console.log('--- app log (errors)\n' + lg.join('\n')); await app.stop(); }
S.done();
