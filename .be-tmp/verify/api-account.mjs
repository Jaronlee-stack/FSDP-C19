// Accounts: member-chosen registration passwords (public, desk, held desk), forced password change, change-password for every role,
// BA reset, session invalidation, change-password rate limit and the auth/staff audit rows. Spawns its own app (and a second one for the limiter).
import { spawnApp, resetDb, client, login, pgConnect, suite, sleep, findSecrets } from './lib.mjs';

await resetDb();
const app = await spawnApp();
const base = app.base;
const t = suite('api-account');
const { check, expect } = t;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const DEMO_HASH = '$2b$10$T88/9UZzmA2kWCyjDC44VObKDgRfr0bt1x5Fk0u3gqnD4Q8Q5UBTu';
const texts = [];                      // every response body, scanned for secrets at the end
const CHOSEN = ['Sunrise2026', 'Desk2026pw', 'Held2026pw', 'Another2026pw', 'Instr2026pw', 'Front2026pw', 'Jamie2026pw'];   // member/staff-chosen passwords: never in a response
const plain = [...CHOSEN];             // plus every temporary password captured below: never in an audit row or the log
const tr = r => { texts.push(r.text); return r; };
const err = r => r.json && r.json.error && r.json.error.code;
const signIn = (portal, identifier, password) => client(base).post('/auth/login', { portal, identifier, password }).then(tr);

const reg = {
  name: 'Nora Fresh', dojoId: 'hq', age: 28, dob: '1998-05-05', gender: 'Female', nationality: 'Singaporean', phone: '9000 1111', email: 'nora.fresh@example.com',
  emergencyContact: 'Sam Fresh (Brother) · 9000 2222', priorExperience: null, previousMember: false, medical: null,
  dogi: { type: 'Cotton (Standard)', size: '3' }, packageId: 'a25', signer: 'Nora Fresh', signatureProvided: true
};
const WEAK = {
  'no password': {}, 'short (7)': { password: 'Abcde12', confirmPassword: 'Abcde12' }, 'no digit': { password: 'abcdefgh', confirmPassword: 'abcdefgh' },
  'no letter': { password: '12345678', confirmPassword: '12345678' }, 'over 72 bytes': { password: 'a1' + 'x'.repeat(75), confirmPassword: 'a1' + 'x'.repeat(75) },
  'multi-byte over 72 bytes': { password: 'a1' + 'é'.repeat(40), confirmPassword: 'a1' + 'é'.repeat(40) },
  'equals email': { password: 'nora.fresh@example.com', confirmPassword: 'nora.fresh@example.com' }, 'mismatch': { password: 'Sunrise2026', confirmPassword: 'Sunrise2027' },
  'confirm missing': { password: 'Sunrise2026' }
};

const seedMaxId = (await q(`select coalesce(max(id), 0)::int n from audit_log`))[0].n;   // rows written by this suite have larger ids
try {
  const pub = client(base);
  const FD = await login(base, 'admin', 'ADM-101');
  const BA = await login(base, 'admin', 'ADM-001');

  /* ---------- public registration ---------- */
  for (const [k, v] of Object.entries(WEAK)) expect(`public register: ${k} -> 400 VALIDATION_ERROR`, tr(await pub.post('/public/registrations', { ...reg, ...v })), 400, 'VALIDATION_ERROR');
  check('public register: nothing was stored for the rejected attempts', (await q(`select count(*)::int n from registration_application where email = 'nora.fresh@example.com'`))[0].n === 0);
  const ok = tr(await pub.post('/public/registrations', { ...reg, password: 'Sunrise2026', confirmPassword: 'Sunrise2026' }));
  check('public register (auto-activated): 201, member number, no password / hash / tempPassword in the body', ok.status === 201 && ok.json.activated === true && /^ASK-2026-\d{4}$/.test(ok.json.memberNo) && !('tempPassword' in ok.json) && !/assword|\$2[aby]\$/.test(ok.text), ok.text.slice(0, 200));
  const nora = (await q(`select u.id, u.password_hash, u.must_change_password m, a.password_hash app_hash from users u join student_profile sp on sp.user_id = u.id join registration_application a on a.user_id = u.id where sp.member_no = $1`, [ok.json.memberNo]))[0];
  check('auto-activated: users row has a bcrypt hash (not the demo one), application hash cleared, no forced change', /^\$2[aby]\$/.test(nora.password_hash) && nora.password_hash !== DEMO_HASH && nora.app_hash === null && nora.m === false);
  expect('auto-activated member signs in with member number + own password', await signIn('student', ok.json.memberNo, 'Sunrise2026'), 200);
  expect('auto-activated member signs in with email + own password', await signIn('student', 'NORA.FRESH@example.com', 'Sunrise2026'), 200);
  expect('auto-activated member: the demo password does not work', await signIn('student', ok.json.memberNo, 'password123'), 401);
  expect('auto-activated member: a guess does not work', await signIn('student', ok.json.memberNo, 'Sunrise2025'), 401);

  // waiting application: the hash lives on the application until a staff member activates it, then moves to users unchanged
  const wait = tr(await pub.post('/public/registrations', { ...reg, name: 'Wai Ting', email: 'wai.ting@example.com', signatureProvided: false, password: 'Sunrise2026', confirmPassword: 'Sunrise2026' }));
  const pend = (await q(`select password_hash h from registration_application where id = $1`, [wait.json.applicationId]))[0];
  check('waiting registration: 201 not activated, the application holds a bcrypt hash', wait.status === 201 && wait.json.activated === false && /^\$2[aby]\$/.test(pend.h));
  const appList = tr(await FD.get('/admin/applications')), appOne = tr(await FD.get(`/admin/applications/${wait.json.applicationId}`));
  check('registration list and detail never return the hash or a password field', !/password|\$2[aby]\$/i.test(appList.text + appOne.text));
  await q(`update application_checklist set done = true where application_id = $1`, [wait.json.applicationId]);
  const act = tr(await FD.post(`/admin/applications/${wait.json.applicationId}/activate`, {}));
  const wt = (await q(`select u.password_hash h, u.must_change_password m, a.password_hash app_hash from registration_application a join users u on u.id = a.user_id where a.id = $1`, [wait.json.applicationId]))[0];
  check('staff activation: memberNo, no tempPassword', act.status === 200 && act.json.memberNo && !('tempPassword' in act.json), act.text);
  check('staff activation: users row got the SAME hash, application hash cleared, no forced change', wt.h === pend.h && wt.app_hash === null && wt.m === false);
  expect('staff-activated member signs in with email + own password', await signIn('student', 'wai.ting@example.com', 'Sunrise2026'), 200);
  expect('staff-activated member signs in with member number + own password', await signIn('student', act.json.memberNo, 'Sunrise2026'), 200);

  // rejection clears the stored hash
  const rj = tr(await pub.post('/public/registrations', { ...reg, name: 'Rae Ject', email: 'rae.ject@example.com', signatureProvided: false, password: 'Sunrise2026', confirmPassword: 'Sunrise2026' }));
  expect('reject a waiting registration', tr(await FD.post(`/admin/applications/${rj.json.applicationId}/reject`, { note: 'Duplicate' })), 200);
  check('rejected application: password hash cleared, no user created', (await q(`select password_hash h, user_id from registration_application where id = $1`, [rj.json.applicationId]))[0].h === null);

  /* ---------- desk registration ---------- */
  const desk = { ...reg, name: 'Desk Dee', email: 'desk.dee@example.com' };
  for (const [k, v] of Object.entries(WEAK)) {
    const vv = k === 'equals email' ? { password: desk.email, confirmPassword: desk.email } : v;
    expect(`desk register: ${k} -> 400 VALIDATION_ERROR`, tr(await FD.post('/admin/registrations', { ...desk, ...vv })), 400, 'VALIDATION_ERROR');
  }
  const dr = tr(await FD.post('/admin/registrations', { ...desk, password: 'Desk2026pw', confirmPassword: 'Desk2026pw' }));
  check('desk register: 201 activated, no tempPassword, no password in the body', dr.status === 201 && dr.json.activated === true && !('tempPassword' in dr.json) && !/Desk2026pw|\$2[aby]\$/.test(dr.text), dr.text.slice(0, 200));
  expect('desk-registered student signs in with member number + the password they typed', await signIn('student', dr.json.memberNo, 'Desk2026pw'), 200);
  expect('desk-registered student signs in with email + password', await signIn('student', 'desk.dee@example.com', 'Desk2026pw'), 200);
  check('desk register: application hash cleared after activation', (await q(`select a.password_hash h from registration_application a join student_profile sp on sp.user_id = a.user_id where sp.member_no = $1`, [dr.json.memberNo]))[0].h === null);
  // carried-over grade: held for a Business Admin, then activated with the stored hash
  const held = tr(await FD.post('/admin/registrations', { ...reg, name: 'Hal Held', email: 'hal.held@example.com', carryGrade: '3rd Kyu', password: 'Held2026pw', confirmPassword: 'Held2026pw' }));
  check('desk register with a carried-over grade: held (not activated), no password in the body', held.status === 201 && held.json.activated === false && !('tempPassword' in held.json) && !/Held2026pw/.test(held.text), held.text.slice(0, 200));
  const heldHash = (await q(`select password_hash h from registration_application where id = $1`, [held.json.applicationId]))[0].h;
  check('held desk registration keeps a bcrypt hash while pending', /^\$2[aby]\$/.test(heldHash));
  expect('held student cannot sign in yet', await signIn('student', 'hal.held@example.com', 'Held2026pw'), 401);
  await q(`update application_checklist set done = true where application_id = $1`, [held.json.applicationId]);
  const ha = tr(await BA.post(`/admin/applications/${held.json.applicationId}/activate`, { rankId: '3k' }));
  check('BA activates the held registration with the grade: no tempPassword', ha.status === 200 && !('tempPassword' in ha.json), ha.text);
  const hu = (await q(`select u.password_hash h, u.must_change_password m, sp.rank_id from users u join student_profile sp on sp.user_id = u.id where sp.member_no = $1`, [ha.json.memberNo]))[0];
  check('held member: same hash as the application, rank 3k, no forced change', hu.h === heldHash && hu.rank_id === '3k' && hu.m === false);
  expect('held member signs in with own password', await signIn('student', ha.json.memberNo, 'Held2026pw'), 200);

  /* ---------- seeded applications ---------- */
  const seedApps = await q(`select id, status, password_hash h from registration_application where id in ('APP-01','APP-02','APP-03','APP-04') order by id`);
  check('seeded open applications carry the documented demo hash', seedApps.length === 4 && seedApps.every(a => a.h === DEMO_HASH), JSON.stringify(seedApps.map(a => [a.id, a.status, !!a.h])));
  const a1 = tr(await FD.post('/admin/applications/APP-01/activate', {}));
  check('seeded APP-01 activation: no tempPassword (uses the demo hash)', a1.status === 200 && !('tempPassword' in a1.json), a1.text);
  const s1 = await signIn('student', a1.json.memberNo, 'password123');
  check('seeded APP-01 member signs in with password123 and is not forced to change', s1.status === 200 && s1.json.user.mustChangePassword === false, s1.text.slice(0, 160));
  // legacy fallback: an application without a stored hash gets a one-time temporary password and a forced change
  await q(`update registration_application set password_hash = null where id = 'APP-02'`);
  await q(`update application_checklist set done = true where application_id = 'APP-02'`);
  const a2 = tr(await FD.post('/admin/applications/APP-02/activate', {}));
  check('NULL-hash application: tempPassword returned once to the staff member', a2.status === 200 && typeof a2.json.tempPassword === 'string' && a2.json.tempPassword.length >= 10, a2.text);
  plain.push(a2.json.tempPassword);
  const fbU = (await q(`select must_change_password m from users u join student_profile sp on sp.user_id = u.id where sp.member_no = $1`, [a2.json.memberNo]))[0];
  check('NULL-hash application: the new member must change the password', fbU.m === true);
  const fbS = await login(base, 'student', a2.json.memberNo, a2.json.tempPassword);
  check('fallback member signs in with the temporary password, mustChangePassword true', fbS.loginResult.status === 200 && fbS.loginResult.json.user.mustChangePassword === true);
  expect('fallback member: /student/home -> 403 PASSWORD_CHANGE_REQUIRED', tr(await fbS.get('/student/home')), 403, 'PASSWORD_CHANGE_REQUIRED');

  /* ---------- forced change: instructor, front desk, student ---------- */
  const ni = tr(await BA.post('/admin/staff', { name: 'Forced Sensei', type: 'instructor', email: 'forced.sensei@askdojo.example', danGrade: 2 }));
  const nf = tr(await BA.post('/admin/staff', { name: 'Forced Desk', type: 'frontdesk', email: 'forced.desk@askdojo.example' }));
  check('staff create: instructor + front desk get a one-time temp password and must_change_password', ni.status === 201 && nf.status === 201 && typeof ni.json.tempPassword === 'string' && typeof nf.json.tempPassword === 'string'
    && (await q(`select bool_and(must_change_password) m from users where id in ($1, $2)`, [ni.json.staff.id, nf.json.staff.id]))[0].m === true, ni.text.slice(0, 120));
  plain.push(ni.json.tempPassword, nf.json.tempPassword);
  await q(`update users set must_change_password = true where id = 'S-002'`);   // Jamie: flag set by SQL
  const forced = [
    ['instructor', 'instructor', ni.json.staff.id, ni.json.tempPassword, ['/instructor/profile', '/instructor/schedule', '/instructor/students', '/instructor/grading'], 'Instr2026pw', '/instructor/profile', ['PUT', '/instructor/students/S-001/grading-note', { body: 'x' }]],
    ['front desk', 'admin', nf.json.staff.id, nf.json.tempPassword, ['/admin/summary', '/admin/members', '/admin/applications', '/admin/payments'], 'Front2026pw', '/admin/summary', ['POST', '/admin/exceptions', { kind: 'access', subjectName: 'x', detail: 'x' }]],
    ['student (flag set by SQL)', 'student', 'ASK-2024-0921', 'password123', ['/student/home', '/student/profile', '/student/packages', '/student/grading'], 'Jamie2026pw', '/student/home', ['PATCH', '/student/profile', { contactNo: '91234567' }]]
  ];
  for (const [label, portal, id, pw, paths, next, probe, [wm, wp, wb]] of forced) {
    const c = await login(base, portal, id, pw);
    check(`forced ${label}: sign-in succeeds with mustChangePassword true`, c.loginResult.status === 200 && c.loginResult.json.user.mustChangePassword === true, c.loginResult.text.slice(0, 160));
    const blocked = [];
    for (const p of paths) { const r = tr(await c.get(p)); if (r.status !== 403 || err(r) !== 'PASSWORD_CHANGE_REQUIRED') blocked.push(`${p}:${r.status}`); }
    check(`forced ${label}: every other endpoint -> 403 PASSWORD_CHANGE_REQUIRED`, !blocked.length, blocked.join());
    expect(`forced ${label}: a mutating call (${wm} ${wp}) is refused too`, tr(await c.api(wm, wp, wb)), 403, 'PASSWORD_CHANGE_REQUIRED');
    const me = tr(await c.get('/auth/me'));
    check(`forced ${label}: /auth/me is allowed and reports mustChangePassword`, me.status === 200 && me.json.mustChangePassword === true);
    const ch = tr(await c.post('/auth/change-password', { currentPassword: pw, newPassword: next, confirmPassword: next }));
    check(`forced ${label}: change-password 200, flag cleared, new cookie`, ch.status === 200 && ch.json.user.mustChangePassword === false && ch.headers.getSetCookie().some(s => s.startsWith('ask_token=')), ch.text.slice(0, 160));
    expect(`forced ${label}: the API works after the change`, tr(await c.get(probe)), 200);
    check(`forced ${label}: db flag false and password_changed_at set`, (await q(`select must_change_password m, password_changed_at c from users where id = (select coalesce((select user_id from student_profile where member_no = $1), $1))`, [id]))[0].m === false);
    expect(`forced ${label}: the old password no longer signs in`, await signIn(portal, id, pw), 401);
    expect(`forced ${label}: the new password signs in`, await signIn(portal, id, next), 200);
  }
  expect('logout works for a forced account (unauthenticated route)', tr(await fbS.post('/auth/logout', {})), 200);

  /* ---------- change-password for every role ---------- */
  const ROLES = [['student', 'student', 'ASK-2025-1834', '/student/home'], ['instructor', 'instructor', 'INS-0042', '/instructor/profile'], ['front desk', 'admin', 'ADM-101', '/admin/summary'], ['business admin', 'admin', 'ADM-001', '/admin/staff']];
  for (const [label, portal, id, probe] of ROLES) {
    const c = await login(base, portal, id);
    const memberNo = portal === 'student' ? id : null;
    expect(`${label}: wrong current password -> 400 CURRENT_PASSWORD_INCORRECT`, tr(await c.post('/auth/change-password', { currentPassword: 'wrong-pw-1', newPassword: 'Another2026pw', confirmPassword: 'Another2026pw' })), 400, 'CURRENT_PASSWORD_INCORRECT');
    expect(`${label}: reuse of the current password -> 400 PASSWORD_REUSED`, tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'password123', confirmPassword: 'password123' })), 400, 'PASSWORD_REUSED');
    expect(`${label}: weak (no digit) -> 400 WEAK_PASSWORD`, tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'onlyletters', confirmPassword: 'onlyletters' })), 400, 'WEAK_PASSWORD');
    expect(`${label}: weak (short) -> 400 WEAK_PASSWORD`, tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'Ab12', confirmPassword: 'Ab12' })), 400, 'WEAK_PASSWORD');
    expect(`${label}: weak (equals the account id) -> 400 WEAK_PASSWORD`, tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: (memberNo || id).toLowerCase(), confirmPassword: (memberNo || id).toLowerCase() })), 400, 'WEAK_PASSWORD');
    expect(`${label}: mismatched confirmation -> 400 VALIDATION_ERROR`, tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'Another2026pw', confirmPassword: 'Another2026px' })), 400, 'VALIDATION_ERROR');
    expect(`${label}: unknown field -> 400 VALIDATION_ERROR`, tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'Another2026pw', role: 'admin' })), 400, 'VALIDATION_ERROR');
    expect(`${label}: not JSON -> 415 JSON_REQUIRED`, tr(await c.api('POST', '/auth/change-password', undefined, { headers: { 'Content-Type': 'text/plain' }, rawBody: 'currentPassword=password123' })), 415, 'JSON_REQUIRED');
    await sleep(1100);                     // the JWT iat is in seconds; the old cookie must be strictly older than the change
    const oldCookie = c.jar.ask_token;
    const ch = tr(await c.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'Another2026pw', confirmPassword: 'Another2026pw' }));
    check(`${label}: change-password 200 with a new Set-Cookie and Cache-Control no-store`, ch.status === 200 && ch.json.ok === true && c.jar.ask_token && c.jar.ask_token !== oldCookie && /no-store/.test(ch.headers.get('cache-control') || ''), ch.text.slice(0, 160));
    expect(`${label}: the re-issued cookie keeps working`, tr(await c.get(probe)), 200);
    const stale = client(base); stale.jar.ask_token = oldCookie;
    expect(`${label}: the cookie from before the change is dead (401 SESSION_EXPIRED)`, tr(await stale.get('/auth/me')), 401, 'SESSION_EXPIRED');
    expect(`${label}: the old password fails`, await signIn(portal, id, 'password123'), 401);
    expect(`${label}: the new password works`, await signIn(portal, id, 'Another2026pw'), 200);
  }
  expect('change-password without a cookie -> 401', tr(await client(base).post('/auth/change-password', { currentPassword: 'a', newPassword: 'Another2026pw' })), 401);

  /* ---------- Business Admin reset ---------- */
  const T = await login(base, 'admin', 'ADM-101', 'Another2026pw');
  const BA2 = await login(base, 'admin', 'ADM-001', 'Another2026pw');
  await sleep(1100);
  const rs = tr(await BA2.post('/admin/staff/ADM-101/reset-password', {}));
  check('BA reset: 200 with a one-time temporary password', rs.status === 200 && typeof rs.json.tempPassword === 'string' && /no-store/.test(rs.headers.get('cache-control') || ''), rs.text);
  plain.push(rs.json.tempPassword);
  const rrow = (await q(`select must_change_password m, password_changed_at c from users where id = 'ADM-101'`))[0];
  check('BA reset: must_change_password true and password_changed_at set', rrow.m === true && !!rrow.c);
  expect("BA reset: the target's existing cookie -> 401 SESSION_EXPIRED", tr(await T.get('/auth/me')), 401, 'SESSION_EXPIRED');
  const T2 = await login(base, 'admin', 'ADM-101', rs.json.tempPassword);
  check('BA reset: target signs in with the temp password and is forced to change it', T2.loginResult.status === 200 && T2.loginResult.json.user.mustChangePassword === true);
  expect('BA reset: target admin API -> 403 PASSWORD_CHANGE_REQUIRED', tr(await T2.get('/admin/summary')), 403, 'PASSWORD_CHANGE_REQUIRED');
  expect('BA reset: front desk cannot reset anyone (403)', tr(await T2.post('/admin/staff/ADM-001/reset-password', {})), 403);

  /* ---------- audit rows for auth.* and staff.* ---------- */
  await signIn('student', 'ASK-1999-0000', 'whatever1');           // unknown account -> auth.login_failed
  const rows = await q(`select action, actor_user_id, actor_role, entity_type, entity_id, summary, details, ip, user_agent from audit_log where id > $1 order by id`, [seedMaxId]);
  const has = (a, f = () => true) => rows.some(r => r.action === a && f(r));
  check('audit: auth.login rows with the actor', has('auth.login', r => r.actor_user_id === 'ADM-001'));
  check('audit: auth.login_failed rows have no actor and no typed identifier', has('auth.login_failed') && rows.filter(r => r.action === 'auth.login_failed').every(r => r.actor_user_id === null && !JSON.stringify(r.details).includes('ASK-1999') && !/identifier/.test(JSON.stringify(r.details))));
  check('audit: auth.password_changed for each role (forced flag recorded)', ['S-001', 'INS-0042', 'ADM-101', 'ADM-001'].every(id => has('auth.password_changed', r => r.actor_user_id === id && r.entity_id === id)) && has('auth.password_changed', r => r.details.forced === true));
  check('audit: auth.password_change_failed for the wrong current password', has('auth.password_change_failed'));
  check('audit: staff.created for both new staff', has('staff.created', r => r.entity_id === ni.json.staff.id) && has('staff.created', r => r.entity_id === nf.json.staff.id));
  check('audit: staff.password_reset by ADM-001 for ADM-101 with mustChange only', has('staff.password_reset', r => r.actor_user_id === 'ADM-001' && r.entity_id === 'ADM-101' && JSON.stringify(r.details) === '{"mustChange":true}'));
  check('audit: registration.submitted / registration.activated rows exist (public actor null, desk actor staff)', has('registration.submitted', r => r.actor_user_id === null) && has('registration.submitted', r => r.actor_user_id === 'ADM-101') && has('registration.activated', r => r.details.issuedTemporary === true && r.entity_id === 'APP-02') && has('registration.activated', r => r.details.issuedTemporary === false && r.details.automatic === true));
  check('audit: API rows carry ip and user agent', rows.filter(r => r.action === 'auth.password_changed').every(r => r.ip && r.user_agent));
  const auditHits = findSecrets((await q(`select summary, details from audit_log`)), plain.concat(['password123']));
  check('audit: no bcrypt hash, JWT or plain/temporary password in any audit row', !auditHits.length, auditHits.join());

  /* ---------- no secrets anywhere in the responses or the server log ---------- */
  const respHits = findSecrets(texts.join('\n'), CHOSEN);
  check('responses: no bcrypt hash, JWT or member-chosen password in any body (temp passwords only in their one-time responses)', !respHits.length && !/password_hash/.test(texts.join('\n')), respHits.join());
  const tempSeen = [rs.json.tempPassword, ni.json.tempPassword, nf.json.tempPassword, a2.json.tempPassword].map(p => texts.filter(x => x.includes(p)).length);
  check('responses: each temporary password appears in exactly one response (the one that created it)', tempSeen.every(n => n === 1), tempSeen.join());
  check('server log: no passwords or hashes', !findSecrets(app.log(), plain.concat(['password123'])).length);

  /* ---------- rate limit (own app instance, CHANGE_PW_RATE_MAX=5) ---------- */
  const lim = await spawnApp({ CHANGE_PW_RATE_MAX: '5' });
  try {
    const lc = await login(lim.base, 'student', 'ASK-2025-1834', 'Another2026pw');   // changed above
    const codes = [];
    const bad = () => lc.post('/auth/change-password', { currentPassword: 'wrong-guess-1', newPassword: 'Another2026pw' });
    codes.push((await bad()).status, (await bad()).status);
    const good = await lc.post('/auth/change-password', { currentPassword: 'Another2026pw', newPassword: 'Sunrise2026', confirmPassword: 'Sunrise2026' });
    codes.push(good.status);
    for (let i = 0; i < 3; i++) codes.push((await bad()).status);
    const last = await bad(); codes.push(last.status);
    check('rate limit: 5 failures allowed, the success is not counted, then 429 RATE_LIMITED', codes.join() === '400,400,200,400,400,400,429' && err(last) === 'RATE_LIMITED', codes.join());
    const other = await login(lim.base, 'student', 'ASK-2026-0102');
    expect('rate limit is per account: another student is not blocked', await other.post('/auth/change-password', { currentPassword: 'wrong-guess-1', newPassword: 'Another2026pw' }), 400, 'CURRENT_PASSWORD_INCORRECT');
  } finally { await lim.stop(); }
} catch (e) { check('suite crashed: ' + e.message, false, e.stack); }
await pg.end();
await app.stop();
t.done();
