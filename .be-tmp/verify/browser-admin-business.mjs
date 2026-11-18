// Browser run (headless Edge): the Business Admin pages as ADM-001 (and the front desk ADM-101 being sent back), against the real API + seed.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect, client, login } from './lib.mjs';
import { launch, newPage, settle, signInStaff, signInStudent, storageDump, SCREENS } from './browser-lib.mjs';
const t = suite('browser-admin-business');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const go = async (page, file) => { await page.goto(`${base}/admin_portal/${file}`); await settle(page); await page.waitForTimeout(800); };
const shown = page => page.evaluate(() => document.body.classList.contains('ok'));
const toastText = page => page.locator('#toasts .toast').allInnerTexts().then(a => a.join(' | '));
let applyPol = async () => {};   // set once the Business Admin page exists
const BA_PAGES = ['index.html', 'sessions.html', 'insights.html', 'revenue.html', 'reports.html', 'policies.html', 'staff.html', 'imports.html', 'grading.html', 'notify.html'];
// fixtures
await pg.query(`INSERT INTO class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity) VALUES ('LS-BB-1', 'hq', '2026-12-08', '15:00', '16:00', 'Mat C', 'Adults', 'INS-0042', 20)`);
const PK = (await q(`select id from student_package where user_id = 'S-001' and status = 'Active' order by expires_at, id limit 1`))[0].id;
await pg.query(`INSERT INTO class_attendance (lesson_id, user_id, attendance_status, student_package_id, booked_via) VALUES ('LS-BB-1', 'S-001', 'Booked', $1, 'online')`, [PK]);
await pg.query(`UPDATE student_package SET lessons_left = lessons_left - 1 WHERE id = $1`, [PK]);
await pg.query(`INSERT INTO grading_application (id, user_id, from_rank_id, to_rank_id, session_id, status) VALUES ('GA-BB1', 'S-020', '4k', '3k', NULL, 'Submitted')`);
const left = async () => Number((await q(`select lessons_left l from student_package where id = $1`, [PK]))[0].l);
try {
  // ---------- every Business Admin page, 1280 and 390
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStaff(page, base, 'admin', 'ADM-001');
    for (const f of BA_PAGES) {
      await go(page, f);
      t.check(`Business Admin ${f} @${width}: page shown (body.ok) and not an error box`, (await shown(page)) && !(await page.locator('[role="alert"]').count()), page.url());
    }
    // tabs on the pages that have them
    await go(page, 'insights.html');
    for (const tab of ['centres', 'capacity', 'attention', 'retention', 'experience', 'interventions']) { await page.click(`#insTabs [data-it="${tab}"]`); await page.waitForTimeout(250); t.check(`insights tab ${tab} @${width}: has content`, (await page.locator('#insBody').innerText()).length > 20); }
    await go(page, 'policies.html');
    for (const tab of ['prices', 'booking', 'activation', 'methods', 'templates', 'triggers']) { await page.click(`#polTabs [data-pt="${tab}"]`); await page.waitForTimeout(200); t.check(`policies tab ${tab} @${width}: has content`, (await page.locator('#polBody').innerText()).length > 20); }
    await go(page, 'sessions.html');
    for (const tab of ['timetable', 'closures', 'rosters']) { await page.click(`#clsTabs [data-tab="${tab}"]`); await page.waitForTimeout(300); }
    const s = await storageDump(page);
    t.check(`Business Admin @${width}: no ask-prototype / ask-role / ask-admin keys and no business data in storage`, ![...s.local, ...s.session].some(k => /ask-prototype|ask-role|ask-admin|ask-last-id/.test(k)) && !/ASK-20|S-0\d\d|eyJ|Grace Lim/.test(s.localValues + s.sessionValues), JSON.stringify(s));
    clean(`Business Admin pages @${width}`, problems);
    if (width === 1280) { await go(page, 'index.html'); await page.screenshot({ path: path.join(SCREENS, 'admin-business-overview-1280.png') }); }
    await ctx.close();
  }
  // ---------- front desk is sent back from every Business Admin page with the toast
  {
    const { ctx, page, problems } = await newPage(browser, base, { allow: [/403/] });
    await signInStaff(page, base, 'admin', 'ADM-101');
    for (const f of ['insights.html', 'revenue.html', 'reports.html', 'policies.html', 'staff.html', 'imports.html', 'grading.html']) {
      await page.goto(`${base}/admin_portal/${f}`); await settle(page);
      /* the guard redirects to index.html?baonly, then the toast appears once that page has booted: wait for it instead of a fixed delay */
      await page.waitForURL(/admin_portal\/index\.html/, { timeout: 10000 }).catch(() => {});
      await page.locator('#toasts .toast', { hasText: 'That page is for Business Admins' }).first().waitFor({ timeout: 10000 }).catch(() => {});
      t.check(`front desk ${f}: sent back to the front desk home with the "Business Admins" message`, /admin_portal\/index\.html/.test(page.url()) && /That page is for Business Admins/.test(await toastText(page)), `${page.url()} ${await toastText(page)}`);
    }
    await go(page, 'sessions.html');
    t.check('front desk sessions: no Timetable or Closures tab and no timetable/closure markup in the page', (await page.locator('#clsTabs [data-tab="timetable"], #clsTabs [data-tab="closures"], #sesRows, #clForm').count()) === 0);
    await go(page, 'notify.html');
    t.check('front desk notify: only HQ class and One student (the wider audiences are removed from the page)', (await page.locator('#audSeg input').count()) === 2 && (await page.locator('#n-tpl option[value="own"]').count()) === 0);
    clean('front desk pages', problems);
    await ctx.close();
  }

  // ---------- Business Admin flows at 1280
  const B = await newPage(browser, base, { width: 1280, allow: [/status of 409/, /status of 400/, /status of 404/, /^40[049] /] }), ba = B.page;   // the refusals this run provokes on purpose
  await signInStaff(ba, base, 'admin', 'ADM-001');
  applyPol = async () => { await ba.click('#polGo'); await ba.waitForSelector('#modal.open', { state: 'detached' }); await ba.waitForTimeout(500); };

  // overview: the figures are the server's
  await go(ba, 'index.html');
  const ovSql = (await q(`select (select count(*) from membership where account_status = 'Active')::int a, (select count(*) from student_profile)::int n`))[0];
  const stats = await ba.locator('#baStats').innerText();
  t.check(`overview: ${ovSql.a} active members and ${ovSql.n} in total (equal SELECT count)`, stats.includes(String(ovSql.a)) && stats.includes(`${ovSql.n} members in total`), stats);
  t.check('overview: centres at a glance lists HQ and the waiting list shows the pending promotions (2)', /ASK Headquarters Dojo/.test(await ba.locator('#baCentres').innerText()) && /2 results signed by examiners/.test(await ba.locator('#baWaiting').innerText()), await ba.locator('#baWaiting').innerText());
  await ba.selectOption('#baPeriod', '365'); await ba.waitForTimeout(700);
  t.check('overview: changing the period reloads the figures from the server', /in the last 12 months/.test(await ba.locator('#baStats').innerText()));
  await ba.click('#baView [data-bv="today"]'); await ba.waitForTimeout(300);
  t.check('overview: "Today at HQ" shows the desk home', await ba.locator('#fdHome').isVisible());
  await ba.click('#baView [data-bv="org"]');

  // staff: change ADM-101's role and back, create an account, reset a password, self protection
  await go(ba, 'staff.html');
  const staffN = (await q('select (select count(*) from staff_profile) + (select count(*) from instructor_profile) n'))[0].n;
  t.check(`staff: the table lists every staff and instructor account (${staffN}, equals SELECT count)`, (await ba.locator('#stfRows tr').count()) === Number(staffN));
  await ba.click('[data-stf="ADM-001"]'); await ba.waitForSelector('#drawer');
  t.check('staff: your own account: the role is locked, Deactivate is disabled and says why', (await ba.locator('#stf-role input:disabled').count()) === 2 && (await ba.locator('#stf-off:disabled').count()) === 1 && /cannot change your own role|last Business Admin keeps/.test(await ba.locator('#drawer').innerText()));
  await ba.keyboard.press('Escape'); await ba.waitForTimeout(300);
  await ba.click('[data-stf="ADM-101"]'); await ba.waitForSelector('#stf-saverole');
  await ba.click('label[for="sr2"]'); await ba.click('#stf-saverole'); await ba.waitForTimeout(900);
  t.check('staff: Daniel Ong is now a Business Admin (db) and the table says so', (await q(`select admin_type t from staff_profile where user_id = 'ADM-101'`))[0].t === 'business' && /Business Admin/.test(await ba.locator('#stfRows tr:has-text("ADM-101")').innerText()));
  await ba.click('[data-stf="ADM-101"]'); await ba.waitForSelector('#stf-saverole');
  await ba.click('label[for="sr1"]'); await ba.click('#stf-saverole'); await ba.waitForTimeout(900);
  t.check('staff: the role is restored to Front desk (db)', (await q(`select admin_type t from staff_profile where user_id = 'ADM-101'`))[0].t === 'frontdesk');
  await ba.click('#stfNew'); await ba.fill('#sc-name', 'Browser Hana'); await ba.fill('#sc-email', 'browser.hana@askdojo.example'); await ba.click('label[for="sc2"]'); await ba.click('#stfForm button[type="submit"]');
  await ba.waitForSelector('#newStaffId', { timeout: 6000 }).catch(async () => { console.log('DEBUG staff create:', await toastText(ba), '|', await ba.locator('#modalBody').innerText()); throw new Error('no #newStaffId'); });
  const newId = await ba.locator('#newStaffId').innerText(), newPw = await ba.locator('#newStaffPw').innerText();
  t.check('staff: creating a front desk account shows the ID (ADM-103) and a temporary password once; the new account can sign in', newId === 'ADM-103' && newPw.length >= 10 && (await client(base).post('/auth/login', { portal: 'admin', identifier: newId, password: newPw })).status === 200, `${newId} ${newPw}`);
  await ba.click('#modalBody [data-close]'); await ba.waitForTimeout(400);
  await ba.screenshot({ path: path.join(SCREENS, 'admin-business-staff-1280.png') });
  await ba.click('[data-stf="ADM-103"]'); await ba.waitForSelector('#stf-reset'); await ba.click('#stf-reset'); await ba.waitForSelector('#stf-pw');
  const pw2 = await ba.locator('#stf-pw').innerText();
  t.check('staff: Reset password shows the new temporary password in the drawer (once); the old one stops working', pw2 !== newPw && (await client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-103', password: newPw })).status === 401 && (await client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-103', password: pw2 })).status === 200);
  await ba.click('#stf-off'); await ba.waitForTimeout(900);
  t.check('staff: deactivating ADM-103 is saved (db) and the account can no longer sign in', (await q(`select status s from staff_profile where user_id = 'ADM-103'`))[0].s === 'inactive' && (await client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-103', password: pw2 })).status === 403 && /Deactivated/.test(await ba.locator('#stfRows tr:has-text("ADM-103")').innerText()));
  await ba.click('[data-stf="ADM-103"]'); await ba.waitForSelector('#stf-on'); await ba.click('#stf-on'); await ba.waitForTimeout(900);
  t.check('staff: reactivating works', (await q(`select status s from staff_profile where user_id = 'ADM-103'`))[0].s === 'active');

  // policies: an edit persists after a reload and changes the price a student pays
  await go(ba, 'policies.html');
  await ba.fill('#p-dues', '55'); await ba.click('#polForm button[type="submit"]'); await ba.waitForSelector('#polGo');
  t.check('policies: the confirmation shows what changes (Annual dues S$48 to S$55)', /Annual dues/.test(await ba.locator('#modalBody').innerText()) && /48/.test(await ba.locator('#modalBody').innerText()) && /55/.test(await ba.locator('#modalBody').innerText()));
  await applyPol();
  t.check('policies: saved in the db (annual_dues = 55)', (await q(`select value_text v from policy_setting where setting_key = 'annual_dues'`))[0].v === '55');
  await go(ba, 'policies.html');
  t.check('policies: after a reload the page shows 55', (await ba.inputValue('#p-dues')) === '55');
  await ba.fill('#p-dues', '48'); await ba.click('#polForm button[type="submit"]'); await ba.waitForSelector('#polGo'); await applyPol();
  await ba.fill('#pk-a10', '305'); await ba.click('#polForm button[type="submit"]'); await ba.waitForSelector('#polGo'); await applyPol();
  t.check('policies: the 10-lesson pack price is saved (db package_def)', Number((await q(`select price::float p from package_def where id = 'a10'`))[0].p) === 305);
  await ba.click('#polTabs [data-pt="booking"]'); await ba.fill('#b-cancel', '6'); await ba.click('#polForm button[type="submit"]'); await ba.waitForSelector('#polGo');
  t.check('policies: the booking-rule confirmation names the upcoming bookings that are not changed', /already made are not changed/.test(await ba.locator('#polImpact').innerText()));
  await applyPol();
  t.check('policies: cancel hours saved (6)', (await q(`select value_text v from policy_setting where setting_key = 'cancel_hours'`))[0].v === '6');
  await ba.click('#polTabs [data-pt="triggers"]'); await ba.fill('#t-dec', '30'); await ba.click('#polForm button[type="submit"]');
  await ba.waitForSelector('#modal.open #polGo', { timeout: 6000 }).catch(async () => { console.log('DEBUG triggers:', await toastText(ba), '|', await ba.locator('#polBody').innerText(), '|', await ba.inputValue('#t-dec')); });
  t.check('policies: the trigger confirmation counts the members it would flag (from the server)', /would be on the declining attendance list/.test(await ba.locator('#polImpact').innerText()), await ba.locator('#polImpact').innerText());
  await ba.click('#modalBody [data-close]'); await ba.waitForTimeout(300);
  await ba.click('#polTabs [data-pt="templates"]'); await ba.fill('#t-n-new', 'Browser template'); await ba.fill('#t-t-new', 'Typed in the browser'); await ba.click('#polForm button[type="submit"]'); await ba.waitForSelector('#polGo'); await applyPol();
  t.check('policies: a new notification template is saved (db)', (await q(`select count(*)::int n from notification_template where name = 'Browser template'`))[0].n === 1);
  await ba.click('#polTabs [data-pt="activation"]'); await ba.click('.p-act[data-id="paid"] + span'); await ba.click('#polForm button[type="submit"]'); await ba.waitForSelector('#polGo'); await applyPol();
  t.check('policies: switching the "Registration paid" rule off is saved (db)', (await q(`select enabled e from auto_activation_rule where id = 'paid'`))[0].e === false);
  await ba.screenshot({ path: path.join(SCREENS, 'admin-business-policies-1280.png') });
  // the student now pays the edited price
  {
    const buyer = (await q(`select sp.member_no m from student_profile sp join membership m on m.user_id = sp.user_id where sp.age_group = 'Adult' and m.account_status = 'Active' and sp.user_id <> 'S-001' and (select count(*) from student_package x where x.user_id = sp.user_id and x.status = 'Active') = 0 order by sp.user_id limit 1`))[0].m;
    const S = await login(base, 'student', buyer);
    const r = await S.post('/student/packages', { packageId: 'a10', method: 'Stripe' });
    t.check('policies: a student buying the 10-lesson pack is charged the edited price (S$305)', [200, 201].includes(r.status) && Number((await q(`select amount::float a from payment where kind = 'Package' and student_package_id = '${JSON.parse(r.text).package.id}'`))[0].a) === 305, r.text.slice(0, 120));
  }

  // closures: close HQ for a day (the fixture class has Lervyn's booking), see the lesson come back, then delete the closure
  await go(ba, 'sessions.html');
  await ba.click('#clsTabs [data-tab="closures"]'); await ba.waitForTimeout(300);
  const l0 = await left();
  await ba.fill('#cl-from', '2026-12-08'); await ba.dispatchEvent('#cl-from', 'change'); await ba.waitForTimeout(900);
  t.check('closures: the preview names who is affected (Lervyn Wong) before saving', /Lervyn Wong/.test(await ba.locator('#clAffected').innerText()) && !(await ba.locator('#clSave').isDisabled()), await ba.locator('#clAffected').innerText());
  await ba.fill('#cl-note', 'Browser closure'); await ba.click('#clSave'); await ba.waitForTimeout(1200);
  const cid = (await q(`select id from class_closure where note = 'Browser closure'`))[0].id;
  t.check('closures: saved (db): the day\'s lessons are Cancelled, Lervyn\'s lesson is returned (+1), and it is in the list', (await q(`select count(*)::int n from class_session where closure_id = $1 and status = 'Cancelled'`, [cid]))[0].n >= 1
    && (await left()) === l0 + 1 && /Browser closure/.test(await ba.locator('#clList').innerText()) && /returned/.test(await ba.locator('#clList').innerText()), await ba.locator('#clList').innerText());
  await ba.click('#clTabs, #clsTabs [data-tab="rosters"]'); await ba.waitForTimeout(200); await ba.click('#clsTabs [data-tab="closures"]');
  await ba.click(`[data-clrm="${cid}"]`); await ba.waitForTimeout(900);
  t.check('closures: deleting the closure reopens the lessons; the returned lesson stays returned', (await q(`select count(*)::int n from class_closure where id = $1`, [cid]))[0].n === 0 && (await q(`select status s from class_session where lesson_id = 'LS-BB-1'`))[0].s === 'Scheduled' && (await left()) === l0 + 1);
  // cancel one class
  await ba.click('label[for="cs2"]'); await ba.fill('#cl-from', '2026-12-08'); await ba.dispatchEvent('#cl-from', 'change'); await ba.waitForTimeout(900);
  await ba.selectOption('#cl-cls', 'LS-BB-1'); await ba.dispatchEvent('#cl-cls', 'change'); await ba.waitForTimeout(900);
  await ba.fill('#cl-note', 'Instructor away');
  await ba.click('#clSave'); await ba.waitForTimeout(1200);
  t.check('closures: cancelling one class cancels that class only (no closure row) and returns the lesson once more', (await q(`select status s, closure_id c from class_session where lesson_id = 'LS-BB-1'`))[0].s === 'Cancelled' && (await q(`select count(*)::int n from class_closure where note = 'Instructor away'`))[0].n === 0 && (await left()) === l0 + 1, `${await left()} ${l0}`);
  // timetable: a clash is refused with the reason; a free slot is created and then deleted
  await ba.click('#clsTabs [data-tab="timetable"]'); await ba.waitForTimeout(500);
  const rowsBefore = await ba.locator('#sesRows tr').count();
  t.check('timetable: every weekly class is listed (equals SELECT count of non-private templates)', rowsBefore === Number((await q(`select count(*)::int n from class_template where not is_private`))[0].n), String(rowsBefore));
  await ba.click('#newSession'); await ba.waitForSelector('#sesForm');
  await ba.selectOption('#s-day', '0'); await ba.selectOption('#s-time', '19:00'); await ba.selectOption('#s-mat', 'Mat A'); await ba.selectOption('#s-ins', 'INS-0063'); await ba.click('#sesForm button[type="submit"]'); await ba.waitForTimeout(800);
  t.check('timetable: Monday 7 PM on Mat A is refused with the reason (Mat A is already used) and the form stays open', /Not saved/.test(await toastText(ba)) && /Mat A is already used/.test(await toastText(ba)) && (await ba.locator('#sesForm').count()) === 1, await toastText(ba));
  await ba.selectOption('#s-day', '2'); await ba.selectOption('#s-time', '16:00'); await ba.selectOption('#s-mat', 'Mat B'); await ba.click('#sesForm button[type="submit"]'); await ba.waitForTimeout(1200);
  const made = (await q(`select id, code from class_template where weekday = 2 and start_time = '16:00' and mat = 'Mat B' and instructor_id = 'INS-0063'`))[0];
  t.check('timetable: Wednesday 4 PM on Mat B is created (db: template and 12 dated lessons) and listed', !!made && (await q(`select count(*)::int n from class_session where template_id = $1`, [made.id]))[0].n === 12 && (await ba.locator('#sesRows tr').count()) === rowsBefore + 1 && (await ba.locator(`#sesRows tr:has-text("${made.code}")`).count()) === 1);
  await ba.click(`[data-edit="${made.id}"]`); await ba.waitForSelector('#sesForm'); await ba.fill('#s-cap', '14'); await ba.click('#sesForm button[type="submit"]'); await ba.waitForTimeout(1000);
  t.check('timetable: editing the capacity is saved (db)', (await q(`select capacity c from class_template where id = $1`, [made.id]))[0].c === 14);
  await ba.fill('#sesSearch', 'Wednesday'); await ba.waitForTimeout(300);
  await ba.fill('#sesSearch', '');
  await ba.click(`[data-del="${made.id}"]`); await ba.click('#doDel'); await ba.waitForTimeout(1200);
  t.check('timetable: deleting the class removes it and its lessons (db)', (await q(`select count(*)::int n from class_template where id = $1`, [made.id]))[0].n === 0 && (await q(`select count(*)::int n from class_session where template_id = $1`, [made.id]))[0].n === 0 && (await ba.locator('#sesRows tr').count()) === rowsBefore);
  await ba.screenshot({ path: path.join(SCREENS, 'admin-business-timetable-1280.png') });

  // insights: filters change the table, an intervention is logged
  await go(ba, 'insights.html');
  const dbHq = (await q(`select (sum((select count(*) from class_attendance a where a.lesson_id = s.lesson_id and a.attendance_status in ('Booked','Attended','No-Show'))))::float taken, sum(s.capacity)::float cap
      from class_session s join class_template t on t.id = s.template_id where s.dojo_id = 'hq' and not t.is_private and s.status <> 'Cancelled' and s.session_date between '2026-08-07' and '2026-11-06'`))[0];
  const hqPct = Math.round(dbHq.taken / dbHq.cap * 100);
  t.check(`insights: the HQ bar is ${hqPct}% (equals SELECT seats taken / seats offered over 3 months)`, new RegExp(`ASK Headquarters Dojo[\\s\\S]*${hqPct}%`).test(await ba.locator('#insBody').innerText()), (await ba.locator('#insBody').innerText()).slice(0, 300));
  await ba.selectOption('#f-centre', 'hq'); await ba.waitForTimeout(900);
  t.check('insights: choosing HQ leaves only HQ centres and classes', !/ActiveSG Bishan/.test(await ba.locator('#insBody').innerText()));
  await ba.click('#insTabs [data-it="interventions"]'); await ba.click('#ivNew'); await ba.fill('#iv-name', 'Browser pilot slot'); await ba.fill('#iv-slot', 'Wed 4 PM'); await ba.fill('#iv-before', '4'); await ba.fill('#iv-after', '7'); await ba.click('#ivForm button[type="submit"]'); await ba.waitForTimeout(900);
  t.check('insights: the intervention is saved under the policy_setting key "interventions" and listed (+75%)', JSON.parse((await q(`select value_text v from policy_setting where setting_key = 'interventions'`))[0].v)[0].name === 'Browser pilot slot' && /\+75%/.test(await ba.locator('#ivRows').innerText()));
  await ba.click('#ivRows [data-iv="N-01"][data-d="stop"]'); await ba.waitForTimeout(3000);
  t.check('insights: changing its decision to Stop is saved', JSON.parse((await q(`select value_text v from policy_setting where setting_key = 'interventions'`))[0].v)[0].decision === 'stop');
  await ba.click('#insTabs [data-it="capacity"]'); await ba.click('#planPilot'); await ba.waitForSelector('#sesForm');
  t.check('insights: "Plan a pilot slot" opens the session form with the fullest class copied', /New pilot slot/.test(await ba.locator('#modalTitle').innerText())); await ba.keyboard.press('Escape');
  await ba.screenshot({ path: path.join(SCREENS, 'admin-business-insights-1280.png') });

  // revenue
  await go(ba, 'revenue.html');
  const rsql = (await q(`select coalesce(sum(amount), 0)::float t, count(*)::int n from payment where status = 'Paid' and (paid_at at time zone 'Asia/Singapore')::date between '2026-11-01' and '2026-11-06'`))[0];
  t.check(`revenue: "Received this month" is S$${rsql.t.toLocaleString('en-US')} over ${rsql.n} payments (equals SELECT)`, (await ba.locator('#revTotal').innerText()).replace(/[^0-9.]/g, '') === String(rsql.t) && /(\d+) paid payment/.test(await ba.locator('#revStats').innerText()) && (await ba.locator('#revStats').innerText()).includes(`${rsql.n} paid payment`), await ba.locator('#revStats').innerText());
  t.check('revenue: failed payments lists Marcus Lim (db: one Failed row)', /Marcus Lim/.test(await ba.locator('#revFailed').innerText()));
  await ba.screenshot({ path: path.join(SCREENS, 'admin-business-revenue-1280.png') });
  const [dl] = await Promise.all([ba.waitForEvent('download', { timeout: 8000 }), ba.click('#revExport')]);
  t.check('revenue: Export CSV downloads the file the server names (payments-nov-2026.csv)', dl.suggestedFilename() === 'payments-nov-2026.csv', dl.suggestedFilename());

  // reports
  await go(ba, 'reports.html');
  const n = (await q(`select count(*)::int n from student_profile`))[0].n;
  t.check(`reports: progression says ${n} rows (equals SELECT count)`, (await ba.locator('#rpN-progression').innerText()).startsWith(`${n} rows`), await ba.locator('#rpN-progression').innerText());
  await ba.selectOption('#rp-centre', 'hq'); await ba.waitForTimeout(800);
  const nHq = (await q(`select count(*)::int n from student_profile where dojo_id = 'hq'`))[0].n;
  t.check(`reports: choosing HQ recounts (${nHq} students)`, (await ba.locator('#rpN-progression').innerText()).startsWith(`${nHq} row`), await ba.locator('#rpN-progression').innerText());
  const [dl2] = await Promise.all([ba.waitForEvent('download', { timeout: 8000 }), ba.click('[data-export="attendance"]')]);
  t.check('reports: Export CSV (attendance) downloads a .csv named by the server', /^attendance-nov-2026\.csv$/.test(dl2.suggestedFilename()), dl2.suggestedFilename());

  // imports
  await go(ba, 'imports.html');
  t.check('imports: three open rows (equals SELECT count)', (await ba.locator('#impRows .row').count()) === 3);
  await ba.click('[data-dismiss="I-01"]'); await ba.waitForTimeout(800);
  t.check('imports: dismissing I-01 is saved (db) and two rows are left', (await q(`select status s from import_issue where id = 'I-01'`))[0].s === 'dismissed' && (await ba.locator('#impRows .row').count()) === 2);
  await ba.click('[data-fix="I-02"]'); await ba.waitForSelector('#im-list [data-pick]'); await ba.click('#im-list [data-pick]'); await ba.click('#im-go'); await ba.waitForTimeout(900);
  t.check('imports: fixing I-02 matches a member (db) and one row is left', (await q(`select status s, matched_user_id m from import_issue where id = 'I-02'`))[0].s === 'fixed' && !!(await q(`select matched_user_id m from import_issue where id = 'I-02'`))[0].m && (await ba.locator('#impRows .row').count()) === 1);
  await ba.click('#impTabs [data-f="fixed"]'); await ba.waitForTimeout(200);
  t.check('imports: the Fixed tab shows the matched member number', /matched to ASK-/.test(await ba.locator('#impRows').innerText()));

  // grading: approve, reject, promote, decline
  await go(ba, 'grading.html');
  t.check('grading: waiting applications have Approve and Reject buttons', (await ba.locator('[data-approve="GA-12"]').count()) === 1 && (await ba.locator('[data-reject="GA-BB1"]').count()) === 1);
  await ba.click('[data-approve="GA-12"]'); await ba.waitForTimeout(900);
  t.check('grading: approving GA-12 is saved (db) with ADM-001 as the decider', (await q(`select status s, decided_by d from grading_application where id = 'GA-12'`))[0].s === 'Approved' && (await q(`select decided_by d from grading_application where id = 'GA-12'`))[0].d === 'ADM-001');
  await ba.click('[data-reject="GA-BB1"]'); await ba.waitForSelector('#ga-go'); await ba.click('#ga-go'); await ba.waitForTimeout(500);
  t.check('grading: rejecting without a reason is refused', (await q(`select status s from grading_application where id = 'GA-BB1'`))[0].s === 'Submitted');
  await ba.fill('#ga-note', 'Needs more sessions'); await ba.click('#ga-go'); await ba.waitForTimeout(900);
  t.check('grading: rejecting with a reason is saved (db)', (await q(`select status s, note n from grading_application where id = 'GA-BB1'`))[0].s === 'Rejected');
  await ba.click('#gradTabs [data-g="props"]'); await ba.waitForTimeout(300);
  t.check('grading: the results tab lists the two passes waiting (S-010, S-005) with Approve promotion and Decline', (await ba.locator('[data-promote]').count()) === 2 && (await ba.locator('[data-decline]').count()) === 2);
  await ba.screenshot({ path: path.join(SCREENS, 'admin-business-grading-1280.png') });
  await ba.click('[data-promote="GR-20260927|S-005"]'); await ba.waitForTimeout(1000);
  const s5 = (await q(`select rank_id r, accumulated_hours::float a, weapon_hours::float w, last_passed_grading_date::text d from student_profile where user_id = 'S-005'`))[0];
  t.check('grading: approving the promotion of S-005 moves them to 1st Kyu and restarts the hours toward the next grade (db)', s5.r === '1k' && s5.a === 0 && s5.w === 0 && s5.d === '2026-09-27' && (await ba.locator('[data-promote]').count()) === 1, JSON.stringify(s5));
  await ba.click('[data-decline="GR-20260927|S-010"]'); await ba.waitForTimeout(900);
  t.check('grading: declining S-010 keeps their grade and empties the list (db)', (await q(`select promotion_status p from grading_candidate where session_id = 'GR-20260927' and user_id = 'S-010'`))[0].p === 'Declined' && (await q(`select rank_id r from student_profile where user_id = 'S-010'`))[0].r === '5k' && /No results waiting/.test(await ba.locator('#gradRows').innerText()));
  const st = await newPage(browser, base, { width: 1280 });
  await signInStudent(st.page, base, (await q(`select member_no m from student_profile where user_id = 'S-005'`))[0].m);
  await st.page.goto(base + '/student_portal/index.html'); await settle(st.page); await st.page.waitForTimeout(600);
  t.check('grading: the promoted student\'s home page shows the new grade (1st Kyu)', /1st Kyu/.test(await st.page.locator('body').innerText()));
  clean('student portal after the promotion', st.problems);
  await st.ctx.close();

  // notifications: the Business Admin audiences, the server count in the preview
  await go(ba, 'notify.html');
  t.check('notify: Business Admin has all five audiences and "Write my own message"', (await ba.locator('#audSeg input').count()) === 5 && (await ba.locator('#n-tpl option[value="own"]').count()) === 1);
  await ba.click('label[for="a1"]'); await ba.waitForTimeout(900);
  t.check(`notify: the preview for all members says ${ovSql.n} recipients (from the server)`, new RegExp(`All members · ${ovSql.n} recipients`).test(await ba.locator('#audPreview').innerText()), await ba.locator('#audPreview').innerText());
  await ba.selectOption('#n-tpl', 'own'); await ba.fill('#n-title', 'Browser notice'); await ba.fill('#n-body', 'Typed by the Business Admin');
  await ba.click('#notifyForm button[type="submit"]'); await ba.waitForTimeout(1000);
  t.check('notify: sending writes the sent_log row (ADM-001) and the history shows it', (await q(`select sent_by s from sent_log where title = 'Browser notice'`))[0].s === 'ADM-001' && /Browser notice/.test(await ba.locator('#sentRows').innerText()));
  await ba.click('label[for="a5"]'); await ba.waitForTimeout(800); await ba.selectOption('#n-tpl', 'T-3'); await ba.waitForTimeout(200);
  t.check('notify: One dojo lists the dojos and previews the members of the chosen one', (await ba.locator('#n-target option').count()) === 12 && /recipient/.test(await ba.locator('#audPreview').innerText()));
  clean('Business Admin flows', B.problems);
  await B.ctx.close();
} catch (e) { console.error(e); t.check('script ran to the end', false, e.message); }
finally { try { await pg.end(); } catch (_) { /* closed */ } await browser.close(); await app.stop(); }
t.done();
process.exit(process.exitCode || 0);
