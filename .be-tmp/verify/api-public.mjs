// Public endpoints: reference lists, trial bookings, registration with auto-activation. Spawns its own app.
import { spawnApp, resetDb, client, pgConnect, suite } from './lib.mjs';
await resetDb();
const app = await spawnApp();
const S = suite('api-public');
const { check, expect } = S;
try {
  const c = client(app.base);
  const dojos = await c.get('/public/dojos');
  check('GET /public/dojos 12 dojos, no qr_token', dojos.status === 200 && dojos.json.length === 12 && !JSON.stringify(dojos.json).includes('qr'), dojos.text.slice(0, 120));
  const cls = await c.get('/public/classes');
  check('GET /public/classes has HQ rows without private lessons', cls.status === 200 && cls.json.length === 39 && cls.json.every(t => t.mat !== 'Mat B'), `n=${cls.json && cls.json.length}`);
  const clsBedok = await c.get('/public/classes?dojo=bedok');
  check('GET /public/classes?dojo=bedok filters', clsBedok.json.length === 2 && clsBedok.json.every(t => t.dojo === 'bedok'));
  const pk = await c.get('/public/packages');
  check('GET /public/packages adult 4 + kids 3, registration fee 60', pk.json.packages.adult.length === 4 && pk.json.packages.kids.length === 3 && pk.json.policies.registration === 60);

  expect('sessions without date -> 400', await c.get('/public/sessions'), 400, 'VALIDATION_ERROR');
  expect('sessions in the past -> 400', await c.get('/public/sessions?date=2026-10-01'), 400, 'INVALID_DATE');
  expect('sessions far ahead -> 400', await c.get('/public/sessions?date=2027-03-01'), 400, 'INVALID_DATE');
  const s = await c.get('/public/sessions?date=2026-11-09');
  check('sessions on Mon 9 Nov: 3 HQ classes (no private)', s.status === 200 && s.json.sessions.length === 3, s.text.slice(0, 200));
  const adults = s.json.sessions.find(x => x.type === 'Adults'), kids = s.json.sessions.find(x => x.kids);
  const sat = await c.get('/public/sessions?date=2026-11-14');
  check('sessions Sat has no private lesson', sat.json.sessions.every(x => x.type !== 'Intermediate' || x.cap > 1));

  // ---- trial booking
  const base = { name: 'Test Guest', mobile: '9123 0000', email: 'guest.one@example.com', passId: 'trial', overseas: false, who: 'Adult', date: '2026-11-09', lessonId: adults.lessonId, waiverSigner: 'Test Guest' };
  expect('trial: unknown field -> 400', await c.post('/public/trial-bookings', { ...base, amount: 1 }), 400, 'VALIDATION_ERROR');
  expect('trial: bad email -> 400', await c.post('/public/trial-bookings', { ...base, email: 'nope' }), 400, 'VALIDATION_ERROR');
  expect('trial: kid in adult class when who=Child -> 409', await c.post('/public/trial-bookings', { ...base, who: 'Child' }), 409, 'NOT_ELIGIBLE');
  expect('trial: adult in kids class -> 409', await c.post('/public/trial-bookings', { ...base, lessonId: kids.lessonId }), 409, 'NOT_ELIGIBLE');
  expect('trial: missing class -> 400', await c.post('/public/trial-bookings', { ...base, lessonId: undefined }), 400, 'VALIDATION_ERROR');
  expect('trial: lesson on another date -> 404', await c.post('/public/trial-bookings', { ...base, date: '2026-11-10' }), 404, 'CLASS_NOT_FOUND');
  const ok = await c.post('/public/trial-bookings', { ...base, amount: undefined });
  check('trial booking created, price 29 from the server', ok.status === 201 && ok.json.amount === 29 && /^GP-\d+$/.test(ok.json.reference) && ok.json.lessonId === adults.lessonId, ok.text.slice(0, 200));
  expect('trial twice per person -> 409', await c.post('/public/trial-bookings', { ...base }), 409, 'TRIAL_USED');
  expect('guest email of a student -> 409', await c.post('/public/trial-bookings', { ...base, email: 'lervyn@email.com', passId: 'single' }), 409, 'EMAIL_IN_USE');
  const ov = await c.post('/public/trial-bookings', { ...base, email: 'overseas@example.com', passId: 'omonth', overseas: true, lessonId: undefined });
  check('overseas month pass 350 stored as month', ov.status === 201 && ov.json.amount === 350 && ov.json.passType === 'month', ov.text.slice(0, 200));
  const wk = await c.post('/public/trial-bookings', { ...base, email: 'week@example.com', passId: 'week', lessonId: undefined });
  check('1-week pass is 150', wk.status === 201 && wk.json.amount === 150);
  const pv = await c.post('/public/trial-bookings', { ...base, email: 'priv@example.com', passId: 'private', lessonId: undefined, time: '14:00' });
  check('private class 120, time kept out of the db', pv.status === 201 && pv.json.amount === 120);
  expect('private class needs a time', await c.post('/public/trial-bookings', { ...base, email: 'priv2@example.com', passId: 'private', lessonId: undefined }), 400, 'VALIDATION_ERROR');
  const pg = await pgConnect();
  const g = (await pg.query(`select u.role, u.password_hash, gp.full_name, p.pass_type, p.amount_paid, (select count(*)::int from class_attendance a where a.user_id = u.id and a.booked_via = 'online') as bookings
                              from users u join guest_profile gp on gp.user_id = u.id join guest_pass p on p.user_id = u.id where u.email = 'guest.one@example.com'`)).rows[0];
  check('guest row: role guest, pass trial amount 29, one booking', g && g.role === 'guest' && g.pass_type === 'trial' && Number(g.amount_paid) === 29 && g.bookings === 1, JSON.stringify(g));
  const lg = await client(app.base).post('/auth/login', { portal: 'student', identifier: 'guest.one@example.com', password: 'x' });
  check('guest cannot sign in', lg.status === 401);

  // ---- registration
  const reg = {
    name: 'Nora Fresh', dojoId: 'hq', age: 28, dob: '1998-05-05', gender: 'Female', nationality: 'Singaporean', phone: '9000 1111', email: 'nora.fresh@example.com',
    emergencyContact: 'Sam Fresh (Brother) · 9000 2222', priorExperience: null, previousMember: false, medical: null,
    dogi: { type: 'Cotton (Standard)', size: '3' }, packageId: 'a25', signer: 'Nora Fresh', signatureProvided: true, password: 'Sunrise2026', confirmPassword: 'Sunrise2026'
  };
  expect('register: client total ignored (strict) -> 400', await c.post('/public/registrations', { ...reg, total: 1 }), 400, 'VALIDATION_ERROR');
  expect('register: closed dojo -> 400', await c.post('/public/registrations', { ...reg, dojoId: 'tampineswest' }), 400, 'INVALID_DOJO');
  expect('register: kids package for an adult -> 400', await c.post('/public/registrations', { ...reg, packageId: 'k1' }), 400, 'INVALID_PACKAGE');
  expect('register: existing email -> 409', await c.post('/public/registrations', { ...reg, email: 'lervyn@email.com' }), 409, 'EMAIL_IN_USE');
  const r1 = await c.post('/public/registrations', reg);
  check('register: auto-activated, total = 60+48+30+600 = 738', r1.status === 201 && r1.json.activated === true && r1.json.total === 738 && /^ASK-2026-\d{4}$/.test(r1.json.memberNo) && !r1.text.includes('assword'), r1.text.slice(0, 250));
  const rows = (await pg.query(`select a.status, a.amount_paid, (select count(*)::int from application_checklist c where c.application_id = a.id and c.done) as done, (select count(*)::int from application_checklist c where c.application_id = a.id) as n
                                  from registration_application a where a.id = $1`, [r1.json.applicationId])).rows[0];
  check('application Approved with 4 checklist rows all done (adult has no guardian rule)', rows.status === 'Approved' && rows.n === 4 && rows.done === 4, JSON.stringify(rows));
  const acct = (await pg.query(`select sp.user_id, sp.rank_id, sp.joined_on::text as joined, m.account_status, (select count(*)::int from payment p where p.user_id = sp.user_id) as pays,
                                       (select sum(amount) from payment p where p.user_id = sp.user_id) as paid, (select count(*)::int from student_package k where k.user_id = sp.user_id and k.lessons_left = 25) as pk,
                                       (select count(*)::int from equipment_order e where e.user_id = sp.user_id) as eq
                                  from student_profile sp join membership m on m.user_id = sp.user_id where sp.member_no = $1`, [r1.json.memberNo])).rows[0];
  check('account created: 6th Kyu, joined today, Active, 4 payments = 738, 25-lesson pack, dogi order', acct && acct.rank_id === '6k' && acct.joined === '2026-11-06' && acct.account_status === 'Active' && acct.pays === 4 && Number(acct.paid) === 738 && acct.pk === 1 && acct.eq === 1, JSON.stringify(acct));
  const sh = (await pg.query(`select password_hash from users where id = $1`, [acct.user_id])).rows[0].password_hash;
  check('new account has a bcrypt hash and the public response never carries a password', /^\$2[aby]\$/.test(sh));

  // senior discount: age 70 on 25 lessons: 600*0.6 = 360 -> 60+48+30+360
  const r2 = await c.post('/public/registrations', { ...reg, name: 'Old Timer', email: 'old.timer@example.com', age: 70, dob: '1956-01-01', dogi: { type: 'Competition Grade', size: '4' } });
  check('senior 40% discount applied: 60+48+60+360 = 528', r2.status === 201 && r2.json.total === 528, r2.text.slice(0, 200));

  // child needs a guardian signature different from the child
  const kid = { ...reg, name: 'Kid One', email: 'kid.one@example.com', age: 9, dob: '2017-01-01', packageId: 'k1', signer: 'Kid One', signatureProvided: true };
  const r3 = await c.post('/public/registrations', kid);
  check('child signed by the child: not activated, guardian check open', r3.status === 201 && r3.json.activated === false && r3.json.status === 'Submitted' && r3.json.memberNo === null, r3.text.slice(0, 200));
  const open = (await pg.query(`select c.rule_id, c.done from application_checklist c where c.application_id = $1 order by 1`, [r3.json.applicationId])).rows;
  check('child application has 5 checklist rows, only guardian not done', open.length === 5 && open.filter(x => !x.done).map(x => x.rule_id).join() === 'guardian', JSON.stringify(open));
  const r4 = await c.post('/public/registrations', { ...kid, name: 'Kid Two', email: 'kid.two@example.com', signer: 'Mum Two (parent/guardian)' });
  check('child with a guardian signer is activated; kids package price 150', r4.status === 201 && r4.json.activated === true && r4.json.total === 60 + 48 + 30 + 150, r4.text.slice(0, 200));
  const kidRow = (await pg.query(`select sp.age_group, sp.guardian_name from student_profile sp where sp.member_no = $1`, [r4.json.memberNo])).rows[0];
  check('child profile: Child, guardian name without the suffix', kidRow.age_group === 'Child' && kidRow.guardian_name === 'Mum Two', JSON.stringify(kidRow));
  // disabled rule: turning "guardian" off lets r3-like applications pass
  await pg.query(`update auto_activation_rule set enabled = false where id = 'guardian'`);
  const r5 = await c.post('/public/registrations', { ...kid, name: 'Kid Three', email: 'kid.three@example.com' });
  check('rule disabled -> child activated without a guardian', r5.json.activated === true);
  await pg.query(`update auto_activation_rule set enabled = true where id = 'guardian'`);
  // unsigned consent keeps the application waiting
  const r6 = await c.post('/public/registrations', { ...reg, name: 'No Sign', email: 'no.sign@example.com', signatureProvided: false });
  check('no signature -> waits for the desk', r6.json.activated === false && r6.json.status === 'Submitted');
  // the new member can sign in only with a password nobody was given: wrong password rejected
  const lg2 = await client(app.base).post('/auth/login', { portal: 'student', identifier: r1.json.memberNo, password: 'password123' });
  check('new member does not get the demo password', lg2.status === 401);
  await pg.end();
} catch (e) { check('suite crashed: ' + e.message, false, e.stack); }
await app.stop();
S.done();
