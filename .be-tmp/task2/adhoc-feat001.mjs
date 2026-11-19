// Ad-hoc FEAT-001 check (not part of the harness). Needs db.mjs running.
import { spawnApp, client, login, suite, pgConnect, resetDb, sleep } from '../verify/lib.mjs';

const t = suite('feat-001');
await resetDb();
await resetDb();   // twice: re-runnable
const pg = await pgConnect();
const app = await spawnApp();
const base = app.base;
const texts = [];
const tr = r => { texts.push(r.text); return r; };
const errCode = r => r.json && r.json.error && r.json.error.code;

try {
  // ---- schema / seed
  t.check('v_grading_conflict returns 0 rows', (await pg.query('SELECT count(*)::int n FROM v_grading_conflict')).rows[0].n === 0);
  const seeded = (await pg.query(`SELECT count(*)::int n, min(occurred_at) a, max(occurred_at) b FROM audit_log`)).rows[0];
  t.check('seeded audit rows (>= 14) inside 2025-11-06..2027-11-06', seeded.n >= 14 && seeded.a >= new Date('2025-11-06') && seeded.b <= new Date('2027-11-06'), JSON.stringify(seeded));
  for (const [label, sql] of [['UPDATE', `UPDATE audit_log SET summary = 'x'`], ['DELETE', `DELETE FROM audit_log`], ['TRUNCATE', `TRUNCATE audit_log`], ['UPDATE actor to another user', `UPDATE audit_log SET actor_user_id = 'ADM-101' WHERE actor_user_id = 'ADM-001'`]]) {
    let msg = ''; try { await pg.query(sql); } catch (e) { msg = e.message; }
    t.check(`${label} on audit_log is refused`, /append-only/.test(msg), msg);
  }
  const before = (await pg.query('SELECT count(*)::int n FROM audit_log')).rows[0].n;
  await pg.query(`INSERT INTO audit_log (action, summary) VALUES ('auth.login', 'probe')`);
  t.check('INSERT into audit_log works', (await pg.query('SELECT count(*)::int n FROM audit_log')).rows[0].n === before + 1);
  const l = await pg.query(`SELECT accumulated_hours, total_accumulated_hours FROM student_profile WHERE user_id = 'S-001'`);
  t.check('Lervyn 29 accumulated / 56 total', l.rows[0].accumulated_hours === 29 || Number(l.rows[0].accumulated_hours) === 29, JSON.stringify(l.rows[0]));
  const openHash = (await pg.query(`SELECT status, password_hash IS NOT NULL h FROM registration_application ORDER BY id`)).rows;
  t.check('open applications hold a hash, closed ones do not', openHash.every(r => (['Approved', 'Rejected'].includes(r.status)) === !r.h), JSON.stringify(openHash));

  // ---- student grading 29 / 36
  const stu = await login(base, 'student', 'ASK-2025-1834');
  const gr = tr(await stu.get('/student/grading'));
  t.check('GET /student/grading: 29 of 36', gr.status === 200 && /"sessions":29\b/.test(gr.text) && /"needSessions":36\b/.test(gr.text), gr.text.slice(0, 300));
  t.check('session cookie fields: mustChangePassword false in /auth/me', (tr(await stu.get('/auth/me'))).json.mustChangePassword === false);

  // ---- grading notes hidden from students
  const home = tr(await stu.get('/student/home'));
  t.check('student home has no grading remark (RM-06 text absent)', home.status === 200 && !/suwari-waza/.test(home.text) && !/"kind":"grading"/.test(home.text), home.text.slice(0, 100));

  // ---- registration validation
  const reg = {
    name: 'Nora Fresh', dojoId: 'hq', age: 28, dob: '1998-05-05', gender: 'Female', nationality: 'Singaporean', phone: '9000 1111', email: 'nora.fresh@example.com',
    emergencyContact: 'Sam Fresh (Brother) · 9000 2222', priorExperience: null, previousMember: false, medical: null,
    dogi: { type: 'Cotton (Standard)', size: '3' }, packageId: 'a25', signer: 'Nora Fresh', signatureProvided: true
  };
  const pc = client(base);
  const bad = {
    'no password': {}, 'short': { password: 'Ab1', confirmPassword: 'Ab1' }, 'no digit': { password: 'abcdefgh', confirmPassword: 'abcdefgh' },
    'no letter': { password: '12345678', confirmPassword: '12345678' }, 'over 72 bytes': { password: 'a1' + 'x'.repeat(75), confirmPassword: 'a1' + 'x'.repeat(75) },
    'equals email': { password: 'nora.fresh@example.com', confirmPassword: 'nora.fresh@example.com' }, 'mismatch': { password: 'Sunrise2026', confirmPassword: 'Sunrise2027' }
  };
  for (const [k, v] of Object.entries(bad)) t.expect(`register with ${k} -> 400 VALIDATION_ERROR`, tr(await pc.post('/public/registrations', { ...reg, ...v })), 400, 'VALIDATION_ERROR');
  const pw = 'Sunrise2026';
  const ok = tr(await pc.post('/public/registrations', { ...reg, password: pw, confirmPassword: pw }));
  t.check('register with a valid password -> 201 activated, no password/hash in the response', ok.status === 201 && ok.json.activated === true && !/assword|\$2[aby]\$|Sunrise/.test(ok.text), ok.text.slice(0, 200));
  const nora = (await pg.query(`SELECT u.password_hash, u.must_change_password, a.password_hash AS app_hash FROM users u JOIN student_profile sp ON sp.user_id = u.id JOIN registration_application a ON a.user_id = u.id WHERE sp.member_no = $1`, [ok.json.memberNo])).rows[0];
  t.check('users row holds a bcrypt hash, application hash cleared, must_change false', /^\$2[aby]\$/.test(nora.password_hash) && nora.app_hash === null && nora.must_change_password === false, JSON.stringify({ ...nora, password_hash: '[x]' }));
  t.expect('new member signs in with member number + chosen password', tr(await client(base).post('/auth/login', { portal: 'student', identifier: ok.json.memberNo, password: pw })), 200);
  t.expect('new member signs in with email + chosen password', tr(await client(base).post('/auth/login', { portal: 'student', identifier: 'nora.fresh@example.com', password: pw })), 200);
  t.expect('old demo password does not work', tr(await client(base).post('/auth/login', { portal: 'student', identifier: ok.json.memberNo, password: 'password123' })), 401);
  // waiting application: hash stored while pending
  const wait = tr(await pc.post('/public/registrations', { ...reg, name: 'No Sign', email: 'no.sign@example.com', signatureProvided: false, password: pw, confirmPassword: pw }));
  const pend = (await pg.query(`SELECT password_hash FROM registration_application WHERE id = $1`, [wait.json.applicationId])).rows[0];
  t.check('pending application stores a bcrypt hash', wait.json.activated === false && /^\$2[aby]\$/.test(pend.password_hash));
  const desk = await login(base, 'admin', 'ADM-101');
  const list = tr(await desk.get('/admin/applications'));
  t.check('registration list never returns the hash', !/password|\$2[aby]\$/i.test(list.text), list.text.slice(0, 80));
  await pg.query(`UPDATE application_checklist SET done = true WHERE application_id = $1`, [wait.json.applicationId]);
  const act = tr(await desk.post(`/admin/applications/${wait.json.applicationId}/activate`, {}));
  t.check('staff activation: memberNo, no tempPassword', act.status === 200 && act.json.memberNo && act.json.tempPassword === undefined, act.text);
  t.expect('member from staff activation signs in with chosen password', tr(await client(base).post('/auth/login', { portal: 'student', identifier: 'no.sign@example.com', password: pw })), 200);
  t.check('application hash cleared after activation', (await pg.query(`SELECT password_hash FROM registration_application WHERE id = $1`, [wait.json.applicationId])).rows[0].password_hash === null);
  // desk registration (needs password too)
  t.expect('desk registration without password -> 400', tr(await desk.post('/admin/registrations', { ...reg, email: 'desk.one@example.com' })), 400, 'VALIDATION_ERROR');
  const dr = tr(await desk.post('/admin/registrations', { ...reg, email: 'desk.one@example.com', password: pw, confirmPassword: pw }));
  t.check('desk registration with password: 201, no tempPassword', dr.status === 201 && dr.json.tempPassword === undefined && !/Sunrise/.test(dr.text), dr.text.slice(0, 200));

  // ---- fallback: application with no stored hash
  await pg.query(`UPDATE registration_application SET password_hash = NULL WHERE id = 'APP-01'`);
  await pg.query(`UPDATE application_checklist SET done = true WHERE application_id = 'APP-01'`);
  const fb = tr(await desk.post('/admin/applications/APP-01/activate', {}));
  t.check('NULL-hash application: tempPassword returned once', fb.status === 200 && typeof fb.json.tempPassword === 'string', fb.text);
  const m = client(base);
  const ml = tr(await m.post('/auth/login', { portal: 'student', identifier: 'sarah.lee@email.com', password: fb.json.tempPassword }));
  t.check('fallback member signs in with mustChangePassword true', ml.status === 200 && ml.json.user.mustChangePassword === true, ml.text.slice(0, 120));
  t.expect('forced user: /auth/me still works', tr(await m.get('/auth/me')), 200);
  for (const p of ['/student/home', '/student/grading', '/student/profile']) t.expect(`forced user: ${p} -> 403 PASSWORD_CHANGE_REQUIRED`, tr(await m.get(p)), 403, 'PASSWORD_CHANGE_REQUIRED');
  t.expect('forced user: /auth/logout still works', tr(await client(base).post('/auth/logout', {})), 200);

  // ---- change password
  const cur = fb.json.tempPassword;
  t.expect('wrong current -> 400 CURRENT_PASSWORD_INCORRECT', tr(await m.post('/auth/change-password', { currentPassword: 'wrong-pw-1', newPassword: 'Another2026pw' })), 400, 'CURRENT_PASSWORD_INCORRECT');
  t.expect('weak (no digit) -> 400 WEAK_PASSWORD', tr(await m.post('/auth/change-password', { currentPassword: cur, newPassword: 'onlyletters' })), 400, 'WEAK_PASSWORD');
  t.expect('weak (equals email) -> 400 WEAK_PASSWORD', tr(await m.post('/auth/change-password', { currentPassword: cur, newPassword: 'sarah.lee@email.com' })), 400, 'WEAK_PASSWORD');
  t.expect('reused -> 400 PASSWORD_REUSED', tr(await m.post('/auth/change-password', { currentPassword: cur, newPassword: cur + '' })), 400, 'PASSWORD_REUSED');
  t.expect('mismatched confirm -> 400 VALIDATION_ERROR', tr(await m.post('/auth/change-password', { currentPassword: cur, newPassword: 'Another2026pw', confirmPassword: 'Different2026' })), 400, 'VALIDATION_ERROR');
  await sleep(1100);
  const oldJar = { ...m.jar };
  const ch = tr(await m.post('/auth/change-password', { currentPassword: cur, newPassword: 'Another2026pw', confirmPassword: 'Another2026pw' }));
  t.check('change-password ok: 200, user.mustChangePassword false, new cookie set', ch.status === 200 && ch.json.user.mustChangePassword === false && ch.headers.get('set-cookie') && /no-store/.test(ch.headers.get('cache-control') || ''), ch.text.slice(0, 160));
  t.expect('new cookie works on a normal API', tr(await m.get('/student/home')), 200);
  const stale = client(base); stale.jar.ask_token = oldJar.ask_token;
  t.expect('old cookie is dead after the change (SESSION_EXPIRED)', tr(await stale.get('/auth/me')), 401, 'SESSION_EXPIRED');
  t.check('flag cleared in DB', (await pg.query(`SELECT must_change_password m, password_changed_at c FROM users WHERE email = 'sarah.lee@email.com'`)).rows.every(r => r.m === false && r.c));
  t.expect('login with new password', tr(await client(base).post('/auth/login', { portal: 'student', identifier: 'sarah.lee@email.com', password: 'Another2026pw' })), 200);

  // ---- BA reset sets the flag and kills the target's cookie
  const fd = await login(base, 'admin', 'ADM-101');
  const ba = await login(base, 'admin', 'ADM-001');
  await sleep(1100);
  const rs = tr(await ba.post('/admin/staff/ADM-101/reset-password', {}));
  t.check('BA reset returns a temp password', rs.status === 200 && typeof rs.json.tempPassword === 'string', rs.text);
  t.expect("target's old cookie -> 401 SESSION_EXPIRED", tr(await fd.get('/auth/me')), 401, 'SESSION_EXPIRED');
  const fd2 = client(base);
  const fl = tr(await fd2.post('/auth/login', { portal: 'admin', identifier: 'ADM-101', password: rs.json.tempPassword }));
  t.check('reset account signs in with mustChangePassword true', fl.status === 200 && fl.json.user.mustChangePassword === true);
  t.expect('reset account: admin API -> 403 PASSWORD_CHANGE_REQUIRED', tr(await fd2.get('/admin/summary')), 403, 'PASSWORD_CHANGE_REQUIRED');
  const cs = tr(await ba.post('/admin/staff', { name: 'Test Staff', type: 'frontdesk', email: 'test.staff@askdojo.example' }));
  t.check('staff create: 201 with tempPassword and must_change flag set', cs.status === 201 && cs.json.tempPassword && (await pg.query(`SELECT must_change_password m FROM users WHERE email = 'test.staff@askdojo.example'`)).rows[0].m === true, cs.text.slice(0, 120));

  // ---- audit rows written
  const rows = (await pg.query(`SELECT action, actor_user_id, entity_id, details::text d, ip, user_agent FROM audit_log WHERE occurred_at > now() - interval '10 minutes' OR action LIKE 'registration.%' ORDER BY id DESC LIMIT 200`)).rows;
  const has = a => rows.some(r => r.action === a);
  for (const a of ['auth.login', 'auth.login_failed', 'auth.password_changed', 'auth.password_change_failed', 'registration.submitted', 'registration.activated', 'staff.password_reset', 'staff.created']) t.check(`audit row written: ${a}`, has(a));
  t.check('audit rows carry ip and user agent for API actions', rows.filter(r => r.action === 'auth.password_changed').every(r => r.ip && r.user_agent));
  const all = JSON.stringify((await pg.query(`SELECT summary, details FROM audit_log`)).rows);
  t.check('no secret in audit rows (hash, passwords, typed ids)', !/\$2[aby]\$|Sunrise|Another2026|password123|eyJ/.test(all) && !/ASK-1999/.test(all));
  const failedRow = rows.find(r => r.action === 'auth.login_failed' && r.d.includes('"portal"') && r.ip);
  t.check('auth.login_failed has no typed identifier', failedRow && !/identifier/.test(failedRow.d));

  // ---- no secrets in responses or server log
  const joined = texts.join('\n');
  t.check('no bcrypt hash in any response', !/\$2[aby]\$/.test(joined) && !/password_hash/.test(joined));
  t.check('server log has no passwords', !/Sunrise|Another2026|password123/.test(app.log()), app.log().slice(0, 200));

  // ---- rate limit
  const lim = await spawnApp({ CHANGE_PW_RATE_MAX: '3' });
  const lc = await login(lim.base, 'student', 'ASK-2025-1834');
  let last; const codes = [];
  for (let i = 0; i < 5; i++) { last = await lc.post('/auth/change-password', { currentPassword: 'wrong-guess-' + i, newPassword: 'Another2026pw' }); codes.push(last.status); }
  t.check('change-password: 400 x3 then 429 RATE_LIMITED', codes.join() === '400,400,400,429,429' && errCode(last) === 'RATE_LIMITED', codes.join());
  await lim.stop();
} finally {
  await pg.end();
  await app.stop();
}
t.done();
