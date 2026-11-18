// Auth + meta + reference API checks. Needs db.mjs running and the DB reset. Starts its own app instances.
import { spawnApp, client, login, ACCOUNTS, suite, pgConnect, resetDb } from './lib.mjs';
import { spawn } from 'node:child_process';
import { ROOT, appEnv, freePort } from './lib.mjs';

const t = suite('api-auth');
await resetDb();
const app = await spawnApp();
const base = app.base;
const allText = [];
const track = r => { allText.push(r.text); return r; };

try {
  // ---- success for the four demo accounts
  for (const [name, [portal, id]] of Object.entries(ACCOUNTS)) {
    const c = client(base);
    const r = track(await c.post('/auth/login', { portal, identifier: id, password: 'password123' }));
    t.check(`login ok: ${name} (${id})`, r.status === 200 && r.json.user && r.json.user.role === (portal === 'admin' ? 'admin' : portal), `${r.status} ${r.text.slice(0, 120)}`);
    const me = track(await c.get('/auth/me'));
    t.check(`/auth/me after login: ${name}`, me.status === 200 && me.json.id === r.json.user.id && me.json.name, me.text.slice(0, 120));
    if (name === 'business') t.check('business admin: adminType business, label', me.json.adminType === 'business' && /Business Admin/.test(me.json.label), me.text);
    if (name === 'frontdesk') t.check('front desk: adminType frontdesk, label', me.json.adminType === 'frontdesk' && /Front desk/.test(me.json.label), me.text);
    if (name === 'student') t.check('student me: member no, rank, group, age', me.json.memberNo === 'ASK-2025-1834' && me.json.rank === '4th Kyu' && me.json.group === 'adult' && me.json.age >= 18, me.text);
    if (name === 'instructor') t.check('instructor me: Bob Tan Sensei', me.json.name === 'Bob Tan Sensei', me.text);
  }
  // student by email, lower-case member no
  t.expect('student login by email', track(await client(base).post('/auth/login', { portal: 'student', identifier: 'lervyn@email.com', password: 'password123' })), 200);
  t.expect('student login by member no (lower case)', track(await client(base).post('/auth/login', { portal: 'student', identifier: 'ask-2025-1834', password: 'password123' })), 200);
  t.expect('admin login by id (lower case)', track(await client(base).post('/auth/login', { portal: 'admin', identifier: 'adm-001', password: 'password123' })), 200);

  // ---- failures are generic
  const wrongPw = track(await client(base).post('/auth/login', { portal: 'student', identifier: 'ASK-2025-1834', password: 'nope' }));
  const noUser = track(await client(base).post('/auth/login', { portal: 'student', identifier: 'ASK-1999-0000', password: 'nope' }));
  t.expect('wrong password -> 401 INVALID_CREDENTIALS', wrongPw, 401, 'INVALID_CREDENTIALS');
  t.expect('unknown user -> 401 INVALID_CREDENTIALS', noUser, 401, 'INVALID_CREDENTIALS');
  t.check('wrong password and unknown user give the same message', wrongPw.json.error.message === noUser.json.error.message);
  t.expect('student id on the admin portal -> 401', track(await client(base).post('/auth/login', { portal: 'admin', identifier: 'ASK-2025-1834', password: 'password123' })), 401, 'INVALID_CREDENTIALS');
  t.expect('admin id on the student portal -> 401', track(await client(base).post('/auth/login', { portal: 'student', identifier: 'ADM-001', password: 'password123' })), 401, 'INVALID_CREDENTIALS');
  t.expect('instructor id on the admin portal -> 401', track(await client(base).post('/auth/login', { portal: 'admin', identifier: 'INS-0042', password: 'password123' })), 401, 'INVALID_CREDENTIALS');
  t.expect('guest G-01 cannot sign in (student portal)', track(await client(base).post('/auth/login', { portal: 'student', identifier: 'aisyah@email.com', password: 'password123' })), 401, 'INVALID_CREDENTIALS');
  t.expect('inactive staff ADM-102 with right password -> 403 ACCOUNT_DEACTIVATED', track(await client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-102', password: 'password123' })), 403, 'ACCOUNT_DEACTIVATED');
  t.expect('inactive staff ADM-102 with wrong password -> 401 (state not revealed)', track(await client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-102', password: 'nope' })), 401, 'INVALID_CREDENTIALS');

  // ---- validation, content type
  t.expect('missing password -> 400 VALIDATION_ERROR', track(await client(base).post('/auth/login', { portal: 'student', identifier: 'x' })), 400, 'VALIDATION_ERROR');
  t.expect('unknown field rejected (strict) -> 400', track(await client(base).post('/auth/login', { portal: 'student', identifier: 'x', password: 'y', role: 'admin' })), 400, 'VALIDATION_ERROR');
  t.expect('bad portal -> 400', track(await client(base).post('/auth/login', { portal: 'root', identifier: 'x', password: 'y' })), 400, 'VALIDATION_ERROR');
  t.expect('non-string identifier -> 400', track(await client(base).post('/auth/login', { portal: 'student', identifier: { $ne: 1 }, password: 'y' })), 400, 'VALIDATION_ERROR');
  t.expect('form content type -> 415 JSON_REQUIRED', track(await client(base).api('POST', '/auth/login', undefined, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, rawBody: 'portal=student&identifier=x&password=y' })), 415, 'JSON_REQUIRED');
  t.expect('text/plain content type -> 415', track(await client(base).api('POST', '/auth/login', undefined, { headers: { 'Content-Type': 'text/plain' }, rawBody: '{"portal":"student"}' })), 415, 'JSON_REQUIRED');
  t.expect('no content type on logout -> 415', track(await client(base).api('POST', '/auth/logout', undefined, { noJson: true, rawBody: '' })), 415, 'JSON_REQUIRED');
  t.expect('broken JSON -> 400 BAD_JSON', track(await client(base).api('POST', '/auth/login', undefined, { rawBody: '{"portal":' })), 400, 'BAD_JSON');
  t.expect('unknown API route -> 404 JSON', track(await client(base).get('/nope')), 404, 'NOT_FOUND');

  // ---- me / logout / tokens
  t.expect('/auth/me without cookie -> 401 UNAUTHENTICATED', track(await client(base).get('/auth/me')), 401, 'UNAUTHENTICATED');
  const c = await login(base, 'student', 'ASK-2025-1834');
  const sc = c.rawCookies.find(x => x.startsWith('ask_token='));
  t.check('cookie is HttpOnly', /;\s*HttpOnly/i.test(sc), sc);
  t.check('cookie is SameSite=Lax', /;\s*SameSite=Lax/i.test(sc), sc);
  t.check('cookie is not Secure in development', !/;\s*Secure/i.test(sc), sc);
  t.check('cookie has a max-age', /Max-Age=\d+|Expires=/i.test(sc));
  t.check('login body has no token (cookie only)', !/eyJ/.test(c.loginResult.text));
  const tok = c.jar.ask_token;
  const forged = client(base); forged.jar.ask_token = tok.slice(0, -4) + 'AAAA';
  t.expect('tampered token -> 401', track(await forged.get('/auth/me')), 401);
  const noneAlg = client(base); noneAlg.jar.ask_token = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from('{"sub":"ADM-001","role":"admin"}').toString('base64url') + '.';
  t.expect('alg=none token -> 401', track(await noneAlg.get('/auth/me')), 401);
  const out = track(await c.post('/auth/logout', {}));
  t.check('logout clears the cookie', out.status === 200 && !c.jar.ask_token);
  t.expect('/auth/me after logout -> 401', track(await c.get('/auth/me')), 401);

  // a live session of a staff member that is deactivated afterwards stops working at once
  const staff = await login(base, 'admin', 'ADM-101');
  const pg = await pgConnect();
  await pg.query(`UPDATE staff_profile SET status='inactive' WHERE user_id='ADM-101'`);
  t.expect('deactivated staff session -> 401 ACCOUNT_DEACTIVATED', track(await staff.get('/auth/me')), 401, 'ACCOUNT_DEACTIVATED');
  await pg.query(`UPDATE staff_profile SET status='active' WHERE user_id='ADM-101'`);
  const lastLogin = (await pg.query(`SELECT last_login_at FROM users WHERE id='S-001'`)).rows[0].last_login_at;
  t.check('last_login_at set from the server clock (fake today 2026-11-06)', lastLogin && lastLogin.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }) === '2026-11-06', String(lastLogin));
  await pg.end();

  // ---- forgot password
  const fp = track(await client(base).post('/auth/forgot-password', { identifier: 'lervyn@email.com' }));
  const fp2 = track(await client(base).post('/auth/forgot-password', { identifier: 'nobody@nowhere.example' }));
  t.check('forgot-password is 202 for known and unknown accounts', fp.status === 202 && fp2.status === 202 && fp.text === fp2.text);

  // ---- meta + reference
  const meta = track(await client(base).get('/meta'));
  t.check('/meta today = 2026-11-06 with APP_FAKE_TODAY, fakeToday true', meta.status === 200 && meta.json.today === '2026-11-06' && meta.json.fakeToday === true && meta.json.tz === 'Asia/Singapore', meta.text);
  t.check('/meta now is an ISO instant on the fake date (Singapore)', new Date(meta.json.now).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }) === '2026-11-06', meta.text);
  const ref = track(await client(base).get('/reference'));
  const R = ref.json || {};
  t.check('/reference is public and 200', ref.status === 200);
  t.check('/reference: 12 dojos, HQ first, no qr_token', R.dojos && R.dojos.length === 12 && R.dojos[0].id === 'hq' && !/qr/i.test(JSON.stringify(R.dojos)));
  t.check('/reference: Tampines West is Temporarily closed', (R.dojos || []).find(d => d.id === 'tampineswest').status === 'Temporarily closed');
  t.check('/reference: 7 belts with fees (4th Kyu 50, 1st Dan 120)', R.belts && R.belts.length === 7 && R.belts.find(b => b.g === '4th Kyu').fee === 50 && R.belts.find(b => b.g === '1st Dan').fee === 120);
  t.check('/reference: packages adult 4 / kids 3, prices from DB', R.packages && R.packages.adult.length === 4 && R.packages.kids.length === 3 && R.packages.adult.find(p => p.id === 'a25').amt === 600);
  const a25 = (R.packages.adult || []).find(p => p.id === 'a25'), aun = (R.packages.adult || []).find(p => p.id === 'aun'), a10 = (R.packages.adult || []).find(p => p.id === 'a10');
  t.check('/reference: package labels match data.js (a25, a10, aun)', a25 && a25.t === '25 lessons' && a25.valid === 'Valid 4 months' && a25.per === 'S$24 per lesson' && a25.best === true && a10.valid === 'Valid 11 weeks' && aun.lessons === null && aun.unit === '/ 2 weeks' && aun.per === 'S$48 a week, billed every 2 weeks', JSON.stringify([a25, a10, aun]));
  const k1 = R.packages.kids.find(p => p.id === 'k1');
  t.check('/reference: kids 1-month pass is compassion eligible, 35 days', k1 && k1.compassion === true && k1.days === 35 && k1.t === '1-month pass');
  t.check('/reference: policies', R.policies && R.policies.registration === 60 && R.policies.annualDues === 48 && R.policies.booking.cancelHours === 4 && R.policies.booking.maxPackages === 2 && R.policies.discounts.senior.pct === 40 && R.policies.lateFee === 20, JSON.stringify(R.policies));
  t.check('/reference: HQ timetable 19 weekly rows, no private lessons, Monday 19:00 Adults by Bob', R.timetable && R.timetable.hq.length === 19 && R.timetable.hq.some(x => x.day === 0 && x.time === '19:00' && x.type === 'Adults' && x.ins === 'Bob Tan Sensei') && R.timetable.hq.every(x => x.dojo === 'hq'), String(R.timetable && R.timetable.hq.length));
  t.check('/reference: other dojo timetable rows', R.timetable && R.timetable.other.length === 20 && R.timetable.other.every(x => x.dojo !== 'hq'), String(R.timetable && R.timetable.other.length));
  t.check('/reference: instructors list includes Bob Tan Sensei 6th Dan', (R.instructors || []).some(i => i.name === 'Bob Tan Sensei' && i.dan === '6th Dan') && R.instructors.length >= 18);

  // ---- no password hash anywhere
  const joined = allText.join('\n');
  t.check('no password_hash / bcrypt hash in any response', !/password_hash/i.test(joined) && !/\$2[aby]\$/.test(joined));
  t.check('server log has no password or secret', !/password123|verify-/.test(app.log()), app.log().slice(0, 200));

  // ---- login rate limit (own instance, low limit)
  const lim = await spawnApp({ LOGIN_RATE_MAX: '3' });
  let last;
  for (let i = 0; i < 5; i++) last = await client(lim.base).post('/auth/login', { portal: 'student', identifier: 'x', password: 'y' });
  t.expect('login is rate limited (429 RATE_LIMITED after the limit)', last, 429, 'RATE_LIMITED');
  await lim.stop();

  // ---- production mode
  const prod = await spawnApp({ NODE_ENV: 'production', JWT_SECRET: 'prod-secret-for-verification-only-' + Date.now(), APP_FAKE_TODAY: '2026-11-06' });
  const pm = await client(prod.base).get('/meta');
  const realToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  t.check('production: APP_FAKE_TODAY is ignored (today = real date, fakeToday false)', pm.json.today === realToday && pm.json.fakeToday === false, pm.text);
  const pc = await login(prod.base, 'student', 'ASK-2025-1834');
  const psc = pc.rawCookies.find(x => x.startsWith('ask_token=')) || '';
  t.check('production: cookie is Secure + HttpOnly + SameSite=Lax', /;\s*Secure/i.test(psc) && /HttpOnly/i.test(psc) && /SameSite=Lax/i.test(psc), psc);
  const hdr = (await fetch(prod.base + '/api/v1/meta')).headers;
  t.check('production: helmet headers (CSP, nosniff, HSTS), no x-powered-by', !!hdr.get('content-security-policy') && hdr.get('x-content-type-options') === 'nosniff' && !!hdr.get('strict-transport-security') && !hdr.get('x-powered-by'));
  // the DB error path must not leak details: break the DB by asking for a table that does not exist is not reachable via the API, so check the unknown-error shape through a bad cookie payload instead
  await prod.stop();
  // fail fast without a secret in production
  const port = await freePort();
  const env = appEnv(port, { NODE_ENV: 'production' }); delete env.JWT_SECRET;
  const exit = await new Promise(res => { const p = spawn(process.execPath, ['app.js'], { cwd: ROOT, env, stdio: 'ignore' }); p.on('exit', code => res(code)); setTimeout(() => { p.kill(); res('still running'); }, 8000); });
  t.check('production without JWT_SECRET fails fast (non-zero exit)', exit !== 'still running' && exit !== 0, String(exit));

  // ---- static + redirect
  const root = await fetch(base + '/', { redirect: 'manual' });
  t.check('GET / -> 302 /landingpage/index.html', root.status === 302 && root.headers.get('location') === '/landingpage/index.html');
  const page = await fetch(base + '/landingpage/index.html');
  const csp = page.headers.get('content-security-policy') || '';
  t.check('static page served with a CSP that does not allow inline scripts wholesale', page.status === 200 && /script-src 'self' 'sha256-/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp.replace(/script-src-attr[^;]*/, '')), csp.slice(0, 200));
} finally {
  await app.stop();
}
t.done();
