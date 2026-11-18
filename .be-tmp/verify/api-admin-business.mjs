// Business Admin endpoints: access matrix (compared with portal.js ADMIN_PAGES), aggregates against direct SQL, staff rules, timetable CRUD and clashes,
// closures, policies, imports, grading approvals and promotions, CSV, SQL injection strings. Spawns its own app (date pinned to 2026-11-06).
import fs from 'node:fs';
import path from 'node:path';
import { spawnApp, resetDb, client, login, pgConnect, suite, ACCOUNTS, ROOT } from './lib.mjs';
import { SQLI } from './api-sqli.mjs';
await resetDb();
const app = await spawnApp();
const S = suite('api-admin-business');
const { check, expect } = S;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const one = async (sql, p = []) => (await q(sql, p))[0];
const bodies = [];   // every BA response body, scanned at the end for secrets
const wrap = c => { const api = c.api; c.api = async (...a) => { const r = await api(...a); if (String(a[1]).startsWith('/admin')) bodies.push(r.text); return r; };
  for (const m of ['get', 'post', 'put', 'patch', 'del']) { const key = m === 'del' ? 'DELETE' : m.toUpperCase(); c[m] = (p, b, o) => c.api(key, p, key === 'GET' ? undefined : b, o); } return c; };
const near = (a, b) => Math.abs(a - b) < 0.005;
try {
  const anon = client(app.base);
  const FD = wrap(await login(app.base, ...ACCOUNTS.frontdesk)), BA = wrap(await login(app.base, ...ACCOUNTS.business));
  const ST = await login(app.base, ...ACCOUNTS.student), INS = await login(app.base, ...ACCOUNTS.instructor);
  check('ADM-101 signs in as front desk, ADM-001 as Business Admin', FD.loginResult.json.user.adminType === 'frontdesk' && BA.loginResult.json.user.adminType === 'business');

  // ---------------- fixtures
  const lervynPacks = await q(`select id, lessons_left from student_package where user_id = 'S-001' and status = 'Active' order by expires_at, id`);
  const PK = lervynPacks[0].id;
  const left = async id => Number((await one(`select lessons_left l from student_package where id = $1`, [id])).l);
  const lesson = (id, day, start, end, type = 'Adults', status = 'Scheduled', dojo = 'hq', mat = 'Mat C') => pg.query(
    `INSERT INTO class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'INS-0042', 20, $8)`, [id, dojo, day, start, end, mat, type, status]);
  const bookLervyn = async lessonId => { await pg.query(`INSERT INTO class_attendance (lesson_id, user_id, attendance_status, student_package_id, booked_via) VALUES ($1, 'S-001', 'Booked', $2, 'online')`, [lessonId, PK]); await pg.query(`UPDATE student_package SET lessons_left = lessons_left - 1 WHERE id = $1`, [PK]); };

  // ---------------- access matrix: every route, 401 / 403 / 200, compared with ADMIN_PAGES in portal.js
  const routes = [
    ['GET', '/admin/overview'], ['GET', '/admin/insights'], ['POST', '/admin/insights/interventions', { name: 'x', slot: 'y', before: 1, after: 2, decision: 'continue' }],
    ['PATCH', '/admin/insights/interventions/N-01', { decision: 'stop' }], ['GET', '/admin/revenue'], ['GET', '/admin/reports'], ['GET', '/admin/reports/payments.csv'],
    ['GET', '/admin/policies'], ['PATCH', '/admin/policies', { cancel_hours: 4 }], ['PATCH', '/admin/policies/packages/a10', { price: 270 }], ['PATCH', '/admin/policies/auto-activation/paid', { enabled: true }],
    ['POST', '/admin/policies/templates', { name: 'x', text: 'y' }], ['PATCH', '/admin/policies/templates/T-1', { name: 'Class cancelled' }], ['DELETE', '/admin/policies/templates/T-9', {}],
    ['GET', '/admin/staff'], ['POST', '/admin/staff', { name: 'Zed', type: 'frontdesk', email: 'zed@example.com' }], ['PATCH', '/admin/staff/ADM-101', { status: 'active' }], ['POST', '/admin/staff/ADM-101/reset-password', {}],
    ['GET', '/admin/timetable'], ['POST', '/admin/timetable', { dojoId: 'hq', weekday: 0, start: '19:00', mat: 'Mat A', type: 'Adults', instructorId: 'INS-0042', capacity: 10 }],
    ['PATCH', '/admin/timetable/CT-02', { dojoId: 'hq', weekday: 0, start: '19:00', mat: 'Mat A', type: 'Adults', instructorId: 'INS-0042', capacity: 20 }], ['DELETE', '/admin/timetable/CT-99', {}],
    ['GET', '/admin/closures'], ['GET', '/admin/closures/preview?dojoId=hq&from=2026-12-01'], ['POST', '/admin/closures', { dojoId: 'hq', from: '2026-12-01' }], ['DELETE', '/admin/closures/CL-99', {}],
    ['POST', '/admin/classes/LS-NOPE/cancel', {}], ['GET', '/admin/imports'], ['PATCH', '/admin/imports/I-01', { status: 'dismissed' }],
    ['GET', '/admin/grading'], ['POST', '/admin/grading/applications/GA-12/decision', { decision: 'approved' }], ['POST', '/admin/grading/candidates/GR-20260927/S-010/promotion', { decision: 'decline' }]
  ];
  for (const [m, p, b] of routes) {
    const a = await client(app.base).api(m, p, b);
    check(`${m} ${p}: no cookie -> 401`, a.status === 401, `${a.status}`);
    expect(`${m} ${p}: front desk -> 403 BUSINESS_ADMIN_ONLY`, await FD.api(m, p, b), 403, 'BUSINESS_ADMIN_ONLY');
    expect(`${m} ${p}: student -> 403 WRONG_ROLE`, await ST.api(m, p, b), 403, 'WRONG_ROLE');
    expect(`${m} ${p}: instructor -> 403 WRONG_ROLE`, await INS.api(m, p, b), 403, 'WRONG_ROLE');
    if (m === 'GET') { const r = await BA.api(m, p); check(`${m} ${p}: Business Admin -> 200`, r.status === 200, `${r.status} ${r.text.slice(0, 120)}`); }
  }
  const portalJs = fs.readFileSync(path.join(ROOT, 'src', 'public', 'js', 'portal.js'), 'utf8');
  const block = portalJs.slice(portalJs.indexOf('const ADMIN_PAGES'), portalJs.indexOf('/* pages with no menu item'));
  const pages = [...block.matchAll(/\['(\w+)', '\w+', '[^']+', '[^']+', (true|false)\]/g)].map(m => [m[1], m[2] === 'true']);
  const loadOf = { dashboard: '/admin/today', sessions: '/admin/rosters?date=2026-11-06', members: '/admin/members', payments: '/admin/payments', applications: '/admin/applications', equipment: '/admin/equipment',
    followups: '/admin/followups', notify: '/admin/notifications', insights: '/admin/insights', revenue: '/admin/revenue', grading: '/admin/grading', reports: '/admin/reports', policies: '/admin/policies', staff: '/admin/staff', audit: '/admin/audit', imports: '/admin/imports' };
  check(`ADMIN_PAGES has ${pages.length} pages and every one has a load endpoint in this matrix`, pages.length === 16 && pages.every(([k]) => loadOf[k]), pages.map(p => p[0]).join(','));
  for (const [key, baOnly] of pages) {
    const f = await FD.get(loadOf[key]), b = await BA.get(loadOf[key]);
    check(`page ${key} (ADMIN_PAGES flag ${baOnly}): Business Admin 200, front desk ${baOnly ? '403' : '200'}`, b.status === 200 && f.status === (baOnly ? 403 : 200), `${b.status}/${f.status}`);
  }

  // ---------------- aggregates equal direct SQL (the seed)
  const ov = (await BA.get('/admin/overview?period=month')).json;
  const sql = await one(`select (select count(*) from membership where account_status = 'Active')::int active, (select count(*) from student_profile)::int total,
      (select coalesce(sum(amount), 0) from payment where status = 'Paid' and (paid_at at time zone 'Asia/Singapore')::date between '2026-11-01' and '2026-11-06')::float collected,
      (select coalesce(sum(amount), 0) from payment where status = 'Outstanding')::float owed, (select count(*) from exception_request where status = 'pending')::int exc,
      (select count(*) from payment where status = 'Failed')::int failed, (select count(*) from import_issue where status = 'open')::int imp,
      (select count(*) from grading_candidate where promotion_status = 'Pending approval')::int promo, (select count(*) from student_profile where joined_on >= '2026-11-01')::int fresh`);
  check('overview: active members, total members and new members equal SELECT counts', ov.stats.activeMembers === sql.active && ov.stats.totalMembers === sql.total && ov.stats.newMembers === sql.fresh, JSON.stringify(ov.stats));
  check('overview: collected and outstanding equal SELECT sums', near(ov.stats.collected, sql.collected) && near(ov.stats.outstanding, sql.owed), `${ov.stats.collected}/${sql.collected} ${ov.stats.outstanding}/${sql.owed}`);
  check('overview: waiting counts (exceptions, failed, imports, promotions) equal SELECT counts', ov.waiting.exceptions === sql.exc && ov.waiting.failedPayments === sql.failed && ov.waiting.imports === sql.imp && ov.waiting.promotions === sql.promo);
  const hq = ov.centres.find(c => c.id === 'hq'), occ = await one(`select (sum((select count(*) from class_attendance a where a.lesson_id = s.lesson_id and a.attendance_status in ('Booked','Attended','No-Show'))))::float taken, sum(s.capacity)::float cap
      from class_session s join class_template t on t.id = s.template_id where s.dojo_id = 'hq' and not t.is_private and s.status <> 'Cancelled' and s.session_date between '2026-10-10' and '2026-11-06'`);
  check('overview: HQ occupancy over the last 4 weeks equals the SELECT ratio', hq && near(hq.occupancy, occ.taken / occ.cap) && hq.classes === 19, `${hq && hq.occupancy} vs ${occ.taken / occ.cap}`);
  const ins = (await BA.get('/admin/insights?period=3m&cmp=prev')).json;
  const insHq = ins.centres.find(c => c.id === 'hq'), occ3 = await one(`select (sum((select count(*) from class_attendance a where a.lesson_id = s.lesson_id and a.attendance_status in ('Booked','Attended','No-Show'))))::float taken, sum(s.capacity)::float cap
      from class_session s join class_template t on t.id = s.template_id where s.dojo_id = 'hq' and not t.is_private and s.status <> 'Cancelled' and s.session_date between '2026-08-07' and '2026-11-06'`);
  check('insights: HQ occupancy (3 months) equals the SELECT ratio and the slot rows add up to it', insHq && near(insHq.occupancy, occ3.taken / occ3.cap) && near(ins.slots.filter(s => s.dojoId === 'hq').reduce((a, s) => a + s.taken, 0) / ins.slots.filter(s => s.dojoId === 'hq').reduce((a, s) => a + s.offered, 0), occ3.taken / occ3.cap));
  check('insights: types, risk figures, cohorts and interventions are present', ins.types.includes('Adults') && typeof ins.risk.lapsed === 'number' && Array.isArray(ins.cohorts) && Array.isArray(ins.interventions) && ins.risk.lapsed === (await one(`select count(*)::int n from membership where account_status = 'Lapsed'`)).n);
  const insF = (await BA.get('/admin/insights?centre=hq&type=Adults&slot=eve&age=adult&belt=all&cmp=none')).json;
  check('insights: filters narrow the rows (HQ, Adults, evening)', insF.slots.length > 0 && insF.slots.every(s => s.dojoId === 'hq' && s.type === 'Adults' && Number(s.time.slice(0, 2)) >= 17) && insF.centres.every(c => c.delta === null));
  const rev = (await BA.get('/admin/revenue')).json;
  const rsql = await one(`select count(*)::int n, coalesce(sum(amount), 0)::float t from payment where status = 'Paid' and (paid_at at time zone 'Asia/Singapore')::date between '2026-11-01' and '2026-11-06'`);
  check('revenue: total and count equal the SELECT sum and count, and the item groups add up to the total', near(rev.total, rsql.t) && rev.count === rsql.n && near(rev.items.reduce((a, g) => a + g.amount, 0), rev.total), JSON.stringify(rev.items));
  check('revenue: outstanding, failed and pending refunds equal SELECT figures', near(rev.outstanding.amount, sql.owed) && rev.failed.count === sql.failed && rev.refunds.pending.count === (await one(`select count(*)::int n from refund_request where status = 'pending'`)).n);
  check('revenue: the unlimited plan is its own group (Unlimited plans)', rev.items.some(g => g.group === 'Unlimited plans'));
  const rep = (await BA.get('/admin/reports?from=2026-05-06&to=2026-11-06')).json;
  const cnt = await one(`select (select count(*) from class_session where session_date between '2026-05-06' and '2026-11-06')::int att, (select count(*) from student_profile)::int prog,
      (select count(*) from payment where (coalesce(paid_at, created_at) at time zone 'Asia/Singapore')::date between '2026-05-06' and '2026-11-06')::int pay,
      (select count(*) from followup_attempt where (attempted_at at time zone 'Asia/Singapore')::date between '2026-05-06' and '2026-11-06')::int fu`);
  check('reports: row counts equal SELECT counts', rep.counts.attendance === cnt.att && rep.counts.progression === cnt.prog && rep.counts.payments === cnt.pay && rep.counts.followups === cnt.fu, JSON.stringify(rep.counts));
  const rp = await BA.get('/admin/reports?kind=progression');
  check('reports?kind=progression: columns and one row per student', rp.status === 200 && rp.json.columns.length === 7 && rp.json.rows.length === cnt.prog);

  // ---------------- CSV
  const csv = await BA.get('/admin/reports/payments.csv?from=2026-05-06&to=2026-11-06');
  check('payments.csv: text/csv, attachment, header row and one line per payment', csv.status === 200 && /^text\/csv/.test(csv.headers.get('content-type')) && /attachment; filename="payments-nov-2026\.csv"/.test(csv.headers.get('content-disposition')) && csv.text.trim().split('\r\n').length === cnt.pay + 1, `${csv.headers.get('content-type')} ${csv.headers.get('content-disposition')}`);
  await pg.query(`UPDATE student_profile SET full_name = '=HYPERLINK("http://evil")' WHERE user_id = 'S-001'`);
  const inj = await BA.get('/admin/reports/progression.csv');
  check('CSV injection guard: a name that starts with = is written as \'=...', inj.text.includes(`"'=HYPERLINK(""http://evil"")"`) && !/(^|,)"=HYPERLINK/m.test(inj.text), inj.text.split('\r\n').find(l => /HYPERLINK/.test(l)));
  await pg.query(`UPDATE student_profile SET full_name = 'Lervyn Wong' WHERE user_id = 'S-001'`);
  expect('reports: unknown kind -> 400', await BA.get('/admin/reports/nope.csv'), 400);
  expect('reports: unknown centre -> 404 INVALID_DOJO', await BA.get('/admin/reports/payments.csv?centre=nowhere'), 404, 'INVALID_DOJO');
  expect('reports: a range over a year -> 400', await BA.get('/admin/reports/payments.csv?from=2024-01-01&to=2026-11-06'), 400, 'INVALID_RANGE');

  // ---------------- policies
  const pol = (await BA.get('/admin/policies?declineDays=21')).json;
  check('policies: values equal the policy_setting rows, packages and auto-activation rules are listed', pol.registration === 60 && pol.annualDues === 48 && pol.booking.cancelHours === 4 && pol.followTriggers.declineDays === 14 && pol.packages.length === 7 && pol.autoActivation.length === 5 && pol.templates.length === 3 && pol.impact.decliningNow >= 0);
  expect('policies: edit annual dues', await BA.patch('/admin/policies', { annual_dues: 50 }), 200);
  check('policies: the edit is stored and shown again', (await one(`select value_text v from policy_setting where setting_key = 'annual_dues'`)).v === '50' && (await BA.get('/admin/policies')).json.annualDues === 50);
  expect('policies: unknown key is refused (whitelist)', await BA.patch('/admin/policies', { setting_key: 'x' }), 400);
  expect('policies: a key that is not editable (payment_methods) is refused', await BA.patch('/admin/policies', { payment_methods: 'Cash' }), 400);
  expect('policies: out of range value -> 400', await BA.patch('/admin/policies', { cancel_hours: 500 }), 400);
  expect('policies: wrong type -> 400', await BA.patch('/admin/policies', { annual_dues: 'free' }), 400);
  expect('policies: the student discount age range the wrong way round -> 400', await BA.patch('/admin/policies', { discount_student_from_age: 30, discount_student_to_age: 20 }), 400);
  expect('policies: an empty edit -> 400', await BA.patch('/admin/policies', {}), 400);
  expect('policies: booking rules edit', await BA.patch('/admin/policies', { cancel_hours: 6, max_packages: 3 }), 200);
  await BA.patch('/admin/policies', { cancel_hours: 4, max_packages: 2, annual_dues: 48 });
  // a price edit changes the price a student pays
  const buyer = await one(`select sp.user_id, sp.member_no from student_profile sp join membership m on m.user_id = sp.user_id where sp.age_group = 'Adult' and m.account_status = 'Active' and sp.user_id <> 'S-001'
      and (select count(*) from student_package x where x.user_id = sp.user_id and x.status = 'Active') = 0 order by sp.user_id limit 1`);
  const BUY = await login(app.base, 'student', buyer.member_no);
  check(`a student with no package (${buyer.member_no}) can sign in`, BUY.loginResult.status === 200);
  expect('policies: package price edit (10-lesson pack 270 -> 301)', await BA.patch('/admin/policies/packages/a10', { price: 301 }), 200);
  const bought = await BUY.post('/student/packages', { packageId: 'a10', method: 'Stripe' });
  const paid = await one(`select amount::float a from payment where user_id = $1 and kind = 'Package' order by created_at desc limit 1`, [buyer.user_id]);
  check('policies: POST /student/packages charges the edited price (301), not the old one', bought.status === 201 || bought.status === 200 ? paid.a === 301 : false, `${bought.status} ${bought.text.slice(0, 150)} ${JSON.stringify(paid)}`);
  expect('policies: package price negative -> 400', await BA.patch('/admin/policies/packages/a10', { price: -1 }), 400);
  expect('policies: unknown package -> 404', await BA.patch('/admin/policies/packages/zzz', { price: 5 }), 404);
  await BA.patch('/admin/policies/packages/a10', { price: 270 });
  expect('policies: deactivate a package', await BA.patch('/admin/policies/packages/k50', { isActive: false }), 200);
  check('policies: a deactivated package leaves the public fees', !(await client(app.base).get('/reference')).json.packages.kids.some(p => p.id === 'k50'));
  await BA.patch('/admin/policies/packages/k50', { isActive: true });
  expect('policies: switch an auto-activation rule off', await BA.patch('/admin/policies/auto-activation/paid', { enabled: false }), 200);
  check('policies: the rule is stored off', (await one(`select enabled from auto_activation_rule where id = 'paid'`)).enabled === false);
  await BA.patch('/admin/policies/auto-activation/paid', { enabled: true });
  expect('policies: unknown rule -> 404', await BA.patch('/admin/policies/auto-activation/nope', { enabled: true }), 404);
  const tpl = await BA.post('/admin/policies/templates', { name: 'Test template', text: 'Hello there' });
  check('policies: create a template', tpl.status === 201 && /^T-\d+$/.test(tpl.json.id), tpl.text);
  expect('policies: a duplicate template name -> 409', await BA.post('/admin/policies/templates', { name: 'test template', text: 'x' }), 409, 'TEMPLATE_NAME_TAKEN');
  expect('policies: edit the template', await BA.patch(`/admin/policies/templates/${tpl.json.id}`, { text: 'Hello again' }), 200);
  expect('policies: delete the template', await BA.del(`/admin/policies/templates/${tpl.json.id}`, {}), 200);
  expect('policies: delete a missing template -> 404', await BA.del(`/admin/policies/templates/${tpl.json.id}`, {}), 404);
  const longName = 'N'.repeat(80);
  for (let i = 0; i < 4; i++) await BA.post('/admin/insights/interventions', { name: longName, slot: 'S'.repeat(40), before: 5, after: 9, decision: 'continue' });
  const ivStored = (await one(`select value_text v from policy_setting where setting_key = 'interventions'`)).v;
  check('interventions: kept as one JSON value under the policy_setting key "interventions" (more than 255 characters)', ivStored.length > 255 && JSON.parse(ivStored).length === 4, `${ivStored.length}`);
  const iv1 = (await BA.get('/admin/insights')).json.interventions;
  check('interventions: listed by Insights, newest first, with the change in percent', iv1.length === 4 && iv1[0].id === 'N-04' && iv1[0].change === 80);
  expect('interventions: a decision change', await BA.patch('/admin/insights/interventions/N-04', { decision: 'stop' }), 200);
  expect('interventions: unknown id -> 404', await BA.patch('/admin/insights/interventions/N-99', { decision: 'stop' }), 404);
  expect('interventions: a bad decision -> 400', await BA.patch('/admin/insights/interventions/N-04', { decision: 'maybe' }), 400);
  check('overview: the latest intervention shows under "Did an intervention work?"', (await BA.get('/admin/overview')).json.questions.intervention.id === 'N-04');

  // ---------------- timetable: clashes and CRUD
  const base = { dojoId: 'hq', weekday: 0, start: '19:00', mat: 'Mat A', type: 'Adults', instructorId: 'INS-0063', capacity: 10 };
  expect('timetable: the same mat at the same time -> 409 MAT_BUSY', await BA.post('/admin/timetable', base), 409, 'MAT_BUSY');
  expect('timetable: the same instructor at the same time -> 409 INSTRUCTOR_BUSY', await BA.post('/admin/timetable', { ...base, mat: 'Mat B', instructorId: 'INS-0042' }), 409, 'INSTRUCTOR_BUSY');
  expect('timetable: an overlapping (not identical) time on the same mat -> 409 MAT_BUSY', await BA.post('/admin/timetable', { ...base, start: '19:30' }), 409, 'MAT_BUSY');
  const early = await BA.post('/admin/timetable', { ...base, start: '17:00', mat: 'Mat A' });
  check('timetable: the same instructor-free class at 17:00 on Mat A (no overlap with 19:00) is created', early.status === 201, early.text.slice(0, 150));
  const ex = await one(`select e.instructor_id, g.id, to_char(g.start_time, 'HH24:MI') s from grading_session g join grading_examiner e on e.session_id = g.id where g.id = 'GR-20261213' and e.instructor_id <> 'INS-0042' order by e.instructor_id limit 1`);
  expect('timetable: an examiner at a grading day time (Sunday 09:00) -> 409 GRADING_CLASH', await BA.post('/admin/timetable', { dojoId: 'bedok', weekday: 6, start: '09:00', mat: 'Mat A', type: 'Adults', instructorId: ex.instructor_id, capacity: 10 }), 409, 'GRADING_CLASH');
  await pg.query(`INSERT INTO grading_session (id, label, session_date, start_time, end_time, dojo_id, lead_examiner_id, status) VALUES ('GR-BZTEST', 'Test grading', '2026-12-02', '12:00', '13:00', 'hq', 'INS-0042', 'Scheduled')`);
  await pg.query(`INSERT INTO grading_examiner (session_id, instructor_id) VALUES ('GR-BZTEST', 'INS-0042')`);
  expect('timetable: HQ hall at a grading time (Wednesday 12:30) -> 409 GRADING_CLASH', await BA.post('/admin/timetable', { dojoId: 'hq', weekday: 2, start: '12:30', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 10 }), 409, 'GRADING_CLASH');
  expect('timetable: the grading examiner teaching at another dojo at that time -> 409 GRADING_CLASH', await BA.post('/admin/timetable', { dojoId: 'bedok', weekday: 2, start: '12:30', mat: 'Mat A', type: 'Adults', instructorId: 'INS-0042', capacity: 10 }), 409, 'GRADING_CLASH');
  check('timetable: v_grading_conflict only lists the fixture, not anything the API created', (await one(`select count(*)::int n from v_grading_conflict where grading_id <> 'GR-BZTEST'`)).n === 0);
  await pg.query(`DELETE FROM grading_examiner WHERE session_id = 'GR-BZTEST'`); await pg.query(`DELETE FROM grading_session WHERE id = 'GR-BZTEST'`);
  expect('timetable: online booking at a non-HQ dojo -> 409 ONLINE_HQ_ONLY', await BA.post('/admin/timetable', { ...base, dojoId: 'bedok', weekday: 3, start: '18:00', onlineBookable: true }), 409, 'ONLINE_HQ_ONLY');
  expect('timetable: a bad weekday -> 400', await BA.post('/admin/timetable', { ...base, weekday: 9 }), 400);
  expect('timetable: an end before the start -> 400', await BA.post('/admin/timetable', { ...base, start: '16:00', end: '15:00' }), 400);
  expect('timetable: an unknown class type -> 400', await BA.post('/admin/timetable', { ...base, type: 'Karate' }), 400);
  expect('timetable: an unknown dojo -> 404', await BA.post('/admin/timetable', { ...base, dojoId: 'nowhere', start: '14:00' }), 404);
  expect('timetable: an unknown instructor -> 404', await BA.post('/admin/timetable', { ...base, instructorId: 'INS-9999', start: '14:00' }), 404);
  const mk = await BA.post('/admin/timetable', { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 10 });
  const T1 = mk.json.template;
  const lessonsOf = async id => await q(`select lesson_id, session_date::text d, status from class_session where template_id = $1 order by session_date`, [id]);
  const L1 = await lessonsOf(T1.id);
  check('timetable: create makes the template (code, HQ is bookable online) and 12 weekly lessons with the seed id format', mk.status === 201 && /^HQ-WED4-\d{4}$/.test(T1.code) && T1.online === true && T1.id.startsWith('CT-')
    && L1.length === 12 && mk.json.lessons === 12 && L1.every(l => /^LS-\d{8}-1600-HQ-B$/.test(l.lesson_id) && l.status === 'Scheduled') && L1[0].d === '2026-11-11' && L1[11].d === '2027-01-27', JSON.stringify(L1.slice(0, 2)));
  const T1b = (await BA.post('/admin/timetable', { dojoId: 'bedok', weekday: 3, start: '18:00', mat: 'Mat A', type: 'Adults', instructorId: 'INS-0063', capacity: 10 }));
  check('timetable: a non-HQ class is not bookable online and takes its dojo in the lesson id', T1b.status === 201 && T1b.json.template.online === false && (await lessonsOf(T1b.json.template.id)).every(l => /-BEDOK-A$/.test(l.lesson_id)));
  expect('timetable: the new class is listed', await BA.get('/admin/timetable?dojo=hq'), 200);
  check('timetable: the list for one dojo only has that dojo and the new class', (await BA.get('/admin/timetable?dojo=hq')).json.templates.every(t => t.dojoId === 'hq') && (await BA.get('/admin/timetable')).json.templates.some(t => t.id === T1.id));
  const TH = await BA.post('/admin/timetable', { dojoId: 'hq', weekday: 3, start: '15:00', mat: 'Mat B', type: 'Mixed', instructorId: 'INS-0063', capacity: 10 });
  check('timetable: a lesson on a closed day (HQ closed 26 Nov) is created as Cancelled and belongs to that closure', (await q(`select status, closure_id from class_session where template_id = $1 and session_date = '2026-11-26'`, [TH.json.template.id]))[0].status === 'Cancelled'
    && (await q(`select closure_id from class_session where template_id = $1 and session_date = '2026-11-26'`, [TH.json.template.id]))[0].closure_id === 'CL-01');
  // edit: capacity follows to the coming lessons, a moved class with bookings is refused, then delete returns the lessons
  const up = await BA.patch(`/admin/timetable/${T1.id}`, { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 12 });
  check('timetable: edit capacity -> 200 and every coming lesson follows', up.status === 200 && (await q(`select distinct capacity from class_session where template_id = $1`, [T1.id])).map(r => r.capacity).join() === '12', up.text.slice(0, 150));
  const bookable = L1[2].lesson_id;
  await bookLervyn(bookable);
  const before = await left(PK);
  expect('timetable: moving a class that has bookings -> 409 HAS_BOOKINGS', await BA.patch(`/admin/timetable/${T1.id}`, { dojoId: 'hq', weekday: 2, start: '17:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 12 }), 409, 'HAS_BOOKINGS');
  expect('timetable: a capacity below the bookings is refused only when too low (0 is invalid -> 400)', await BA.patch(`/admin/timetable/${T1.id}`, { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 0 }), 400);
  expect('timetable: editing a class that does not exist -> 404', await BA.patch('/admin/timetable/CT-999', { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 12 }), 404);
  const moved = await BA.patch(`/admin/timetable/${TH.json.template.id}`, { dojoId: 'hq', weekday: 3, start: '14:00', mat: 'Mat B', type: 'Mixed', instructorId: 'INS-0063', capacity: 10 });
  check('timetable: moving a class with no bookings regenerates its lessons at the new time', moved.status === 200 && (await lessonsOf(TH.json.template.id)).every(l => /-1400-HQ-B$/.test(l.lesson_id)), moved.text.slice(0, 120));
  const del = await BA.del(`/admin/timetable/${T1.id}`, {});
  check('timetable: delete -> the booked lesson is cancelled, Lervyn gets the lesson back (+1), the empty lessons are removed, the class is gone', del.status === 200 && del.json.students === 1 && del.json.lessons === 1 && del.json.cancelledLessons === 1
    && (await left(PK)) === before + 1 && (await one(`select status from class_session where lesson_id = $1`, [bookable])).status === 'Cancelled' && (await one(`select attendance_status s from class_attendance where lesson_id = $1 and user_id = 'S-001'`, [bookable])).s === 'Cancelled'
    && (await q(`select 1 from class_template where id = $1`, [T1.id])).length === 0 && (await q(`select 1 from class_session where lesson_id = $1`, [L1[3].lesson_id])).length === 0, del.text);
  expect('timetable: delete again -> 404', await BA.del(`/admin/timetable/${T1.id}`, {}), 404);
  const sl = await one(`select count(*)::int n from sent_log where title = 'Session removed. Lessons returned.'`);
  check('timetable: removing a class with bookings writes a notice to sent_log', sl.n === 1);

  // ---------------- closures and class cancellation
  await lesson('LS-BZ-1', '2026-12-01', '15:00', '16:00'); await lesson('LS-BZ-2', '2026-12-01', '16:00', '17:00');
  await bookLervyn('LS-BZ-1');
  const l0 = await left(PK), seeded = await one(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date = '2026-12-01' and status = 'Scheduled'`);
  const pre = await BA.get('/admin/closures/preview?dojoId=hq&from=2026-12-01');
  check('closures: preview lists the booked students and classes without changing anything', pre.status === 200 && pre.json.classes === seeded.n && pre.json.people.some(p => p.name === 'Lervyn Wong') && (await left(PK)) === l0);
  expect('closures: a closure that starts in the past -> 400', await BA.post('/admin/closures', { dojoId: 'hq', from: '2026-11-01' }), 400, 'PAST_DATE');
  expect('closures: the last day before the first -> 400', await BA.post('/admin/closures', { dojoId: 'hq', from: '2026-12-05', to: '2026-12-01' }), 400, 'INVALID_RANGE');
  expect('closures: over 60 days -> 400', await BA.post('/admin/closures', { dojoId: 'hq', from: '2026-12-01', to: '2027-03-01' }), 400, 'INVALID_RANGE');
  expect('closures: unknown dojo -> 404', await BA.post('/admin/closures', { dojoId: 'nowhere', from: '2026-12-01' }), 404);
  const mkc = await BA.post('/admin/closures', { dojoId: 'hq', from: '2026-12-01', note: 'Test closure' });
  const C = mkc.json;
  check('closures: create -> the day\'s lessons are Cancelled and belong to the closure', mkc.status === 201 && /^CL-\d+$/.test(C.id) && C.sessions === seeded.n && (await one(`select count(*)::int n from class_session where closure_id = $1 and status = 'Cancelled'`, [C.id])).n === C.sessions
    && (await one(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date = '2026-12-01' and status = 'Scheduled'`)).n === 0, mkc.text);
  check('closures: Lervyn\'s booking is cancelled and his lesson comes back (lessons_left +1)', (await left(PK)) === l0 + 1 && (await one(`select attendance_status s, remarks r from class_attendance where lesson_id = 'LS-BZ-1' and user_id = 'S-001'`)).s === 'Cancelled'
    && /^Cancelled by closure CL-\d+; lesson returned/.test((await one(`select remarks r from class_attendance where lesson_id = 'LS-BZ-1' and user_id = 'S-001'`)).r));
  check('closures: a notice is written to sent_log', (await one(`select count(*)::int n from sent_log where title like 'Dojo closed: Test closure%'`)).n === 1);
  const cl = (await BA.get('/admin/closures')).json;
  check('closures: listed with students and lessons returned; a cancelled single class (3 Nov) is listed too', cl.closures.some(c => c.id === C.id && c.students >= 1 && c.lessons >= 1) && cl.cancelledClasses.some(c => c.lessonId === 'LS-20261103-1900-HQ-A'));
  check('closures: students cannot book the closed day (CLASS_CLOSED or cancelled)', (await ST.post('/student/bookings', { lessonId: 'LS-BZ-2' })).status >= 400);
  const rem = await BA.del(`/admin/closures/${C.id}`, {});
  check('closures: delete reopens the lessons; the cancelled booking stays cancelled and the lesson stays returned', rem.status === 200 && rem.json.reopened === C.sessions && (await one(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date = '2026-12-01' and status = 'Cancelled'`)).n === 0
    && (await one(`select attendance_status s from class_attendance where lesson_id = 'LS-BZ-1' and user_id = 'S-001'`)).s === 'Cancelled' && (await left(PK)) === l0 + 1, rem.text);
  expect('closures: delete again -> 404', await BA.del(`/admin/closures/${C.id}`, {}), 404);
  // one class
  await lesson('LS-BZ-3', '2026-12-02', '10:00', '11:00'); await bookLervyn('LS-BZ-3');
  const l1 = await left(PK);
  const cc = await BA.post('/admin/classes/LS-BZ-3/cancel', { note: 'Instructor unwell' });
  check('class cancel: the class is Cancelled (no closure), the student is returned a lesson and told', cc.status === 200 && cc.json.students === 1 && cc.json.lessons === 1 && (await left(PK)) === l1 + 1
    && (await one(`select status, closure_id from class_session where lesson_id = 'LS-BZ-3'`)).status === 'Cancelled' && (await one(`select closure_id c from class_session where lesson_id = 'LS-BZ-3'`)).c === null
    && (await one(`select count(*)::int n from sent_log where title = 'Class cancelled: Instructor unwell. Lesson returned.'`)).n === 1, cc.text);
  expect('class cancel: a cancelled class cannot be cancelled again -> 409', await BA.post('/admin/classes/LS-BZ-3/cancel', {}), 409, 'CLASS_NOT_CANCELLABLE');
  expect('class cancel: unknown class -> 404', await BA.post('/admin/classes/LS-NOPE/cancel', {}), 404);
  expect('class cancel: a class that has already ended -> 409', await BA.post('/admin/classes/LS-20261103-1800-HQ-A/cancel', {}), 409, 'CLASS_NOT_CANCELLABLE');
  check('closures: a closure of an unlimited-plan student returns nothing but still cancels (no negative lessons)', (await one(`select count(*)::int n from student_package where lessons_left < 0`)).n === 0);

  // ---------------- imports
  const imp = (await BA.get('/admin/imports')).json;
  check('imports: three open rows and the counts match SELECT', imp.issues.length === 3 && imp.counts.open === 3 && imp.counts.fixed === 0);
  check('imports: filter by status', (await BA.get('/admin/imports?status=fixed')).json.issues.length === 0 && (await BA.get('/admin/imports?status=open')).json.issues.length === 3);
  expect('imports: an unknown status filter -> 400', await BA.get('/admin/imports?status=zzz'), 400);
  const sBefore = (await BA.get('/admin/summary')).json.importsOpen;
  expect('imports: dismiss I-01', await BA.patch('/admin/imports/I-01', { status: 'dismissed' }), 200);
  expect('imports: deciding it again -> 409', await BA.patch('/admin/imports/I-01', { status: 'fixed' }), 409, 'ALREADY_DECIDED');
  expect('imports: fix I-02 with an unknown member -> 404', await BA.patch('/admin/imports/I-02', { status: 'fixed', memberNo: 'ASK-0000-0000' }), 404, 'MEMBER_NOT_FOUND');
  expect('imports: a dismissed row cannot be matched -> 400', await BA.patch('/admin/imports/I-03', { status: 'dismissed', memberNo: 'ASK-2023-0456' }), 400);
  const fx = await BA.patch('/admin/imports/I-02', { status: 'fixed', memberNo: 'ASK-2023-0456' });
  check('imports: fix I-02 matched to Kenji Sato; the sidebar count drops by 2; nothing else changed', fx.status === 200 && fx.json.issue.matchedNo === 'ASK-2023-0456' && fx.json.counts.open === 1 && (await BA.get('/admin/summary')).json.importsOpen === sBefore - 2
    && (await one(`select status from import_issue where id = 'I-03'`)).status === 'open');
  expect('imports: unknown row -> 404', await BA.patch('/admin/imports/I-99', { status: 'dismissed' }), 404);

  // ---------------- grading approvals and promotions
  const gr = (await BA.get('/admin/grading')).json;
  check('grading: waiting applications and pending promotions come from the tables', gr.apps.some(a => a.id === 'GA-12' && a.status === 'Submitted') && gr.proposals.length === 2 && gr.proposals.every(p => p.result === 'Pass'));
  const ap = await BA.post('/admin/grading/applications/GA-12/decision', { decision: 'approved' });
  check('grading: approve GA-12 -> Approved, decided by ADM-001, and the student is on the examiners\' list', ap.status === 200 && ap.json.application.status === 'Approved' && (await one(`select decided_by d, session_id s from grading_application where id = 'GA-12'`)).d === 'ADM-001'
    && (await q(`select 1 from grading_candidate where session_id = 'GR-20261213' and user_id = 'S-013' and result = 'Pending'`)).length === 1, ap.text);
  expect('grading: deciding it again -> 409', await BA.post('/admin/grading/applications/GA-12/decision', { decision: 'rejected', note: 'x' }), 409, 'ALREADY_DECIDED');
  await pg.query(`INSERT INTO grading_application (id, user_id, from_rank_id, to_rank_id, session_id, status) VALUES ('GA-BZ1', 'S-020', '4k', '3k', NULL, 'Submitted')`);
  expect('grading: a rejection needs a reason -> 400', await BA.post('/admin/grading/applications/GA-BZ1/decision', { decision: 'rejected' }), 400);
  const rj = await BA.post('/admin/grading/applications/GA-BZ1/decision', { decision: 'rejected', note: 'Needs more sessions' });
  check('grading: reject with a reason -> Rejected with the note, no candidate row', rj.status === 200 && rj.json.application.status === 'Rejected' && rj.json.application.note === 'Needs more sessions' && (await q(`select 1 from grading_candidate where user_id = 'S-020' and session_id = 'GR-20261213'`)).length === 0);
  expect('grading: unknown application -> 404', await BA.post('/admin/grading/applications/GA-99/decision', { decision: 'approved' }), 404);
  const s5 = await one(`select rank_id, accumulated_hours::float a, weapon_hours::float w, total_accumulated_hours::float t from student_profile where user_id = 'S-005'`);
  const pr = await BA.post('/admin/grading/candidates/GR-20260927/S-005/promotion', { decision: 'promote' });
  const a5 = await one(`select rank_id, accumulated_hours::float a, weapon_hours::float w, total_accumulated_hours::float t, last_passed_grading_date::text d from student_profile where user_id = 'S-005'`);
  check(`grading: promote S-005 (${s5.rank_id} -> 1k): rank changes, last_passed_grading_date = the grading day, the hours toward the next grade restart (CHECK holds), the career total stays`,
    pr.status === 200 && a5.rank_id === '1k' && a5.d === '2026-09-27' && a5.a === 0 && a5.w === 0 && a5.t === s5.t && (await one(`select promotion_status p, promotion_decided_by b from grading_candidate where session_id = 'GR-20260927' and user_id = 'S-005'`)).p === 'Promoted', `${pr.text} ${JSON.stringify(a5)}`);
  expect('grading: promoting again -> 409 ALREADY_DECIDED', await BA.post('/admin/grading/candidates/GR-20260927/S-005/promotion', { decision: 'promote' }), 409, 'ALREADY_DECIDED');
  const dc = await BA.post('/admin/grading/candidates/GR-20260927/S-010/promotion', { decision: 'decline' });
  check('grading: decline S-010 -> Declined and the rank is unchanged', dc.status === 200 && (await one(`select rank_id r from student_profile where user_id = 'S-010'`)).r === '5k' && (await one(`select promotion_status p from grading_candidate where session_id = 'GR-20260927' and user_id = 'S-010'`)).p === 'Declined');
  expect('grading: a candidate that does not exist -> 404', await BA.post('/admin/grading/candidates/GR-20260927/S-999/promotion', { decision: 'promote' }), 404);
  expect('grading: a bad decision -> 400', await BA.post('/admin/grading/candidates/GR-20260927/S-005/promotion', { decision: 'yes' }), 400);
  check('grading: no promotion results waiting any more; sidebar promotions count is 0', (await BA.get('/admin/grading')).json.proposals.length === 0 && (await BA.get('/admin/summary')).json.promotionsPending === 0);
  const S5 = await login(app.base, 'student', (await one(`select member_no m from student_profile where user_id = 'S-005'`)).m);
  const s5home = await S5.get('/student/home');
  check('grading: the promoted student sees the new rank on their home page', s5home.status === 200 && /1st Kyu/.test(s5home.text), s5home.text.slice(0, 100));
  check('grading: v_grading_conflict is still empty', (await one(`select count(*)::int n from v_grading_conflict`)).n === 0);

  // ---------------- notifications (Business Admin audiences)
  const pv = await BA.get('/admin/notifications/audience?type=all');
  check('notifications: the preview for all members equals SELECT count', pv.status === 200 && pv.json.recipients === sql.total && pv.json.audience === 'All members');
  check('notifications: the preview for one dojo and one grade', (await BA.get('/admin/notifications/audience?type=dojo&target=hq')).json.recipients === (await one(`select count(*)::int n from student_profile where dojo_id = 'hq'`)).n
    && (await BA.get('/admin/notifications/audience?type=grade&target=6k')).json.recipients === (await one(`select count(*)::int n from student_profile where rank_id = '6k'`)).n);
  expect('notifications: the front desk preview of "all members" -> 403 AUDIENCE_NOT_ALLOWED', await FD.get('/admin/notifications/audience?type=all'), 403, 'AUDIENCE_NOT_ALLOWED');
  const sendLog = (await one(`select count(*)::int n from sent_log`)).n;
  const snd = await BA.post('/admin/notifications/send', { title: 'Hello everyone', audience: { type: 'all' } });
  check('notifications: a Business Admin sends their own message to all members (sent_log row by ADM-001)', snd.status === 200 && snd.json.recipients === sql.total && (await one(`select count(*)::int n from sent_log`)).n === sendLog + 1 && (await one(`select sent_by s from sent_log order by sent_at desc, id desc limit 1`)).s === 'ADM-001');

  // ---------------- staff
  const st = (await BA.get('/admin/staff')).json;
  check('staff: office staff and instructors listed, never a password hash', st.staff.length === 3 + 18 && st.staff[0].id === 'ADM-001' && st.staff[0].you === true && !JSON.stringify(st).match(/password|\$2[aby]\$/) && st.activeBusinessAdmins === 1);
  expect('staff: the front desk cannot list staff -> 403', await FD.get('/admin/staff'), 403, 'BUSINESS_ADMIN_ONLY');
  expect('staff: ADM-001 cannot change their own role (one Business Admin) -> 409 LAST_BUSINESS_ADMIN', await BA.patch('/admin/staff/ADM-001', { type: 'frontdesk' }), 409, 'LAST_BUSINESS_ADMIN');
  expect('staff: ADM-001 cannot deactivate themselves (last Business Admin) -> 409 LAST_BUSINESS_ADMIN', await BA.patch('/admin/staff/ADM-001', { status: 'inactive' }), 409, 'LAST_BUSINESS_ADMIN');
  expect('staff: create with a bad email -> 400', await BA.post('/admin/staff', { name: 'Zed Zed', type: 'frontdesk', email: 'not-an-email' }), 400);
  expect('staff: create with a taken email -> 409 EMAIL_IN_USE', await BA.post('/admin/staff', { name: 'Zed Zed', type: 'frontdesk', email: 'daniel.ong@askdojo.example' }), 409, 'EMAIL_IN_USE');
  expect('staff: create with an unknown role -> 400', await BA.post('/admin/staff', { name: 'Zed Zed', type: 'owner', email: 'zed@example.com' }), 400);
  const nf = await BA.post('/admin/staff', { name: 'Test Frontdesk', type: 'frontdesk', email: 'test.frontdesk@askdojo.example' });
  check('staff: create a front desk account -> ADM-103 and a one-time temporary password; the hash is stored, not the password', nf.status === 201 && nf.json.staff.id === 'ADM-103' && typeof nf.json.tempPassword === 'string' && nf.json.tempPassword.length >= 10
    && (await one(`select password_hash h from users where id = 'ADM-103'`)).h.startsWith('$2') && nf.headers.get('cache-control') === 'no-store', nf.text);
  const nb = await BA.post('/admin/staff', { name: 'Test Business', type: 'business', email: 'test.business@askdojo.example' });
  const ni = await BA.post('/admin/staff', { name: 'Test Sensei', type: 'instructor', email: 'test.sensei@askdojo.example', danGrade: 3 });
  check('staff: create a Business Admin (ADM-002) and an instructor (INS-0064, 3rd Dan, role instructor)', nb.json.staff.id === 'ADM-002' && ni.json.staff.id === 'INS-0064' && (await one(`select role from users where id = 'INS-0064'`)).role === 'instructor' && (await one(`select dan_grade d from instructor_profile where user_id = 'INS-0064'`)).d === 3);
  const FDnew = await login(app.base, 'admin', 'ADM-103', nf.json.tempPassword);
  check('staff: the new front desk signs in with the temporary password and is a front desk', FDnew.loginResult.status === 200 && FDnew.loginResult.json.user.adminType === 'frontdesk');
  expect('staff: a new account must change its temporary password first -> 403 PASSWORD_CHANGE_REQUIRED', await FDnew.get('/admin/staff'), 403, 'PASSWORD_CHANGE_REQUIRED');
  expect('staff: the new front desk sets its own password', await FDnew.post('/auth/change-password', { currentPassword: nf.json.tempPassword, newPassword: 'Sunrise2026', confirmPassword: 'Sunrise2026' }), 200);
  expect('staff: the new front desk is refused on a Business Admin route', await FDnew.get('/admin/staff'), 403, 'BUSINESS_ADMIN_ONLY');
  expect('staff: change ADM-103 to Business Admin', await BA.patch('/admin/staff/ADM-103', { type: 'business' }), 200);
  check('staff: the role change applies at once (the open session now reaches Business Admin routes)', (await FDnew.get('/admin/staff')).status === 200);
  expect('staff: an instructor keeps their role -> 400 ROLE_FIXED', await BA.patch('/admin/staff/INS-0064', { type: 'frontdesk' }), 400, 'ROLE_FIXED');
  expect('staff: ADM-103 (now a Business Admin) cannot change their own role -> 409 SELF_CHANGE_FORBIDDEN', await FDnew.patch('/admin/staff/ADM-103', { type: 'frontdesk' }), 409, 'SELF_CHANGE_FORBIDDEN');
  expect('staff: ADM-103 cannot deactivate themselves -> 409 SELF_CHANGE_FORBIDDEN', await FDnew.patch('/admin/staff/ADM-103', { status: 'inactive' }), 409, 'SELF_CHANGE_FORBIDDEN');
  expect('staff: deactivate ADM-103 (other Business Admin) -> allowed', await BA.patch('/admin/staff/ADM-103', { status: 'inactive' }), 200);
  const dead = await FDnew.get('/admin/staff');
  check('staff: the deactivated account\'s open session stops at once (401 ACCOUNT_DEACTIVATED)', dead.status === 401 && dead.json.error.code === 'ACCOUNT_DEACTIVATED', dead.text);
  const again = await client(app.base).post('/auth/login', { portal: 'admin', identifier: 'ADM-103', password: 'Sunrise2026' });
  check('staff: a deactivated account can no longer sign in (403 ACCOUNT_DEACTIVATED)', again.status === 403 && again.json.error.code === 'ACCOUNT_DEACTIVATED', again.text);
  expect('staff: reactivate ADM-103', await BA.patch('/admin/staff/ADM-103', { status: 'active' }), 200);
  const rs = await BA.post('/admin/staff/ADM-103/reset-password', {});
  const oldPw = await client(app.base).post('/auth/login', { portal: 'admin', identifier: 'ADM-103', password: nf.json.tempPassword });
  const newPw = await client(app.base).post('/auth/login', { portal: 'admin', identifier: 'ADM-103', password: rs.json.tempPassword });
  check('staff: reset password -> a new temporary password; the old one stops working', rs.status === 200 && rs.json.tempPassword !== nf.json.tempPassword && oldPw.status === 401 && newPw.status === 200);
  expect('staff: reset for an unknown account -> 404', await BA.post('/admin/staff/ADM-777/reset-password', {}), 404);
  expect('staff: change an unknown account -> 404', await BA.patch('/admin/staff/ADM-777', { status: 'inactive' }), 404);
  // deactivate an instructor
  expect('staff: deactivate the new instructor', await BA.patch('/admin/staff/INS-0064', { status: 'inactive' }), 200);
  const insLogin = await client(app.base).post('/auth/login', { portal: 'instructor', identifier: 'INS-0064', password: (await BA.post('/admin/staff/INS-0064/reset-password', {})).json.tempPassword });
  check('staff: a deactivated instructor cannot sign in (403 ACCOUNT_DEACTIVATED)', insLogin.status === 403 && insLogin.json.error.code === 'ACCOUNT_DEACTIVATED', insLogin.text);
  expect('timetable: a deactivated instructor cannot be given a class -> 404 INSTRUCTOR_NOT_FOUND', await BA.post('/admin/timetable', { dojoId: 'hq', weekday: 5, start: '14:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0064', capacity: 10 }), 404, 'INSTRUCTOR_NOT_FOUND');
  // ADM-001 with two active Business Admins: self change is refused as SELF_CHANGE_FORBIDDEN; the last one as LAST_BUSINESS_ADMIN (checked above with one)
  expect('staff: ADM-001 deactivating themselves while another Business Admin exists -> 409 SELF_CHANGE_FORBIDDEN', await BA.patch('/admin/staff/ADM-001', { status: 'inactive' }), 409, 'SELF_CHANGE_FORBIDDEN');
  expect('staff: role change of ADM-101 to Business Admin, then back', await BA.patch('/admin/staff/ADM-101', { type: 'business' }), 200);
  check('staff: ADM-101 now reaches Business Admin routes', (await FD.get('/admin/staff')).status === 200);
  expect('staff: ADM-101 back to front desk', await BA.patch('/admin/staff/ADM-101', { type: 'frontdesk' }), 200);
  check('staff: ADM-101 is a front desk again (403)', (await FD.get('/admin/staff')).status === 403);
  // the last Business Admin, with another one only inactive: fixture (the other Business Admin deactivated in the database)
  await pg.query(`UPDATE staff_profile SET status = 'inactive' WHERE admin_type = 'business' AND user_id <> 'ADM-001'`);
  expect('staff: only one active Business Admin left -> ADM-001 cannot be changed (LAST_BUSINESS_ADMIN)', await BA.patch('/admin/staff/ADM-001', { status: 'inactive' }), 409, 'LAST_BUSINESS_ADMIN');
  check('staff: ADM-001 is still active and still a Business Admin', (await one(`select admin_type t, status s from staff_profile where user_id = 'ADM-001'`)).s === 'active');

  // ---------------- SQL injection strings (search/filter/body inputs): no 500, no data loss
  const counts0 = await one(`select (select count(*) from users)::int u, (select count(*) from policy_setting)::int p, (select count(*) from class_template)::int t, (select md5(string_agg(password_hash, ',' order by id)) from users) h`);
  let bad = 0;
  for (const s of SQLI) {
    const e = encodeURIComponent(s);
    const rs = [await BA.get(`/admin/insights?centre=${e}&type=${e}`), await BA.get(`/admin/reports?centre=${e}`), await BA.get(`/admin/reports/payments.csv?centre=${e}`), await BA.get(`/admin/timetable?dojo=${e}`),
      await BA.get(`/admin/imports?status=${e}`), await BA.get(`/admin/revenue?from=${e}`), await BA.get(`/admin/closures/preview?dojoId=${e}&from=2026-12-01`), await BA.get(`/admin/notifications/audience?type=dojo&target=${e}`),
      await BA.post('/admin/insights/interventions', { name: s.slice(0, 80) || 'x', slot: 'x', before: 1, after: 1, decision: 'continue' }), await BA.patch('/admin/policies/templates/T-1', { name: ('Class cancelled' + s).slice(0, 60) }),
      await BA.post('/admin/classes/' + e + '/cancel', {}), await BA.patch(`/admin/imports/${e}`, { status: 'dismissed' }), await BA.post('/admin/staff', { name: s.slice(0, 60) || 'xx', type: 'frontdesk', email: s })];
    if (rs.some(r => r.status >= 500 || /syntax error at|relation ".*" does not exist|\bat \S+\.js:\d+|DatabaseError|PGlite/i.test(r.text))) { bad++; console.log('  injection problem for', JSON.stringify(s), rs.map(r => r.status).join(',')); }
  }
  const counts1 = await one(`select (select count(*) from users)::int u, (select count(*) from policy_setting)::int p, (select count(*) from class_template)::int t, (select md5(string_agg(password_hash, ',' order by id)) from users) h`);
  check(`SQL injection strings (${SQLI.length} x 13 inputs): never a 500 or a database message`, bad === 0);
  check('SQL injection strings: users, templates and password hashes unchanged (policy rows only grew by the interventions list)', counts1.u === counts0.u && counts1.t === counts0.t && counts1.h === counts0.h && counts1.p <= counts0.p + 1);
  await BA.patch('/admin/policies/templates/T-1', { name: 'Class cancelled' });

  // ---------------- nothing secret in any admin response
  const all = bodies.join('\n');
  check('no admin response contains a password_hash field or a bcrypt hash (a stored test string that mentions the word is not a field)', !/"password_hash"\s*:|\$2[aby]\$\d\d\$/.test(all));
  check('no admin response carries a stack trace or a SQL error', !/at .*\.js:\d+|syntax error at|relation ".*" does not exist/.test(all));
  await pg.end();
} catch (e) { console.error(e); check('script ran to the end', false, e.message); }
finally { try { await pg.end(); } catch (_) { /* closed */ } await app.stop(); }
S.done();
process.exit(process.exitCode || 0);
