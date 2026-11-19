// Browser run (headless Edge): registration passwords (join page + desk register), the locked forced-change dialog in the three portals,
// and the change-password dialog in the student, instructor and admin portals at 1280 (desktop) and 390 (phone sheet). Screens to .be-tmp/screens/.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect, client, login } from './lib.mjs';
import { launch, newPage, settle, signInStudent, signInStaff, storageDump, SCREENS } from './browser-lib.mjs';

const t = suite('browser-account');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const shot = (page, name) => page.screenshot({ path: path.join(SCREENS, name + '.png') });
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const BAD = /ask-prototype|ask-role|ask-admin|ask-last-id|password|token/i;
const noStorage = async (page, label) => { const s = await storageDump(page); t.check(`${label}: no password or auth data in browser storage`, ![...s.local, ...s.session].some(k => BAD.test(k)) && !BAD.test(s.localValues + s.sessionValues) && !/eyJ/.test(s.localValues + s.sessionValues)); };
const isInvalid = (page, sel) => page.locator(sel).evaluate(e => e.closest('.fld').classList.contains('invalid'));

try {
  /* ---------- join page: password fields, validation, confirmation text ---------- */
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await page.goto(base + '/landingpage/join.html'); await settle(page);
    t.check(`join @${width}: step 1 has password + confirm fields with show/hide toggles and autocomplete new-password`, (await page.locator('#r-pw, #r-pw2').count()) === 2 && (await page.locator('#regForm .pw-eye').count()) === 2
      && (await page.getAttribute('#r-pw', 'autocomplete')) === 'new-password' && (await page.getAttribute('#r-pw2', 'autocomplete')) === 'new-password');
    t.check(`join @${width}: the hint says how the member signs in`, /membership number or email/i.test(await page.locator('#regForm .rstep[data-step="1"]').innerText()));
    const email = `join.pw.${width}@example.com`;
    await page.evaluate(em => {
      $('#r-name').value = 'Pat Word'; $('#g-f').checked = true; $('#r-nat').value = 'Singaporean';
      $('#r-dob').dpSet(new Date(1993, 2, 3)); $('#r-dob').dispatchEvent(new Event('change', { bubbles: true }));
      $('#r-phone').value = '91234567'; $('#r-email').value = em; reg.verified = true;
      $('#r-ecname').value = 'Mum'; $('#r-ecrel').value = 'Parent'; $('#r-ecphone').value = '81234567';
      $('#r-nat').dispatchEvent(new Event('change', { bubbles: true })); $('#r-ecrel').dispatchEvent(new Event('change', { bubbles: true }));
    }, email);
    const next = () => page.evaluate(() => { document.querySelector('[data-step="1"] [data-next]').click(); return reg.step; });
    t.check(`join @${width}: an empty password blocks Continue`, (await next()) === 1 && await isInvalid(page, '#r-pw'));
    await page.fill('#r-pw', 'short1'); await page.fill('#r-pw2', 'short1');
    t.check(`join @${width}: a weak password blocks Continue with an inline error`, (await next()) === 1 && await page.locator('#pwErr').isVisible());
    await page.fill('#r-pw', 'onlyletters'); await page.fill('#r-pw2', 'onlyletters');
    t.check(`join @${width}: a password without a number is refused`, (await next()) === 1 && await isInvalid(page, '#r-pw'));
    await page.fill('#r-pw', 'Joinpw2026'); await page.fill('#r-pw2', 'Joinpw2027');
    t.check(`join @${width}: a mismatch blocks Continue with an inline error`, (await next()) === 1 && await isInvalid(page, '#r-pw2') && await page.locator('#pw2Err').isVisible());
    await page.click('#r-pw + .pw-eye');
    t.check(`join @${width}: the eye toggle shows the password and hides it again`, (await page.getAttribute('#r-pw', 'type')) === 'text' && await (async () => { await page.click('#r-pw + .pw-eye'); return (await page.getAttribute('#r-pw', 'type')) === 'password'; })());
    await page.fill('#r-pw2', 'Joinpw2026');
    await page.evaluate(() => document.querySelector('#r-pw').scrollIntoView({ block: 'center' }));
    await shot(page, width === 1280 ? 'join-password' : 'join-password-390');
    t.check(`join @${width}: a valid password moves on to step 2`, (await next()) === 2);
    const done = await page.evaluate(async () => {
      setStep(3);
      $('input[name="dojo"]').checked = true; $('input[name="dogi"]').checked = true; $('input[name="size"]').checked = true; $('input[name="pkg"]').checked = true;
      $('input[name="prev"][value="No"]').checked = true; $('input[name="med"][value="No"]').checked = true;
      reg.sig = { value: () => 'data:image/png;base64,AAAA', reset() {} };
      $('#tcAgree').checked = true; $('#pdpa').checked = true;
      await completeRegistration();
      return { step: reg.step, sign: $('#doneSignIn').textContent, pw: [$('#r-pw').value, $('#r-pw2').value], no: $('#memNo').textContent.trim(), done: JSON.stringify(reg.done || {}) };
    });
    t.check(`join @${width}: registration reaches the done step with a member number`, done.step === 6 && /^ASK-2026-\d{4}$/.test(done.no), JSON.stringify(done).slice(0, 200));
    t.check(`join @${width}: confirmation says sign in with membership number or email and the chosen password`, /membership number or email and the password you chose/.test(done.sign), done.sign);
    t.check(`join @${width}: inputs cleared; the password is nowhere in the DOM, reg.done or the welcome mail`, done.pw.every(v => v === '') && !(await page.content()).includes('Joinpw2026') && !done.done.includes('Joinpw2026'));
    await shot(page, width === 1280 ? 'join-done' : 'join-done-390');
    const row = (await q(`select u.password_hash h, a.password_hash ah from users u join student_profile sp on sp.user_id = u.id join registration_application a on a.user_id = u.id where sp.member_no = $1`, [done.no]))[0];
    t.check(`join @${width}: the db stores only a bcrypt hash (application copy cleared)`, row && /^\$2[aby]\$/.test(row.h) && row.ah === null);
    t.check(`join @${width}: the member signs in with the email and the chosen password`, (await client(base).post('/auth/login', { portal: 'student', identifier: email, password: 'Joinpw2026' })).status === 200);
    await noStorage(page, `join @${width}`);
    clean(`join @${width}`, problems);
    await ctx.close();
  }
  // the "waiting for HQ" variant of the confirmation (no signature -> not activated)
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await page.goto(base + '/landingpage/join.html'); await settle(page);
    const out = await page.evaluate(async () => {
      $('#r-name').value = 'Wait Ing'; $('#g-f').checked = true; $('#r-nat').value = 'Singaporean';
      $('#r-dob').dpSet(new Date(2016, 2, 3)); $('#r-dob').dispatchEvent(new Event('change', { bubbles: true }));
      $('#r-phone').value = '91234560'; $('#r-email').value = 'wait.ing@example.com'; reg.verified = true;
      $('#r-ecname').value = 'Mum'; $('#r-ecrel').value = 'Parent'; $('#r-ecphone').value = '81234560';
      $('#r-pw').value = 'Waiting2026'; $('#r-pw2').value = 'Waiting2026';
      document.querySelector('[data-step="1"] [data-next]').click();
      const s1 = reg.step;
      setStep(3);
      $('input[name="dojo"]').checked = true; $('input[name="dogi"]').checked = true; $('input[name="size"]').checked = true;
      const kid = document.querySelector('input[name="pkg"][value^="k"]'); (kid || $('input[name="pkg"]')).checked = true;
      $('input[name="prev"][value="No"]').checked = true; $('input[name="med"][value="No"]').checked = true;
      reg.sig = { value: () => 'data:image/png;base64,AAAA', reset() {} };
      $('#tcAgree').checked = true; $('#pdpa').checked = true;
      await completeRegistration();
      return { s1, step: reg.step, sign: $('#doneSignIn').textContent };
    });
    const app1 = (await q(`select status, password_hash h from registration_application where email = 'wait.ing@example.com'`))[0];
    if (app1 && app1.status !== 'Approved') t.check('join (waiting for HQ): the confirmation says "Once HQ approves your registration" and the application keeps a hash', /Once HQ approves/.test(out.sign) && /^\$2[aby]\$/.test(app1.h), JSON.stringify(out));
    else t.check('join (activated child): confirmation text present', /password you chose/.test(out.sign), JSON.stringify(out));
    clean('join waiting variant', problems);
    await ctx.close();
  }

  /* ---------- desk registration ---------- */
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStaff(page, base, 'admin', 'ADM-101');
    await page.goto(base + '/admin_portal/register.html'); await settle(page);
    t.check(`desk register @${width}: Sign-in password card says staff never see it`, (await page.locator('#rg-pw, #rg-pw2').count()) === 2 && /Staff never see/.test(await page.locator('body').innerText()));
    await page.evaluate(() => document.querySelector('#rg-pw').scrollIntoView({ block: 'center' }));
    await shot(page, `desk-register-password-${width}`);
    const email = `desk.pw.${width}@example.com`;
    const res = await page.evaluate(async em => {
      $('#rg-name').value = 'Desk Person'; $('#rg-g1').checked = true; $('#rg-nat').value = 'Singaporean';
      $('#rg-dob').dpSet(new Date(1992, 3, 4)); $('#rg-dob').dispatchEvent(new Event('change', { bubbles: true }));
      $('#rg-phone').value = '91234500'; $('#rg-email').value = em;
      $('#rg-ecname').value = 'Kin'; $('#rg-ecrel').value = 'Parent'; $('#rg-ecphone').value = '81234500';
      $('#rg-m1').checked = true; $('#rg-dogi').selectedIndex = 1; $('#rg-pkg').selectedIndex = 1;
      $('#rg-terms').checked = true; $('#rg-pdpa').checked = true; RG.sig = { value: () => 'data:image/png;base64,AAAA' };
      $('#rg-pw').value = 'abc'; $('#rg-pw2').value = 'abc';
      const weak = rgValidate();
      $('#rg-pw').value = 'Deskpw2026'; $('#rg-pw2').value = 'Deskpw2027';
      const mism = rgValidate();
      $('#rg-pw2').value = 'Deskpw2026';
      const good = rgValidate();
      await rgComplete();
      return { weak, mism, good, text: $('#regDone').innerText, pw: [$('#rg-pw').value, $('#rg-pw2').value] };
    }, email);
    t.check(`desk register @${width}: weak and mismatched passwords are refused, a valid one passes`, res.weak === false && res.mism === false && res.good === true, JSON.stringify(res).slice(0, 200));
    t.check(`desk register @${width}: result shows no password and says how the student signs in`, /member number or email and the password they just chose/.test(res.text) && !/Temporary password|Deskpw2026/.test(res.text) && !(await page.content()).includes('Deskpw2026') && res.pw.every(v => v === ''), res.text.slice(0, 300));
    t.check(`desk register @${width}: the student signs in with the password they typed`, (await client(base).post('/auth/login', { portal: 'student', identifier: email, password: 'Deskpw2026' })).status === 200);
    await shot(page, `desk-register-done-${width}`);
    clean(`desk register @${width}`, problems);
    await ctx.close();
  }

  /* ---------- forced change: instructor, front desk, student ---------- */
  const BA = await login(base, 'admin', 'ADM-001');
  const ni = await BA.post('/admin/staff', { name: 'Forced Sensei', type: 'instructor', email: 'forced.sensei@askdojo.example', danGrade: 2 });
  const nf = await BA.post('/admin/staff', { name: 'Forced Desk', type: 'frontdesk', email: 'forced.desk@askdojo.example' });
  await q(`update users set must_change_password = true where id = 'S-002'`);
  const FORCED = [
    ['instructor', p => signInStaff(p, base, 'instructor', ni.json.staff.id, ni.json.tempPassword), ni.json.tempPassword, ['/instructor_portal/index.html', '/instructor_portal/profile.html'], ni.json.staff.id],
    ['frontdesk', p => signInStaff(p, base, 'admin', nf.json.staff.id, nf.json.tempPassword), nf.json.tempPassword, ['/admin_portal/index.html', '/admin_portal/members.html'], nf.json.staff.id],
    ['student', p => signInStudent(p, base, 'ASK-2024-0921'), 'password123', ['/student_portal/index.html', '/student_portal/book.html'], 'S-002']
  ];
  for (const [who, signIn, pw, pages, uid] of FORCED) {
    const width = who === 'frontdesk' ? 390 : 1280;
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signIn(page);
    for (const p of pages) {
      await page.goto(base + p); await settle(page);
      const st = await page.evaluate(() => ({ forced: document.body.classList.contains('forced'), ok: document.body.classList.contains('ok'), locked: !!document.querySelector('#modal .modal.locked'), form: !!document.querySelector('#cpForm') }));
      t.check(`forced ${who} ${p}: only the locked dialog is shown (no data calls, no page scripts)`, st.forced && st.ok && st.locked && st.form, JSON.stringify(st));
    }
    t.check(`forced ${who}: no close button, a Sign out link`, !(await page.locator('#modal .modal-x').isVisible()) && await page.locator('#cpOut').isVisible());
    await shot(page, `forced-dialog-${who}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.mouse.click(3, 3); await page.waitForTimeout(300);
    t.check(`forced ${who}: Escape and an overlay click do not close it`, await page.locator('#cpForm').isVisible());
    await page.fill('#cp-cur', pw); await page.fill('#cp-new', 'Forced2026pw'); await page.fill('#cp-new2', 'Forced2026pw');
    await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.click('#cpGo')]);
    await settle(page);
    t.check(`forced ${who}: after the change the page loads normally`, (await page.locator('#cpForm').count()) === 0 && await page.evaluate(() => document.body.classList.contains('ok') && !document.body.classList.contains('forced')));
    t.check(`forced ${who}: db flag cleared`, (await q(`select must_change_password m from users where id = $1`, [uid]))[0].m === false);
    await noStorage(page, `forced ${who}`);
    clean(`forced ${who}`, problems);
    await ctx.close();
  }
  // Sign out from the forced dialog
  {
    await q(`update users set must_change_password = true where id = 'S-003'`);
    const { ctx, page, problems } = await newPage(browser, base);
    const mn = (await q(`select member_no from student_profile where user_id = 'S-003'`))[0].member_no;
    await signInStudent(page, base, mn);
    await Promise.all([page.waitForURL(/landingpage\/index\.html/, { timeout: 8000 }), page.click('#cpOut')]);
    t.check('forced dialog: Sign out leaves the portal and removes the cookie', !(await ctx.cookies()).some(c => c.name === 'ask_token'));
    clean('forced sign out', problems);
    await ctx.close();
  }

  /* ---------- change-password dialog in every portal ---------- */
  const PORTALS = [
    ['student', p => signInStudent(p, base), '/student_portal/profile.html', 'S-001'],
    ['instructor', p => signInStaff(p, base, 'instructor', 'INS-0042'), '/instructor_portal/profile.html', 'INS-0042'],
    ['admin', p => signInStaff(p, base, 'admin', 'ADM-001'), '/admin_portal/index.html', 'ADM-001']
  ];
  for (const width of [1280, 390]) {
    for (const [who, signIn, url, uid] of PORTALS) {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signIn(page);
      await page.goto(base + url); await settle(page);
      await page.waitForTimeout(1700);    // the student portal may open a welcome / rate-your-class sheet shortly after load
      await page.evaluate(() => { if (document.querySelector('#modal.open') && !document.querySelector('#modal .modal.locked')) closeModal(); });
      await page.waitForTimeout(250);
      if (who === 'admin' && width === 1280) {
        t.check('admin @1280: sidebar user block has the key and the logout buttons', (await page.locator('.rail-me [data-account]').count()) === 1 && (await page.locator('.rail-me [data-logout]').count()) === 1);
        await page.click('.rail-me [data-account]');
      } else if (who === 'admin') {
        await page.click('.topbar [data-sm-open]'); await page.waitForTimeout(600);
        t.check('admin @390: the phone menu sheet has "Change password"', /Change password/.test(await page.locator('#smList [data-account]').innerText()));
        await shot(page, 'change-password-admin-menu-390');
        await page.click('#smList [data-account]');
      } else await page.click('#pwBtn');
      await page.waitForTimeout(500);
      t.check(`${who} @${width}: the change-password dialog opens with current / new / confirm`, await page.locator('#cpForm').isVisible() && (await page.locator('#cp-cur, #cp-new, #cp-new2').count()) === 3
        && (await page.getAttribute('#cp-cur', 'autocomplete')) === 'current-password' && (await page.getAttribute('#cp-new', 'autocomplete')) === 'new-password');
      await page.fill('#cp-new', 'abc');
      t.check(`${who} @${width}: live rule hints react to the new password`, (await page.locator('#cpRules .ok').count()) === 1);
      await shot(page, `change-password-${who}-${width}`);
      await page.click('#cpGo'); await page.waitForTimeout(250);
      t.check(`${who} @${width}: empty current + weak new + no confirm show inline errors and send nothing`, await isInvalid(page, '#cp-cur') && await isInvalid(page, '#cp-new') && await isInvalid(page, '#cp-new2'));
      if (width === 1280) {
        await page.fill('#cp-cur', 'password123'); await page.fill('#cp-new', 'Changed2026pw'); await page.fill('#cp-new2', 'Changed2026pw');
        await page.click('#cpGo'); await page.waitForTimeout(1000);
        t.check(`${who} @1280: success toast "Password updated"`, (await page.locator('.toast', { hasText: 'Password updated' }).count()) > 0);
        t.check(`${who} @1280: the dialog closes`, (await page.locator('#modal.open').count()) === 0);
        t.check(`${who} @1280: the typed passwords are cleared from the form`, await page.evaluate(() => ['cp-cur', 'cp-new', 'cp-new2'].every(id => !document.getElementById(id) || document.getElementById(id).value === '')) && !(await page.content()).includes('Changed2026pw'));
        await page.reload(); await settle(page);
        t.check(`${who} @1280: still signed in after the change (cookie re-issued)`, await page.evaluate(() => document.body.classList.contains('ok')) && !/signin|login/.test(page.url()));
        const portal = who === 'admin' ? 'admin' : who;
        const ident = who === 'student' ? 'ASK-2025-1834' : uid;
        t.check(`${who} @1280: the new password signs in, the old one does not`, (await client(base).post('/auth/login', { portal, identifier: ident, password: 'Changed2026pw' })).status === 200 && (await client(base).post('/auth/login', { portal, identifier: ident, password: 'password123' })).status === 401);
        // back to the demo password for the 390 round
        const back = await page.evaluate(() => ASK.post('/auth/change-password', { currentPassword: 'Changed2026pw', newPassword: 'password123', confirmPassword: 'password123' }).then(() => true, () => false));
        t.check(`${who} @1280: password restored for the next round`, back);
      } else {
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        t.check(`${who} @390: the normal dialog closes with Escape`, (await page.locator('#modal.open').count()) === 0);
      }
      const ov = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      t.check(`${who} @${width}: no horizontal overflow`, ov);
      await noStorage(page, `${who} @${width}`);
      clean(`${who} change password @${width}`, problems);
      await ctx.close();
    }
  }
} catch (e) { t.check('suite crashed: ' + e.message, false, e.stack); }
await pg.end();
await browser.close();
await app.stop();
t.done();
