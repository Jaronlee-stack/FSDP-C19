// Browser run (headless Edge): the student portal and the landing pages against the real API + seed.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect } from './lib.mjs';
import { launch, newPage, settle, signInStudent, storageDump, htmlPagesOf, SCREENS } from './browser-lib.mjs';
const t = suite('browser-student');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const dismiss = async page => { await page.waitForTimeout(1700); await page.evaluate(() => { if (document.querySelector('#modal.open')) closeModal(); }); await page.waitForTimeout(250); };
const STUDENT_PAGES = htmlPagesOf('student_portal').filter(f => f !== 'login.html');
const LANDING_PAGES = htmlPagesOf('landingpage');
try {
  // ---------- every student page, 1280 and 390
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStudent(page, base);
    for (const f of STUDENT_PAGES) {
      await page.goto(`${base}/student_portal/${f}`); await settle(page); await page.waitForTimeout(500);
      t.check(`student ${f} @${width}: page shown (guard passed, body.ok)`, await page.evaluate(() => document.body.classList.contains('ok')));
      if (f === 'checkin.html') t.check('checkin.html @' + width + ': the mock page renders its confirmation card', (await page.locator('#ciDetail').innerHTML()).length > 0);
    }
    const s = await storageDump(page);
    t.check(`student @${width}: no ask-prototype / ask-role / ask-admin keys and no business data in storage`, ![...s.local, ...s.session].some(k => /ask-prototype|ask-role|ask-admin|ask-last-id/.test(k)) && !/Lervyn|ASK-20|eyJ/.test(s.localValues + s.sessionValues));
    clean(`student pages @${width}`, problems);
    await ctx.close();
  }

  // ---------- values on screen equal the database
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStudent(page, base);
    await dismiss(page);
    const left = await q(`select sum(lessons_left)::int n from student_package where user_id = 'S-001' and status = 'Active'`);
    t.check('home: lessons left = 43 (18 + 25) and equals the db', (await page.locator('#hsLessons').innerText()).trim() === String(left[0].n) && left[0].n === 43, await page.locator('#hsLessons').innerText());
    t.check('home: greeting, belt and card come from the account', /Lervyn/.test(await page.locator('#greet').innerText()) && /4th Kyu/.test(await page.locator('#hsBelt').innerText()));
    t.check('home: next belt card shows 29 / 36 sessions toward 3rd Kyu', /29/.test(await page.locator('#nbCount').innerText()) && /3rd Kyu/.test(await page.locator('#nextBelt').innerText()), await page.locator('#nextBelt').innerText());
    t.check('home: notes from instructors list shows the 3 newest of Lervyn\'s notes', (await page.locator('#notesList .note-row').count()) === 3);
    t.check('home: no "Grading note" chip (grading notes are for the examiners only)', !/Grading note/i.test(await page.locator('#notesList').innerText()) && !/On track for the next grading/.test(await page.locator('body').innerText()));
    t.check('home: the membership card says Active and the expiry month', /Active · Expires Jan 2027/.test(await page.locator('#homeMemberCard .st').innerText()), await page.locator('#homeMemberCard .st').innerText());
    await page.screenshot({ path: path.join(SCREENS, 'student-home-1280.png') });
    // standard view
    await page.click('#homeView [data-v="std"]'); await page.waitForTimeout(400);
    t.check('home (standard view): next class is the one booked today, attendance rows listed', (await page.locator('#nextClass .sess').count()) === 1 && (await page.locator('#attList .att-row').count()) >= 5);
    await page.evaluate(() => localStorage.setItem('ask-home-view', 'game'));

    await page.goto(base + '/student_portal/packages.html'); await settle(page); await dismiss(page);
    const packs = await page.locator('#myPasses .passrow').allInnerTexts();
    t.check('packages: two packs shown, 18 of 25 left (first used) and 25 of 25', packs.length === 2 && /18[\s\S]*of 25 left/.test(packs[0]) && /25[\s\S]*of 25 left/.test(packs[1]), packs.join(' || '));
    t.check('packages: shows "2 of 2 packages held"', /2 of 2/.test(await page.locator('#passCapNote').innerText()));
    t.check('packages: adult shop lists the four packages with server prices', (await page.locator('#pkgShop .pkg').count()) === 4 && /S\$600|600/.test(await page.locator('#pkgShop').innerText()));
    await page.click('[data-buy="a10"]'); await page.waitForTimeout(300);
    t.check('packages: buying a third package shows the 2-package limit (no payment)', /already hold 2 packages/.test(await page.locator('#modal').innerText()));
    await page.evaluate(() => closeModal());
    await page.screenshot({ path: path.join(SCREENS, 'student-packages-1280.png'), fullPage: true });

    await page.goto(base + '/student_portal/payments.html'); await settle(page);
    const nPay = (await q(`select count(*)::int n from payment where user_id = 'S-001'`))[0].n;
    t.check(`payments: ${nPay} rows on screen = the db rows of S-001`, (await page.locator('#payRows tr').count()) === nPay && nPay === 7, `rows=${await page.locator('#payRows tr').count()}`);
    t.check('payments: the 25-lesson pack S$600 appears', /25-lesson pack/.test(await page.locator('#payRows').innerText()));

    await page.goto(base + '/student_portal/grading.html'); await settle(page); await dismiss(page);
    t.check('grading: checklist shows 29 / 36 sessions as not met, status Not yet eligible', /29 \/ 36/.test(await page.locator('#gaChecks').innerText()) && /Not yet eligible/.test(await page.locator('#gaStatus').innerText()));
    t.check('grading: title and date come from the server (3rd Kyu, 13 Dec 2026)', /3rd Kyu/.test(await page.locator('#gaTitle').innerText()) && /13 Dec 2026/.test(await page.locator('#gaWhen').innerText()));
    t.check('grading: fee shows 50 for the 3rd Kyu target; no prototype "simulate" link', /50/.test(await page.locator('#gaFees').innerText()) && (await page.locator('#gaDemo').count()) === 0);
    t.check('grading: the submit button stays disabled', await page.locator('#gaSubmit').isDisabled());
    t.check('grading: feedback list has the two past gradings', (await page.locator('#fbList .fb-fold').count()) === 2);
    await page.screenshot({ path: path.join(SCREENS, 'student-grading-1280.png'), fullPage: true });

    await page.goto(base + '/student_portal/profile.html'); await settle(page); await dismiss(page);
    t.check('profile: form shows the account (name locked, email, mobile, emergency contact)', (await page.inputValue('#p-name')) === 'Lervyn Wong' && (await page.inputValue('#p-email')) === 'lervyn@email.com' && (await page.inputValue('#p-phone')) === '9123 4567' && /May Wong/.test(await page.inputValue('#p-ec')));
    t.check('profile: joined 14 Jun 2025', (await page.locator('#pfJoined').innerText()) === '14 Jun 2025');
    await page.fill('#p-phone', '8123 0001');
    await page.click('#profileForm button[type="submit"]'); await page.waitForTimeout(700);
    t.check('profile: saving updates the database', (await q(`select contact_no from student_profile where user_id = 'S-001'`))[0].contact_no === '8123 0001');
    await page.screenshot({ path: path.join(SCREENS, 'student-profile-1280.png'), fullPage: true });
    clean('student values pages', problems);
    await ctx.close();
  }

  // ---------- profile: change-password dialog (the 400 for the wrong current password is expected)
  {
    const { ctx, page, problems } = await newPage(browser, base, { allow: ['400 ' + base + '/api/v1/auth/change-password', /status of 400/] });
    await signInStudent(page, base);
    await page.goto(base + '/student_portal/profile.html'); await settle(page); await dismiss(page);
    await page.click('#pwBtn'); await page.waitForTimeout(400);
    t.check('profile: Change password opens the real dialog (current / new / confirm)', await page.locator('#cpForm').isVisible() && (await page.locator('#cp-cur, #cp-new, #cp-new2').count()) === 3);
    await page.fill('#cp-cur', 'notmypass1'); await page.fill('#cp-new', 'Browser2026x'); await page.fill('#cp-new2', 'Browser2026x');
    await page.click('#cpGo'); await page.waitForTimeout(800);
    t.check('profile dialog: wrong current password is shown inline', /incorrect/i.test(await page.locator('#cp-cur').evaluate(e => e.closest('.fld').querySelector('.err').textContent)));
    await page.fill('#cp-cur', 'password123');
    await page.click('#cpGo'); await page.waitForTimeout(1000);
    t.check('profile dialog: success toast "Password updated" and the dialog closes', (await page.locator('.toast', { hasText: 'Password updated' }).count()) > 0 && (await page.locator('#modal.open').count()) === 0);
    const hash = (await q(`select password_hash h from users where id = 'S-001'`))[0].h;
    t.check('profile dialog: the db holds a new bcrypt hash', /^\$2[aby]\$/.test(hash) && hash !== '$2b$10$T88/9UZzmA2kWCyjDC44VObKDgRfr0bt1x5Fk0u3gqnD4Q8Q5UBTu');
    const back = await page.evaluate(() => ASK.post('/auth/change-password', { currentPassword: 'Browser2026x', newPassword: 'password123', confirmPassword: 'password123' }).then(() => true, () => false));
    t.check('profile dialog: password changed back for the rest of the suite', back);
    clean('profile change password', problems);
    await ctx.close();
  }

  // ---------- book a class, then cancel it (7 Nov is the first day that can be booked)
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStudent(page, base);
    await page.goto(base + '/student_portal/book.html'); await settle(page); await dismiss(page);
    t.check('book: week grid drawn from the server timetable', (await page.locator('#bookGrid .slotb').count()) >= 15);
    t.check('book: the help (?) panel opens', await (async () => { await page.click('[data-help="bookHelp"]'); return !(await page.locator('#bookHelp').isHidden()); })());
    const LESSON = 'LS-20261108-0900-HQ-A';
    const idx = await page.evaluate(id => stu.slots.findIndex(x => x.s.lessonId === id), LESSON);
    t.check('book: the Sunday 9 AM Adults class is on screen', idx >= 0);
    const left0 = (await q(`select lessons_left from student_package where id = 'SP-001'`))[0].lessons_left;
    await page.click(`#bookGrid [data-i="${idx}"]`); await page.waitForTimeout(300);
    t.check('book: the booking sheet names the class and the pack that pays (18 left in the 25-lesson pack)', /Adults/.test(await page.locator('#modal').innerText()) && /25-lesson pack/.test(await page.locator('#modal').innerText()));
    await page.click('#doBook'); await page.waitForTimeout(900);
    const row = (await q(`select attendance_status s, student_package_id p from class_attendance where lesson_id = $1 and user_id = 'S-001'`, [LESSON]))[0];
    const left1 = (await q(`select lessons_left from student_package where id = 'SP-001'`))[0].lessons_left;
    t.check('book: the db has a Booked row and one lesson less (SP-001: 18 -> 17)', row && row.s === 'Booked' && row.p === 'SP-001' && left1 === left0 - 1, JSON.stringify({ row, left0, left1 }));
    t.check('book: the slot now shows Booked', (await page.locator(`#bookGrid .slotb.booked`).count()) >= 2);
    await page.screenshot({ path: path.join(SCREENS, 'student-book-1280.png'), fullPage: true });
    const idx2 = await page.evaluate(id => stu.slots.findIndex(x => x.s.lessonId === id), LESSON);
    await page.click(`#bookGrid [data-i="${idx2}"]`); await page.waitForTimeout(300);
    t.check('cancel: the sheet says the lesson goes back (more than 4 hours ahead)', /goes back to its package/.test(await page.locator('#modal').innerText()));
    await page.click('#doCancel'); await page.waitForTimeout(900);
    const row2 = (await q(`select attendance_status s from class_attendance where lesson_id = $1 and user_id = 'S-001'`, [LESSON]))[0];
    const left2 = (await q(`select lessons_left from student_package where id = 'SP-001'`))[0].lessons_left;
    t.check('cancel: db row Cancelled and the lesson is back (17 -> 18)', row2.s === 'Cancelled' && left2 === left0, JSON.stringify({ row2, left2 }));
    // a class Lervyn may not take
    const adv = await page.evaluate(() => stu.slots.findIndex(x => x.s.state === 'blocked'));
    if (adv >= 0) { await page.click(`#bookGrid [data-i="${adv}"]`); await page.waitForTimeout(300); t.check('book: a blocked class only shows a toast (no booking sheet)', (await page.locator('#modal.open').count()) === 0 && (await page.locator('.toast').count()) > 0); }
    // next week
    await page.click('#wkNext'); await page.waitForTimeout(800);
    t.check('book: next week loads from the server (week label changes, grid filled)', /9 Nov/.test(await page.locator('#wkLabel').innerText()) && (await page.locator('#bookGrid .slotb').count()) >= 15);
    clean('book flow', problems);
    await ctx.close();
  }
  // phone layout of the booking page (agenda)
  {
    const { ctx, page, problems } = await newPage(browser, base, { width: 390 });
    await signInStudent(page, base);
    await page.goto(base + '/student_portal/book.html'); await settle(page); await dismiss(page);
    t.check('book @390: agenda lists the day\'s classes', (await page.locator('#bookAgenda .ag-item').count()) >= 1);
    await page.screenshot({ path: path.join(SCREENS, 'student-book-390.png'), fullPage: true });
    clean('book @390', problems);
    await ctx.close();
  }

  // ---------- landing pages, 1280 and 390 (public, no sign-in)
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    for (const f of LANDING_PAGES) { await page.goto(`${base}/landingpage/${f}`); await settle(page); }
    t.check(`landing @${width}: ${LANDING_PAGES.length} pages loaded`, true);
    await page.goto(`${base}/landingpage/fees.html`); await settle(page);
    t.check(`fees @${width}: prices from the server (S$600 for 25 lessons)`, /600/.test(await page.locator('body').innerText()));
    clean(`landing pages @${width}`, problems);
    await ctx.close();
  }

  // ---------- trial booking through the page
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await page.goto(base + '/landingpage/trial.html#trial'); await settle(page);
    await page.evaluate(() => $('#g-date').dpSet(new Date(2026, 10, 9)));
    await page.waitForSelector('#sessPick input[name="gsess"]', { timeout: 6000 });
    const n = await page.locator('#sessPick input[name="gsess"]').count();
    t.check('trial: classes of Mon 9 Nov come from the API (beginner-friendly only: Adults)', n === 1 && /Adults/.test(await page.locator('#sessPick').innerText()), await page.locator('#sessPick').innerText());
    await page.evaluate(() => document.querySelector('#sessPick input[name="gsess"]').click());
    await page.fill('#g-name', 'Browser Trial'); await page.fill('#g-email', 'browser.trial@example.com'); await page.fill('#g-phone', '91230000');
    await page.evaluate(() => { document.getElementById('gm-n').click(); passState.sig = { value: () => 'sig', reset() {} }; });
    await page.evaluate(() => completePass());   // same function the slide calls; the slide animation itself is not what is being tested
    await page.waitForTimeout(900);
    const dbg = (await q(`select p.id, p.amount_paid::float a from guest_pass p join users u on u.id = p.user_id where u.email = 'browser.trial@example.com'`))[0];
    t.check('trial: the db has the guest pass (S$29) and the ticket shows its reference', dbg && dbg.a === 29 && (await page.locator('#ticket').innerText()).includes(dbg.id), JSON.stringify(dbg));
    await page.screenshot({ path: path.join(SCREENS, 'landing-trial-done-1280.png') });
    clean('trial', problems);
    await ctx.close();
  }

  // ---------- join (registration) through the page
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await page.goto(base + '/landingpage/join.html'); await settle(page);
    const setv = (id, v) => page.evaluate(([i, x]) => { const e = document.getElementById(i); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
    const click = id => page.evaluate(i => document.getElementById(i).click(), id);
    await setv('r-name', 'Browser Joiner'); await click('g-f'); await setv('r-nat', 'Singaporean');
    await page.evaluate(() => $('#r-dob').dpSet(new Date(1995, 4, 5)));
    await setv('r-phone', '91230001'); await setv('r-email', 'browser.joiner@example.com');
    await page.evaluate(() => { reg.verified = true; $('#emailOk').hidden = false; });
    await setv('r-ecname', 'Sam Joiner'); await setv('r-ecrel', 'Sibling'); await setv('r-ecphone', '91230002');
    await setv('r-pw', 'Joiner2026pw'); await setv('r-pw2', 'Joiner2026pw');
    await page.click('#regForm .rstep[data-step="1"] [data-next]'); await page.waitForTimeout(400);
    await click('prev-n'); await click('med-n');
    await page.click('#regForm .rstep[data-step="2"] [data-next]'); await page.waitForTimeout(400);
    await click('dj-hq'); await click('d1'); await click('sz-3');
    await page.click('#regForm .rstep[data-step="3"] [data-next]'); await page.waitForTimeout(400);
    await click('pk-a25');
    await page.click('#regForm .rstep[data-step="4"] [data-next]'); await page.waitForTimeout(500);
    t.check('join: review shows 60 + 48 + 30 + 600 = S$738 (policy prices from the server)', /738/.test(await page.locator('#fees').innerText()), await page.locator('#fees').innerText());
    await page.evaluate(() => { reg.sig = { value: () => 'sig', reset() {} }; completeRegistration(); });
    await page.waitForTimeout(1200);
    const memNo = (await page.locator('#memNo').innerText()).trim();
    const acct = (await q(`select sp.user_id, (select count(*)::int from payment p where p.user_id = sp.user_id) pays from student_profile sp where sp.member_no = $1`, [memNo]))[0];
    t.check('join: the done screen shows the new member number and the account exists with its payments', /^ASK-2026-\d{4}$/.test(memNo) && acct && acct.pays === 4, `${memNo} ${JSON.stringify(acct)}`);
    t.check('join: paid S$738 on the done screen', /738/.test(await page.locator('#donePaid').innerText()));
    t.check('join: the chosen password is nowhere in the DOM and the inputs are cleared', !(await page.content()).includes('Joiner2026pw') && (await page.inputValue('#r-pw')) === '' && (await page.inputValue('#r-pw2')) === '');
    const lr = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portal: 'student', identifier: memNo, password: 'Joiner2026pw' }) });
    t.check('join: the new member signs in with the member number and the password they chose', lr.status === 200, String(lr.status));
    await page.screenshot({ path: path.join(SCREENS, 'landing-join-done-1280.png') });
    clean('join', problems);
    await ctx.close();
  }
} catch (e) { t.check('suite crashed: ' + e.message, false, e.stack); }
await pg.end();
await browser.close();
await app.stop();
t.done();
