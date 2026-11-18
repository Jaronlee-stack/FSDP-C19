// Throwaway FEAT-003 browser check (headless Edge). Needs db.mjs running. Screens go to .be-tmp/screens/.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect } from '../verify/lib.mjs';
import { launch, newPage, settle, signInStudent, signInStaff, storageDump, SCREENS } from '../verify/browser-lib.mjs';

const t = suite('feat003-browser');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const shot = (page, name, w) => page.screenshot({ path: path.join(SCREENS, `f3-${name}-${w}.png`), fullPage: false });
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const BAD = /ask-prototype|ask-role|ask-admin|ask-last-id|ask-notif|password|token/i;

try {
  for (const width of [1280, 390]) {
    await resetDb();
    // ---------- join page ----------
    {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await page.goto(base + '/landingpage/join.html'); await settle(page);
      t.check(`${width} join: password + confirm fields with eye toggles`, (await page.locator('#r-pw, #r-pw2').count()) === 2 && (await page.locator('#regForm .pw-eye').count()) === 2);
      await page.evaluate(() => {
        $('#r-name').value = 'Nora Fresh'; $('#g-m').checked = true; $('#r-nat').value = 'Singaporean';
        $('#r-dob').dpSet(new Date(1990, 0, 15)); $('#r-dob').dispatchEvent(new Event('change', { bubbles: true }));
        $('#r-phone').value = '91234567'; $('#r-email').value = 'nora.fresh@example.com'; reg.verified = true;
        $('#r-ecname').value = 'Mum'; $('#r-ecrel').value = 'Parent'; $('#r-ecphone').value = '81234567';
        $('#r-nat').dispatchEvent(new Event('change', { bubbles: true })); $('#r-ecrel').dispatchEvent(new Event('change', { bubbles: true }));
      });
      const next = () => page.evaluate(() => { document.querySelector('[data-step="1"] [data-next]').click(); return reg.step; });
      let step = await next();
      t.check(`${width} join: empty password blocks Continue`, step === 1 && await page.locator('#r-pw').evaluate(e => e.closest('.fld').classList.contains('invalid')));
      await page.fill('#r-pw', 'short1'); await page.fill('#r-pw2', 'short1');
      step = await next();
      t.check(`${width} join: weak password blocks Continue with inline error`, step === 1 && (await page.locator('#pwErr').isVisible()));
      await page.fill('#r-pw', 'Sunrise2026'); await page.fill('#r-pw2', 'Sunrise2027');
      step = await next();
      t.check(`${width} join: mismatch blocks Continue with inline error`, step === 1 && await page.locator('#r-pw2').evaluate(e => e.closest('.fld').classList.contains('invalid')) && (await page.locator('#pw2Err').isVisible()));
      await page.click('#r-pw + .pw-eye');
      t.check(`${width} join: eye toggle shows the password`, (await page.locator('#r-pw').getAttribute('type')) === 'text');
      await page.click('#r-pw + .pw-eye');
      await page.evaluate(() => document.querySelector('#r-pw').scrollIntoView({ block: 'center' }));
      await shot(page, 'join-step1-password', width);
      await page.fill('#r-pw2', 'Sunrise2026');
      step = await next();
      t.check(`${width} join: valid password moves to step 2`, step === 2);
      // jump to pay and complete (signature pad and slider are exercised by FEAT-004 browser suites)
      const doneText = await page.evaluate(async () => {
        setStep(3);
        $('input[name="dojo"]').checked = true; $('input[name="dogi"]').checked = true; $('input[name="size"]').checked = true; $('input[name="pkg"]').checked = true;
        $('input[name="prev"][value="No"]').checked = true; $('input[name="med"][value="No"]').checked = true;
        reg.sig = { value: () => 'data:image/png;base64,AAAA', reset() {} };
        $('#tcAgree').checked = true; $('#pdpa').checked = true;
        await completeRegistration();
        return { done: reg.step, sign: $('#doneSignIn').textContent, pw: [$('#r-pw').value, $('#r-pw2').value], dom: document.documentElement.outerHTML.includes('Sunrise2026'), no: $('#memNo').textContent };
      });
      t.check(`${width} join: registration reaches the done step`, doneText.done === 6, JSON.stringify(doneText));
      t.check(`${width} join: done text says sign in with membership number or email and the chosen password`, /membership number or email and the password you chose/.test(doneText.sign), doneText.sign);
      t.check(`${width} join: password inputs cleared and not in the DOM`, doneText.pw.every(v => v === '') && !doneText.dom);
      t.check(`${width} join: welcome mail has no password`, !/Sunrise2026/.test(await page.locator('#mailView').innerText()));
      await shot(page, 'join-done', width);
      const s = await storageDump(page);
      t.check(`${width} join: nothing business-related in browser storage`, ![...s.local, ...s.session].some(k => BAD.test(k)) && !BAD.test(s.localValues + s.sessionValues));
      clean(`${width} join`, problems);
      await ctx.close();
    }

    // ---------- student profile dialog ----------
    {
      const { ctx, page, problems } = await newPage(browser, base, { width, allow: [/\b400\b/] });
      await signInStudent(page, base);
      await page.goto(base + '/student_portal/index.html'); await settle(page);
      t.check(`${width} student home: no 'Grading note' chip`, !(await page.locator('body').innerText()).includes('Grading note'));
      await page.goto(base + '/student_portal/profile.html'); await settle(page);
      await page.click('#pwBtn'); await page.waitForTimeout(500);
      t.check(`${width} student: change password dialog opens`, await page.locator('#cpForm').isVisible());
      await shot(page, 'student-dialog', width);
      await page.click('#cpGo'); await page.waitForTimeout(200);
      t.check(`${width} student: empty submit shows inline errors, no request`, await page.locator('#cp-cur').evaluate(e => e.closest('.fld').classList.contains('invalid')));
      await page.fill('#cp-cur', 'wrongpass1'); await page.fill('#cp-new', 'Another2026pw'); await page.fill('#cp-new2', 'Another2026pw');
      await page.click('#cpGo'); await page.waitForTimeout(700);
      t.check(`${width} student: wrong current password shown inline`, /incorrect/i.test(await page.locator('#cp-cur').evaluate(e => e.closest('.fld').querySelector('.err').textContent)));
      await page.fill('#cp-cur', 'password123');
      await page.click('#cpGo'); await page.waitForTimeout(1000);
      t.check(`${width} student: success shows 'Password updated' and closes`, (await page.locator('.toast', { hasText: 'Password updated' }).count()) > 0 && (await page.locator('#modal.open').count()) === 0);
      clean(`${width} student change password`, problems.filter(p => !/400/.test(p)));
      // restore password for later suites in this run
      await page.evaluate(() => ASK.post('/auth/change-password', { currentPassword: 'Another2026pw', newPassword: 'password123', confirmPassword: 'password123' }));
      await ctx.close();
    }

    // ---------- instructor profile dialog ----------
    {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signInStaff(page, base, 'instructor', 'INS-0042');
      await page.goto(base + '/instructor_portal/profile.html'); await settle(page);
      await page.click('#pwBtn'); await page.waitForTimeout(500);
      t.check(`${width} instructor: change password dialog opens`, await page.locator('#cpForm').isVisible());
      await shot(page, 'instructor-dialog', width);
      clean(`${width} instructor profile`, problems);
      await ctx.close();
    }

    // ---------- admin: dialog, sidebar, audit ----------
    {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signInStaff(page, base, 'admin', 'ADM-001');
      const links = await page.evaluate(() => [...document.querySelectorAll('.rail nav a')].map(a => a.textContent.trim()));
      const iStaff = links.findIndex(l => l.startsWith('Staff'));
      t.check(`${width} BA: 'Audit log' follows Staff under Control`, links[iStaff + 1] && links[iStaff + 1].startsWith('Audit log'), JSON.stringify(links));
      if (width === 1280) {
        t.check('1280 BA: rail shows key + logout buttons', (await page.locator('.rail-me button').count()) === 2);
        await page.click('[data-rail-toggle]'); await page.waitForTimeout(500);
        await shot(page, 'admin-rail-collapsed', width);
        await page.click('[data-rail-toggle]'); await page.waitForTimeout(300);
        await page.click('.rail-me [data-account]'); await page.waitForTimeout(500);
      } else {
        await page.click('.topbar [data-sm-open]'); await page.waitForTimeout(600);
        await shot(page, 'admin-phone-menu', width);
        await page.click('#smList [data-account]'); await page.waitForTimeout(600);
      }
      t.check(`${width} admin: change password dialog opens`, await page.locator('#cpForm').isVisible());
      await shot(page, 'admin-dialog', width);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);

      await page.goto(base + '/admin_portal/audit.html'); await settle(page);
      await page.waitForSelector('#auRows tr.au-row', { timeout: 8000 });
      const n0 = await page.locator('#auRows tr.au-row').count();
      t.check(`${width} audit: rows load`, n0 > 0, String(n0));
      await shot(page, 'audit', width);
      await page.locator('#auRows tr.au-row').first().click(); await page.waitForTimeout(200);
      t.check(`${width} audit: row expands with details`, (await page.locator('#auRows tr.au-detail').count()) === 1);
      await shot(page, 'audit-expanded', width);
      // search
      await page.fill('#au-q', 'staff'); await page.waitForTimeout(900);
      const rowsAfter = await page.locator('#auRows tr.au-row').count();
      t.check(`${width} audit: search narrows the rows`, rowsAfter > 0 && rowsAfter <= n0, `${n0} -> ${rowsAfter}`);
      await page.fill('#au-q', '');
      await page.waitForTimeout(900);
      // filters from facets
      const opts = await page.evaluate(() => ({ a: $('#au-actor').options.length, g: $('#au-group').options.length, e: $('#au-type').options.length }));
      t.check(`${width} audit: filter selects filled from facets`, opts.a > 1 && opts.g > 1 && opts.e > 1, JSON.stringify(opts));
      await page.evaluate(() => { const s = $('#au-group'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForTimeout(800);
      t.check(`${width} audit: group filter applies`, (await page.locator('#auRows tr.au-row').count()) > 0);
      await page.evaluate(() => { const s = $('#au-group'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.waitForTimeout(800);
      // dates: from after to -> message
      await page.fill('#au-from', '2026-11-06'); await page.fill('#au-to', '2026-01-01'); await page.waitForTimeout(500);
      t.check(`${width} audit: reversed dates show a message`, /From date/.test(await page.locator('#auRows').innerText()));
      await page.fill('#au-from', ''); await page.fill('#au-to', ''); await page.waitForTimeout(800);
      // pager
      const pagerVisible = await page.locator('#auPager').isVisible();
      const info = await page.locator('#auPageInfo').innerText();
      t.check(`${width} audit: pager shows page x of y · N events`, pagerVisible && /Page 1 of \d+ · \d+ events?/.test(info), info);
      if (/Page 1 of ([2-9]|\d{2,})/.test(info)) {
        await page.click('#auNext'); await page.waitForTimeout(800);
        t.check(`${width} audit: Next goes to page 2`, /Page 2 of/.test(await page.locator('#auPageInfo').innerText()));
        await page.click('#auPrev'); await page.waitForTimeout(800);
      }
      // csv
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#auExport')]);
      t.check(`${width} audit: CSV export downloads`, /^audit-log-.*\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      const ov = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      t.check(`${width} audit: no horizontal overflow`, ov);
      const s = await storageDump(page);
      t.check(`${width} admin: no business data in storage`, ![...s.local, ...s.session].some(k => BAD.test(k)));
      clean(`${width} BA audit`, problems);
      await ctx.close();
    }

    // ---------- front desk: no Audit log item, redirect with toast ----------
    {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signInStaff(page, base, 'admin', 'ADM-101');
      const links = await page.evaluate(() => [...document.querySelectorAll('.rail nav a')].map(a => a.textContent.trim()));
      t.check(`${width} front desk: no Audit log item`, !links.some(l => /Audit/.test(l)));
      await page.goto(base + '/admin_portal/audit.html'); await settle(page);
      await page.waitForTimeout(800);
      t.check(`${width} front desk: audit.html redirects home with the Business Admins toast`, /admin_portal\/index\.html/.test(page.url()) && (await page.locator('.toast', { hasText: 'Business Admin' }).count()) > 0, page.url());
      clean(`${width} front desk`, problems);
      await ctx.close();
    }

    // ---------- desk registration ----------
    {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signInStaff(page, base, 'admin', 'ADM-101');
      await page.goto(base + '/admin_portal/register.html'); await settle(page);
      t.check(`${width} desk register: Sign-in password card present`, (await page.locator('#rg-pw, #rg-pw2').count()) === 2 && /Staff never see/.test(await page.locator('body').innerText()));
      await page.evaluate(() => document.querySelector('#rg-pw').scrollIntoView({ block: 'center' }));
      await shot(page, 'desk-register', width);
      const res = await page.evaluate(async () => {
        $('#rg-name').value = 'Desk Person'; $('#rg-g1').checked = true; $('#rg-nat').value = 'Singaporean';
        $('#rg-dob').dpSet(new Date(1992, 3, 4)); $('#rg-dob').dispatchEvent(new Event('change', { bubbles: true }));
        $('#rg-phone').value = '91234500'; $('#rg-email').value = 'desk.person@example.com';
        $('#rg-ecname').value = 'Kin'; $('#rg-ecrel').value = 'Parent'; $('#rg-ecphone').value = '81234500';
        $('#rg-m1').checked = true; $('#rg-dogi').selectedIndex = 1; $('#rg-pkg').selectedIndex = 1;
        $('#rg-terms').checked = true; $('#rg-pdpa').checked = true; RG.sig = { value: () => 'data:image/png;base64,AAAA' };
        $('#rg-pw').value = 'abc'; $('#rg-pw2').value = 'abc';
        const bad = rgValidate();
        $('#rg-pw').value = 'Sunrise2026'; $('#rg-pw2').value = 'Sunrise2026';
        const good = rgValidate();
        await rgComplete();
        const t = $('#regDone').innerText;
        return { bad, good, text: t, pw: [$('#rg-pw').value, $('#rg-pw2').value], dom: document.documentElement.outerHTML.includes('Sunrise2026') };
      });
      t.check(`${width} desk register: weak blocked, valid passes`, res.bad === false && res.good === true, JSON.stringify(res).slice(0, 200));
      t.check(`${width} desk register: result view shows no password and says how the student signs in`, /member number or email and the password they just chose/.test(res.text) && !/Temporary password|Sunrise2026/.test(res.text) && !res.dom && res.pw.every(v => v === ''), res.text.slice(0, 300));
      await shot(page, 'desk-register-done', width);
      clean(`${width} desk register`, problems);
      await ctx.close();
    }

    // ---------- forced change ----------
    {
      const pg = await pgConnect();
      await pg.query(`UPDATE users SET must_change_password = true WHERE email IN (SELECT email FROM users WHERE id IN (SELECT user_id FROM student_profile WHERE member_no = 'ASK-2025-1834') )`);
      await pg.end();
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await signInStudent(page, base).catch(() => {});
      await page.goto(base + '/student_portal/index.html'); await settle(page);
      t.check(`${width} forced: locked dialog visible`, await page.locator('#cpForm').isVisible() && await page.locator('#modal .modal.locked').count() === 1);
      t.check(`${width} forced: no close button and a Sign out link`, !(await page.locator('#modal .modal-x').isVisible()) && await page.locator('#cpOut').isVisible());
      await shot(page, 'forced-dialog', width);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await page.mouse.click(3, 3); await page.waitForTimeout(300);
      t.check(`${width} forced: Escape and overlay click do nothing`, await page.locator('#cpForm').isVisible());
      await page.fill('#cp-cur', 'password123'); await page.fill('#cp-new', 'Sunrise2099'); await page.fill('#cp-new2', 'Sunrise2099');
      await Promise.all([page.waitForNavigation({ timeout: 8000 }), page.click('#cpGo')]);
      await settle(page);
      t.check(`${width} forced: after change the page loads normally`, !(await page.locator('#cpForm').count()) && await page.evaluate(() => document.body.classList.contains('ok') && !document.body.classList.contains('forced')));
      clean(`${width} forced change`, problems);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await app.stop();
}
t.done();
