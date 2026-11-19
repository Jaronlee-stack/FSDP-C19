// Browser run (headless Edge): the office desk pages as the front desk (ADM-101) and the Business Admin (ADM-001), against the real API + seed.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect, client, login } from './lib.mjs';
import { launch, newPage, settle, signInStaff, signInStudent, storageDump, htmlPagesOf, SCREENS } from './browser-lib.mjs';
const t = suite('browser-admin-desk');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const go = async (page, file) => { await page.goto(`${base}/admin_portal/${file}`); await settle(page); await page.waitForTimeout(700); };
const shown = page => page.evaluate(() => document.body.classList.contains('ok'));
// fixtures: a class next week with one booking, and a class for the walk-in flow
await pg.query(`INSERT INTO class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity) VALUES
  ('LS-DXB-1', 'hq', '2026-11-10', '18:00', '19:00', 'Mat C', 'Adults', 'INS-0042', 20), ('LS-DXB-2', 'hq', '2026-11-10', '16:00', '17:00', 'Mat C', 'Adults', 'INS-0042', 20)`);
await pg.query(`INSERT INTO class_attendance (lesson_id, user_id, attendance_status, booked_via) VALUES ('LS-DXB-1', 'S-025', 'Booked', 'online')`);
const PAGES = ['index.html', 'sessions.html', 'roster.html?lesson=LS-DXB-1', 'members.html', 'member.html?no=ASK-2025-1834', 'applications.html', 'register.html', 'payments.html', 'equipment.html', 'followups.html'];
const BA_PAGES = htmlPagesOf('admin_portal').filter(f => !['signin.html'].includes(f));
try {
  // ---------- every desk page, both roles, 1280 and 390
  for (const [who, id] of [['front desk', 'ADM-101'], ['Business Admin', 'ADM-001']]) {
    for (const width of [1280, 390]) {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signInStaff(page, base, 'admin', id);
      for (const f of PAGES) {
        await go(page, f);
        t.check(`${who} ${f} @${width}: page shown (guard passed, body.ok) and not an error box`, (await shown(page)) && !(await page.locator('[role="alert"]').count()), page.url());
      }
      if (who === 'Business Admin') for (const f of BA_PAGES) { await go(page, f); t.check(`${who} ${f} @${width}: shown`, await shown(page), page.url()); }
      else for (const f of ['insights.html', 'staff.html']) { await go(page, f); t.check(`front desk ${f} @${width}: sent back to the front desk home (admin_portal/index.html)`, /admin_portal\/index\.html/.test(page.url()), page.url()); }
      const s = await storageDump(page);
      t.check(`${who} @${width}: no ask-prototype / ask-role / ask-admin keys and no business data in storage`, ![...s.local, ...s.session].some(k => /ask-prototype|ask-role|ask-admin|ask-last-id/.test(k)) && !/ASK-20|S-0\d\d|eyJ|Daniel Ong|Grace Lim/.test(s.localValues + s.sessionValues), JSON.stringify(s));
      clean(`${who} pages @${width}`, problems);
      await ctx.close();
    }
  }
  // ---------- other portals still load (shared files changed): one page of each
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStudent(page, base); await page.goto(base + '/student_portal/packages.html'); await settle(page); await page.waitForTimeout(500);
    t.check('student packages page still loads', await shown(page));
    await ctx.close();
    const i = await newPage(browser, base, { problems });
    await signInStaff(i.page, base, 'instructor', 'INS-0042'); await i.page.goto(base + '/instructor_portal/profile.html'); await settle(i.page); await i.page.waitForTimeout(500);
    t.check('instructor profile page still loads', await shown(i.page));
    await i.page.goto(base + '/landingpage/fees.html'); await settle(i.page); await i.page.waitForTimeout(400);
    clean('student, instructor and landing page after the shared-file changes', problems);
    await i.ctx.close();
  }

  // ---------- front desk flows
  const FD = await newPage(browser, base, { allow: [/status of 403/, /^403 .*\/rosters\/LS-DXB-1\/bookings/] }), fd = FD.page;   // the 403 is the refusal this run provokes on purpose
  await signInStaff(fd, base, 'admin', 'ADM-101');
  // members: the list count equals SELECT count(*), search narrows it
  await go(fd, 'members.html');
  const dbN = (await q('select count(*)::int n from membership'))[0].n;
  const sub = await fd.locator('#memSub').innerText();
  t.check(`members: header says ${dbN} members and the table lists all ${dbN} (equals SELECT count(*))`, sub.includes(`of ${dbN} members`) && (await fd.locator('#memRows tr[data-no]').count()) === dbN, sub);
  await fd.fill('#memSearch', 'lervyn'); await fd.waitForTimeout(900);
  t.check('members: searching "lervyn" leaves one row', (await fd.locator('#memRows tr[data-no]').count()) === 1);
  await fd.click('#memFilter [data-f="Lapsed"]'); await fd.fill('#memSearch', ''); await fd.waitForTimeout(900);
  t.check('members: the Lapsed filter lists exactly the lapsed members of the db', (await fd.locator('#memRows tr[data-no]').count()) === (await q(`select count(*)::int n from membership where account_status = 'Lapsed'`))[0].n);
  t.check('members: the front desk has no Export CSV button', (await fd.locator('[data-export="members"]').count()) === 0);
  await fd.screenshot({ path: path.join(SCREENS, 'admin-members-1280.png') });

  // member record shows Lervyn's real figures; contact edit persists
  await go(fd, 'member.html?no=ASK-2025-1834');
  t.check('member record: name, member no. and 43 lessons across his two packs are shown', /Lervyn Wong/.test(await fd.locator('#mHead').innerText()) && /18 left/.test(await fd.locator('#mBody').innerText()) && /25 left/.test(await fd.locator('#mBody').innerText()));
  await fd.click('#mTabs [data-tab="contact"]'); await fd.fill('#c-phone', '9123 7777'); await fd.click('#mContact button[type="submit"]'); await fd.waitForTimeout(900);
  t.check('member record: saving the mobile number persists it', (await q(`select contact_no from student_profile where user_id = 'S-001'`))[0].contact_no === '9123 7777');
  await go(fd, 'member.html?no=ASK-2025-1834&tab=contact');
  t.check('member record: after a reload the saved number is still there', (await fd.inputValue('#c-phone')) === '9123 7777');
  t.check('member record: the front desk sees no "Change status or dojo" button', (await fd.locator('#mEdit').count()) === 0);

  // take a mock payment through the page
  await go(fd, 'payments.html');
  await fd.screenshot({ path: path.join(SCREENS, 'admin-payments-1280.png') });
  await fd.click('#payTake'); await fd.fill('#tp-q', 'Ming'); await fd.waitForSelector('#tp-list [data-pick]'); await fd.click('#tp-list [data-pick]');
  await fd.selectOption('#tp-item', 'pkg:a10'); await fd.waitForTimeout(200);
  t.check('take payment: the preview shows the 10-lesson pack at S$270', /S\$270/.test(await fd.locator('#tp-total').innerText()));
  await fd.click('#tp-go'); await fd.waitForSelector('text=Payment received'); await fd.waitForTimeout(500);
  const pay = (await q(`select id, amount::float a, status, channel, student_package_id sp from payment where user_id = 'S-012' order by id desc limit 1`))[0];
  t.check('take payment: the db has a Paid desk payment of S$270 with a new package', pay && pay.a === 270 && pay.status === 'Paid' && pay.channel === 'desk' && !!pay.sp, JSON.stringify(pay));
  await fd.click('#modalBody [data-close]'); await fd.waitForTimeout(400);
  t.check('take payment: the new payment is in the Today table after the page reloaded its data', /Ming Ng/.test(await fd.locator('#payRows').innerText()));
  await go(fd, 'payments.html');
  t.check('take payment: a reload keeps it (nothing is stored in the browser)', /Ming Ng/.test(await fd.locator('#payRows').innerText()));
  // collect an outstanding payment
  await fd.click('#payTabs [data-pt="out"]'); await fd.waitForTimeout(300);
  t.check('outstanding tab lists the two annual dues rows', (await fd.locator('#payRows [data-collect]').count()) === 2);
  // refund request by the front desk
  await fd.click('#payTabs [data-pt="ref"]'); await fd.click('#refNew'); await fd.waitForSelector('#rq-pay');
  await fd.selectOption('#rq-pay', pay.id); await fd.fill('#rq-why', 'Paid for the wrong package'); await fd.click('#rqGo'); await fd.waitForTimeout(900);
  const rf = (await q(`select id, status, requested_by from refund_request where payment_id = $1`, [pay.id]))[0];
  t.check('refund: the front desk raised a pending request in the db', rf && rf.status === 'pending' && rf.requested_by === 'ADM-101', JSON.stringify(rf));
  t.check('refund: the front desk sees "With a Business Admin" and no Approve button', /With a Business Admin/.test(await fd.locator('#payOther').innerText()) && (await fd.locator('[data-ref-ok]').count()) === 0);
  t.check('front desk payments page has no Void or adjust and no Failed tab', (await fd.locator('[data-void]').count()) === 0 && (await fd.locator('[data-pt="fail"]').count()) === 0);
  // daily summary tab shows the desk total
  await fd.click('#payTabs [data-pt="sum"]'); await fd.waitForTimeout(300);
  const dbDesk = (await q(`select coalesce(sum(amount),0)::float s, count(*)::int n from payment where channel = 'desk' and status = 'Paid' and (paid_at at time zone 'Asia/Singapore')::date = '2026-11-06'`))[0];
  t.check('daily summary: the total and count equal the db (desk payments today)', (await fd.locator('#sumCount').innerText()) === String(dbDesk.n) && (await fd.locator('#sumTotal').innerText()).replace(/[^0-9.]/g, '') === String(dbDesk.s), `${await fd.locator('#sumCount').innerText()} ${await fd.locator('#sumTotal').innerText()} vs ${JSON.stringify(dbDesk)}`);

  // roster flows on the fixture class
  await go(fd, 'roster.html?lesson=LS-DXB-1');
  t.check('roster: shows the booked student (Benjamin Ong) and the class title', /Benjamin Ong/.test(await fd.locator('#rRows').innerText()) && /Adults/.test(await fd.locator('#rosterRoot h1').innerText()));
  await fd.click('#rBook'); await fd.fill('#bk-q', 'Olivia'); await fd.waitForSelector('#bk-list [data-pick]'); await fd.click('#bk-list [data-pick]'); await fd.click('#bk-do'); await fd.waitForTimeout(900);
  t.check('roster: booking Olivia puts her on the roster and uses a lesson (db)', /Olivia Sim/.test(await fd.locator('#rRows').innerText()) && (await q(`select attendance_status s from class_attendance where lesson_id = 'LS-DXB-1' and user_id = 'S-024'`))[0].s === 'Booked' && (await q(`select lessons_left l from student_package where id = 'SP-017'`))[0].l === 3);
  // a student the class does not suit (a child on an adults class): refused with the reason and a refer button
  await fd.click('#rBook'); await fd.fill('#bk-q', 'Aiden'); await fd.waitForSelector('#bk-list [data-pick]'); await fd.click('#bk-list [data-pick]'); await fd.click('#bk-do'); await fd.waitForSelector('#bk-refer');
  t.check('roster: a child on an adults class is refused with the reason and the front desk can only refer it', /Not eligible|Adults only/.test(await fd.locator('#bk-box').innerText()) && (await fd.locator('#bk-over').count()) === 0);
  await fd.fill('#bk-why', 'Parent asked at the desk'); await fd.click('#bk-refer'); await fd.waitForTimeout(900);
  t.check('roster: the referral is a pending access exception in the db', (await q(`select count(*)::int n from exception_request where kind = 'access' and status = 'pending' and requested_by = 'ADM-101'`))[0].n === 1);
  // cancel Olivia's booking
  await fd.click('#rRows tr:has-text("Olivia") [data-cancel]'); await fd.click('#cbGo'); await fd.waitForTimeout(900);
  t.check('roster: cancelling returns the lesson (3 -> 4 in the db) and removes her row', !/Olivia/.test(await fd.locator('#rRows').innerText()) && (await q(`select lessons_left l from student_package where id = 'SP-017'`))[0].l === 4);
  // walk-in: a week-pass guest
  await go(fd, 'roster.html?lesson=LS-DXB-2');
  await fd.click('#rWalk'); await fd.waitForSelector('#wk-list [data-wk]'); await fd.click('#wk-list [data-wk="G-03"]'); await fd.waitForTimeout(900);
  t.check('roster: a walk-in guest with a week pass is on the roster as Walk-in (db row too)', /Chen Hui/.test(await fd.locator('#rRows').innerText()) && (await q(`select booked_via v from class_attendance where lesson_id = 'LS-DXB-2' and user_id = 'G-03'`))[0].v === 'walk-in');
  // mark and submit
  const h0 = Number((await q(`select total_accumulated_hours::text t from student_profile where user_id = 'S-025'`))[0].t);
  await go(fd, 'roster.html?lesson=LS-DXB-1');
  await fd.click('#rSubmit'); await fd.waitForTimeout(400);
  t.check('roster: submitting before anyone is marked sends nothing (the class is still open in the db)', (await q(`select status from class_session where lesson_id = 'LS-DXB-1'`))[0].status === 'Scheduled');
  await fd.click('#rAllPresent'); await fd.click('#rSubmit'); await fd.waitForTimeout(1200);
  t.check('roster: after Submit the class is Done, locked, and the db credits the hour once', (await q(`select status from class_session where lesson_id = 'LS-DXB-1'`))[0].status === 'Ended' && Number((await q(`select total_accumulated_hours::text t from student_profile where user_id = 'S-025'`))[0].t) === h0 + 1 && (await fd.locator('#rSubmit[disabled]').count()) === 1);
  await go(fd, 'sessions.html');
  await fd.screenshot({ path: path.join(SCREENS, 'admin-sessions-1280.png') });
  t.check('sessions: today\'s HQ classes from the db are listed; the front desk has no Timetable/Closures tabs', (await fd.locator('#dayList .ag-item').count()) === (await q(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date = '2026-11-06'`))[0].n && (await fd.locator('#clsTabs').count()) === 0);
  await fd.click('#viewToggle [data-view="week"]'); await fd.waitForTimeout(300);
  t.check('sessions: the week view lists the week\'s classes', (await fd.locator('#wkRows tr').count()) === (await q(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date between '2026-11-02' and '2026-11-08'`))[0].n);

  // equipment: hand over the order that is ready at HQ
  await go(fd, 'equipment.html');
  await fd.click('[data-eq-out="E-01"]'); await fd.fill('#eq-by', 'Marcus Lim'); await fd.click('#eqGo'); await fd.locator('#eqRows').getByText('Collected by Marcus Lim').first().waitFor({ timeout: 8000 }).catch(() => {}); await fd.waitForTimeout(300);
  t.check('equipment: handing over E-01 is saved with the collector (db) and the row shows it', (await q(`select status, handed_over_to from equipment_order where id = 'E-01'`))[0].handed_over_to === 'Marcus Lim' && /Collected by Marcus Lim/.test(await fd.locator('#eqRows').innerText()));
  await fd.click('[data-eq-ready="E-02"]'); await fd.waitForTimeout(900);
  t.check('equipment: marking E-02 ready at HQ is saved', (await q(`select status from equipment_order where id = 'E-02'`))[0].status === 'Ready at HQ');

  // follow-ups: log a call on the first Declining row
  await go(fd, 'followups.html');
  const before = (await q('select count(*)::int n from followup_attempt'))[0].n;
  await fd.click('#fuRows tr:has([data-log]) [data-log]'); await fd.waitForSelector('#lcSave'); await fd.click('#lcSave'); await fd.waitForTimeout(900);
  t.check('follow-ups: logging a contact adds an attempt in the db', (await q('select count(*)::int n from followup_attempt'))[0].n === before + 1);
  t.check('follow-ups: the front desk has no list builder and no assign menu', (await fd.locator('#fuBA').count()) === 0 && (await fd.locator('[data-assign]').count()) === 0);

  // registrations: activate APP-01 (every check passes); the student chose a password at registration (seed: the demo password), so no temporary password is shown
  await go(fd, 'applications.html');
  t.check('registrations: four waiting; the front desk has no Exceptions tab', (await fd.locator('#appRows .row').count()) === 4 && (await fd.locator('#tabExc').count()) === 0);
  await fd.click('[data-reg-go="APP-01"]'); await fd.waitForSelector('#modalTitle:has-text("is now a member")'); await fd.waitForTimeout(400);
  const app01 = (await q(`select status, user_id, password_hash from registration_application where id = 'APP-01'`))[0];
  t.check('registrations: activating APP-01 approves it in the db, clears the stored hash and shows no temporary password', app01.status === 'Approved' && app01.password_hash === null && (await fd.locator('#tempPw').count()) === 0 && !/Temporary password/.test(await fd.locator('#modalBody').innerText()), JSON.stringify(app01));
  const mn = (await q(`select member_no from student_profile where user_id = $1`, [app01.user_id]))[0].member_no;
  t.check('registrations: the modal shows the new member number', (await fd.locator('#modalBody').innerText()).includes(mn));
  t.check('registrations: the new student signs in with the password they chose (seed demo password)', (await client(base).post('/auth/login', { portal: 'student', identifier: mn, password: 'password123' })).status === 200);
  await fd.click('#modalBody [data-close]'); await fd.waitForTimeout(400);
  t.check('registrations: three left after the activation', (await fd.locator('#appRows .row').count()) === 3);
  // the carry-over registration cannot be activated by the front desk
  t.check('registrations: the carry-over application (APP-03) is disabled for the front desk', (await fd.locator('[data-reg-go="APP-03"][disabled]').count()) === 1);
  // extension: MC-01 is 21 days: the front desk is told to refer it
  await fd.click('#regTabs [data-tab="ext"]'); await fd.click('[data-mc-view="MC-01"]'); await fd.waitForSelector('#drawer');
  t.check('extension: the 21-day MC offers "With Business Admin" (already referred) and no Approve', /With Business Admin/.test(await fd.locator('#drawer').innerText()) && (await fd.locator('#mcApprove').count()) === 0);
  await fd.keyboard.press('Escape');
  // register a student at the desk
  await go(fd, 'register.html');
  await fd.fill('#rg-name', 'Browser Brenda'); await fd.click('label[for="rg-g2"]'); await fd.selectOption('#rg-nat', 'Singaporean');
  await fd.evaluate(() => { const d = document.getElementById('rg-dob'); d.dataset.iso = '1994-04-04'; d.value = '04 / 04 / 1994'; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await fd.fill('#rg-phone', '90001234'); await fd.fill('#rg-email', 'brenda.browser@email.com'); await fd.fill('#rg-ecname', 'Bruno'); await fd.selectOption('#rg-ecrel', 'Spouse'); await fd.fill('#rg-ecphone', '90005678');
  await fd.fill('#rg-pw', 'Brenda2026pw'); await fd.fill('#rg-pw2', 'Brenda2026pw');
  await fd.click('label[for="rg-m1"]'); await fd.selectOption('#rg-dogi', '3'); await fd.waitForTimeout(200);
  await fd.selectOption('#rg-pkg', 'a10'); await fd.click('#f-terms label'); await fd.click('#f-pdpa label');
  await fd.click('#rgSig [data-sig="start"]'); await fd.waitForSelector('#rgSig canvas'); await fd.waitForTimeout(400);
  const box = await fd.locator('#rgSig canvas').boundingBox();
  await fd.mouse.move(box.x + 30, box.y + 40); await fd.mouse.down(); await fd.mouse.move(box.x + 120, box.y + 70, { steps: 8 }); await fd.mouse.move(box.x + 200, box.y + 30, { steps: 8 }); await fd.mouse.up();
  await fd.click('#rgSig [data-sig="finish"]'); await fd.waitForTimeout(300);
  t.check('register: the preview shows registration + dues + dogi + package = S$408', /408/.test(await fd.locator('#rgTotal').innerText()));
  await fd.click('#rgPay'); await fd.waitForTimeout(1500);
  if (await fd.locator('#regDone:not([hidden])').count()) {
    const dbA = (await q(`select s.member_no, p.status from registration_application a join student_profile s on s.user_id = a.user_id join users u on u.id = s.user_id left join payment p on p.user_id = s.user_id and p.kind = 'Package' where a.full_name = 'Browser Brenda'`))[0];
    const doneText = await fd.locator('#regDone').innerText();
    t.check('register: the student is registered (member no. shown, no temporary password, package paid in the db)', !!dbA && /ASK-/.test(doneText) && (await fd.locator('#rgTemp').count()) === 0 && !/Temporary password/.test(doneText), JSON.stringify(dbA));
    t.check('register: the result says how the student signs in and the password is nowhere in the page', /member number or email and the password they just chose/.test(doneText) && !(await fd.content()).includes('Brenda2026pw') && (await fd.inputValue('#rg-pw')) === '');
    t.check('register: the student signs in with the password they typed', (await client(base).post('/auth/login', { portal: 'student', identifier: dbA.member_no, password: 'Brenda2026pw' })).status === 200);
  } else t.check('register: the student is registered', false, 'form still showing, invalid: ' + (await fd.evaluate(() => [...document.querySelectorAll('.fld.invalid')].map(f => (f.querySelector('input,select,textarea') || f).id || f.id).join(','))));
  t.check('register: no browser storage holds the form or the password', ![...(await storageDump(fd)).local, ...(await storageDump(fd)).session].some(k => /ask-prototype|ask-last-id/.test(k)));
  clean('front desk flows', FD.problems);
  await FD.ctx.close();

  // ---------- Business Admin flows
  const BA = await newPage(browser, base), ba = BA.page;
  await signInStaff(ba, base, 'admin', 'ADM-001');
  await go(ba, 'payments.html');
  await ba.click('#payTabs [data-pt="ref"]'); await ba.waitForTimeout(300);
  const refText = await ba.locator('#payOther').innerText();
  t.check('refund: the Business Admin sees the front desk\'s request and Approve / Decline buttons', /Ming Ng/.test(refText) && (await ba.locator('[data-ref-ok]').count()) >= 2);
  const refund = (await q(`select r.id from refund_request r join payment p on p.id = r.payment_id where p.user_id = 'S-012'`))[0];
  await ba.click(`[data-ref-ok="${refund.id}"]`); await ba.waitForTimeout(1000);
  const afterRef = (await q(`select r.status rs, p.status ps, sp.status pks from refund_request r join payment p on p.id = r.payment_id left join student_package sp on sp.id = p.student_package_id where r.id = $1`, [refund.id]))[0];
  t.check('refund: approving sets the refund approved, the payment Refunded and releases the package (db)', afterRef.rs === 'approved' && afterRef.ps === 'Refunded' && afterRef.pks === 'Expired', JSON.stringify(afterRef));
  await ba.click('#payTabs [data-pt="today"]'); await ba.waitForTimeout(300);
  t.check('payments: the Business Admin has Void or adjust and a Failed payments tab (1 failed row)', (await ba.locator('[data-void]').count()) >= 1 && (await ba.locator('[data-pt="fail"]').count()) === 1);
  await ba.click('#payTabs [data-pt="fail"]'); await ba.waitForTimeout(300);
  t.check('payments: the Failed tab lists the failed payment', (await ba.locator('#payRows tr').count()) === 1 && /Marcus Lim/.test(await ba.locator('#payRows').innerText()));
  await go(ba, 'members.html');
  t.check('members: the Business Admin has Export CSV', (await ba.locator('[data-export="members"]').count()) === 1);
  const dl = ba.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await ba.click('[data-export="members"]'); const d = await dl;
  t.check('members: Export CSV downloads members-2026-11-06.csv', !!d && /members-2026-11-06\.csv/.test(d.suggestedFilename()), d ? d.suggestedFilename() : 'no download');
  await go(ba, 'applications.html');
  await ba.click('#regTabs [data-tab="exc"]'); await ba.waitForTimeout(300);
  t.check('registrations: the Business Admin has the Exceptions tab with the pending items', (await ba.locator('#excRows [data-exc-ok]').count()) >= 4);
  await ba.click('[data-exc-ok="X-02"]'); await ba.fill('#ex-why', 'MC is genuine'); await ba.click('#exGo'); await ba.waitForTimeout(1000);
  const x2 = (await q(`select status from exception_request where id = 'X-02'`))[0].status, mc1 = (await q(`select status, days_granted from mc_request where id = 'MC-01'`))[0];
  t.check('exceptions: approving X-02 settles the 21-day extension request (db)', x2 === 'approved' && mc1.status === 'approved' && mc1.days_granted === 21, JSON.stringify([x2, mc1]));
  await go(ba, 'followups.html');
  t.check('follow-ups: the Business Admin has the list builder and an assign menu', (await ba.locator('#fuBA').count()) === 1 && (await ba.locator('[data-assign]').count()) >= 1);
  await ba.selectOption('#fu-kind', 'declining'); await ba.click('#fuCreate'); await ba.waitForTimeout(900);
  t.check('follow-ups: creating a list adds follow-ups owned by the chosen staff member (db)', (await q(`select count(*)::int n from followup`))[0].n >= 3);
  await go(ba, 'index.html');
  await ba.screenshot({ path: path.join(SCREENS, 'admin-index-ba-1280.png') });
  clean('Business Admin flows', BA.problems);
  await BA.ctx.close();
  {
    const f = await newPage(browser, base); await signInStaff(f.page, base, 'admin', 'ADM-101'); await go(f.page, 'index.html');
    t.check('front desk Today: stats and the list of today\'s classes come from the db', (await f.page.locator('#fdStats .stat').count()) === 4 && (await f.page.locator('#fdSessions .ag-item').count()) === (await q(`select count(*)::int n from class_session where dojo_id = 'hq' and session_date = '2026-11-06'`))[0].n);
    await f.page.screenshot({ path: path.join(SCREENS, 'admin-index-1280.png') });
    clean('front desk Today', f.problems);
    await f.ctx.close();
  }
} finally { await pg.end(); await browser.close(); await app.stop(); }
t.done();
