// Browser run (headless Edge): real sign-in forms for the four demo accounts, guards, logout, zero console errors,
// no auth/business data in browser storage, plus a smoke load of EVERY page of every portal at 1280 and 390 px.
import path from 'node:path';
import { spawnApp, resetDb, suite, client } from './lib.mjs';
import { launch, newPage, settle, signInStudent, signInStaff, storageDump, htmlPagesOf, SCREENS } from './browser-lib.mjs';

const t = suite('browser-login');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const BAD_KEYS = /ask-prototype|ask-role|ask-admin|ask-last-id|ask-notif/;
const noAuthStorage = async (page, label) => {
  const s = await storageDump(page);
  t.check(`${label}: no ask-prototype / ask-role / ask-admin / ask-last-id keys in local or session storage`, ![...s.local, ...s.session].some(k => BAD_KEYS.test(k)), JSON.stringify([s.local, s.session]));
  t.check(`${label}: no business data in storage (no member no, no token)`, !/ASK-20|eyJ|Lervyn|password/i.test(s.localValues + s.sessionValues), (s.localValues + s.sessionValues).slice(0, 100));
  t.check(`${label}: the session cookie is not readable from JavaScript`, !/ask_token/.test(s.cookie), s.cookie);
};
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));

try {
  // ---------- student ----------
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStudent(page, base);
    t.check('student: sign-in form lands on the student portal home', /student_portal\/index\.html$/.test(page.url()), page.url());
    t.check('student: page is visible (guard passed)', await page.evaluate(() => document.body.classList.contains('ok')));
    const me = await page.evaluate(() => ({ n: document.querySelector('.rail-me b')?.textContent, l: document.querySelector('.rail-me .me-info span')?.textContent }));
    t.check('student: sidebar shows Lervyn Wong, 4th Kyu · HQ Dojo (from /auth/me)', me.n === 'Lervyn Wong' && me.l === '4th Kyu · HQ Dojo', JSON.stringify(me));
    t.check('student: TODAY follows the server date (2026-11-06)', await page.evaluate(() => isoDate(TODAY) === '2026-11-06'));
    t.check('student: package prices come from the server (25 lessons S$600)', await page.evaluate(() => PKG.adult.find(p => p.id === 'a25').amt === 600 && PKG.adult.find(p => p.id === 'aun').lessons === Infinity));
    await page.screenshot({ path: path.join(SCREENS, 'login-student-home-1280.png') });
    await noAuthStorage(page, 'student');
    clean('student sign-in', problems);

    // guards: a student cannot open other portals
    await page.goto(base + '/instructor_portal/index.html'); await settle(page);
    t.check('guard: student opening the instructor portal is sent to staff sign-in (denied)', /admin_portal\/signin\.html\?denied/.test(page.url()), page.url());
    await page.goto(base + '/admin_portal/index.html'); await settle(page);
    t.check('guard: student opening the admin portal is sent to staff sign-in (denied)', /admin_portal\/signin\.html\?denied/.test(page.url()), page.url());
    // logout
    await page.goto(base + '/student_portal/profile.html'); await settle(page);
    await Promise.all([page.waitForURL(/landingpage\/index\.html/, { timeout: 8000 }), page.click('.page.on [data-logout], [data-logout]')]);
    t.check('student: logout returns to the landing page', /landingpage/.test(page.url()));
    await page.goto(base + '/student_portal/index.html'); await settle(page);
    t.check('guard: after logout the portal sends you to the student log in', /student_portal\/login\.html/.test(page.url()), page.url());
    const cookies = await ctx.cookies();
    t.check('logout removed the session cookie', !cookies.some(c => c.name === 'ask_token'));
    await ctx.close();
  }
  // wrong password stays on the page and says so
  {
    const { ctx, page, problems } = await newPage(browser, base, { allow: [/\b401\b/] });
    await page.goto(base + '/student_portal/login.html'); await settle(page);
    await page.fill('#l-pass', 'wrong-password');
    await page.click('#loginForm button[type="submit"]'); await page.waitForTimeout(800);
    t.check('student: wrong password stays on the log in page with an error toast', /login\.html/.test(page.url()) && (await page.locator('.toast.bad').count()) > 0);
    await page.click('#googleBtn'); await page.waitForTimeout(300);
    t.check('student: Google button only shows a "not available" toast (does not sign in)', /login\.html/.test(page.url()) && (await page.locator('.toast', { hasText: 'not available' }).count()) > 0);
    clean('student wrong password', problems.filter(p => !/401/.test(p)));
    await ctx.close();
  }
  // ---------- instructor ----------
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'instructor', 'INS-0042');
    t.check('instructor: lands on the instructor portal', /instructor_portal\/index\.html/.test(page.url()), page.url());
    t.check('instructor: page visible', await page.evaluate(() => document.body.classList.contains('ok')));
    t.check('instructor: avatar BT and name from /auth/me', await page.evaluate(() => document.querySelector('.prof-btn .av')?.textContent === 'BT' && P.me[1] === 'Bob Tan Sensei'));
    await page.screenshot({ path: path.join(SCREENS, 'login-instructor-home-1280.png') });
    await noAuthStorage(page, 'instructor');
    clean('instructor sign-in', problems);
    await page.goto(base + '/student_portal/index.html'); await settle(page);
    t.check('guard: instructor opening the student portal is sent to the student log in', /student_portal\/login\.html/.test(page.url()), page.url());
    await page.goto(base + '/admin_portal/index.html'); await settle(page);
    t.check('guard: instructor opening the admin portal is sent to staff sign-in (denied)', /admin_portal\/signin\.html\?denied/.test(page.url()), page.url());
    await page.goto(base + '/instructor_portal/profile.html'); await settle(page);
    await Promise.all([page.waitForURL(/admin_portal\/signin\.html/, { timeout: 8000 }), page.click('[data-logout]')]);
    t.check('instructor: sign out returns to staff sign-in', /signin\.html/.test(page.url()));
    await page.goto(base + '/instructor_portal/index.html'); await settle(page);
    t.check('guard: after sign out the instructor portal redirects to sign-in', /signin\.html/.test(page.url()), page.url());
    await ctx.close();
  }
  // ---------- business admin ----------
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'admin', 'ADM-001');
    t.check('business admin: lands on the admin portal', /admin_portal\/index\.html/.test(page.url()), page.url());
    const me = await page.evaluate(() => ({ n: document.querySelector('.rail-me b')?.textContent, l: document.querySelector('.rail-me .me-info span')?.textContent, ba: isBA(), links: [...document.querySelectorAll('.rail nav a')].map(a => a.textContent.trim()) }));
    t.check('business admin: Grace Lim, Business Admin, sees Staff + Policies + Revenue', me.n === 'Grace Lim' && /Business Admin/.test(me.l) && me.ba && ['Staff', 'Policies', 'Revenue', 'Insights'].every(x => me.links.some(l => l.startsWith(x))), JSON.stringify(me));
    await page.screenshot({ path: path.join(SCREENS, 'login-business-admin-home-1280.png') });
    await noAuthStorage(page, 'business admin');
    clean('business admin sign-in', problems);
    t.check('business admin: sidebar has the Audit log item', me.links.some(l => l.startsWith('Audit log')), JSON.stringify(me.links));
    await page.goto(base + '/admin_portal/staff.html'); await settle(page);
    t.check('business admin can open the Staff page', /admin_portal\/staff\.html/.test(page.url()), page.url());
    await ctx.close();
  }
  // ---------- front desk ----------
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'admin', 'ADM-101');
    t.check('front desk: lands on the admin portal', /admin_portal\/index\.html/.test(page.url()), page.url());
    const me = await page.evaluate(() => ({ n: document.querySelector('.rail-me b')?.textContent, l: document.querySelector('.rail-me .me-info span')?.textContent, ba: isBA(), links: [...document.querySelectorAll('.rail nav a')].map(a => a.textContent.trim()) }));
    t.check('front desk: Daniel Ong, Front desk, no Staff / Policies / Revenue links', me.n === 'Daniel Ong' && /Front desk/.test(me.l) && !me.ba && !me.links.some(l => /^(Staff|Policies|Revenue|Insights|Reports|Import|Audit)/.test(l)), JSON.stringify(me));
    await page.screenshot({ path: path.join(SCREENS, 'login-frontdesk-home-1280.png') });
    await noAuthStorage(page, 'front desk');
    clean('front desk sign-in', problems);
    await page.goto(base + '/admin_portal/staff.html'); await settle(page);
    t.check('guard: front desk opening Staff goes back to the admin home (the page then drops ?baonly)', /admin_portal\/index\.html/.test(page.url()), page.url());
    await ctx.close();
  }
  // inactive staff
  {
    const { ctx, page, problems } = await newPage(browser, base, { allow: [/\b403\b/] });
    await page.goto(base + '/admin_portal/signin.html'); await settle(page);
    await page.click('#roleTabs [data-role="admin"]'); await page.fill('#s-id', 'ADM-102'); await page.fill('#s-pass', 'password123');
    await page.click('#staffForm button[type="submit"]'); await page.waitForTimeout(800);
    const toastText = await page.locator('.toast.bad').first().textContent().catch(() => '');
    t.check('inactive staff ADM-102: stays on sign-in with the "deactivated" message from the server', /signin\.html/.test(page.url()) && /deactivated/i.test(toastText), toastText);
    clean('inactive staff', problems.filter(p => !/403/.test(p)));
    await ctx.close();
  }
  // not signed in: guards on every portal
  {
    const { ctx, page } = await newPage(browser, base, { allow: [/\b401\b/] });
    for (const [p, expect] of [['/student_portal/index.html', /student_portal\/login\.html/], ['/student_portal/book.html', /student_portal\/login\.html/], ['/instructor_portal/index.html', /admin_portal\/signin\.html/], ['/admin_portal/payments.html', /admin_portal\/signin\.html/]]) {
      await page.goto(base + p); await settle(page);
      t.check(`guard: signed out ${p} -> sign-in`, expect.test(page.url()), page.url());
    }
    await ctx.close();
  }

  // ---------- smoke: every page of every portal, both widths ----------
  const WHO = {
    student: async page => signInStudent(page, base),
    instructor: async page => signInStaff(page, base, 'instructor', 'INS-0042'),
    admin_ba: async page => signInStaff(page, base, 'admin', 'ADM-001'),
    admin_fd: async page => signInStaff(page, base, 'admin', 'ADM-101')
  };
  const SETS = [
    ['student', 'student_portal', htmlPagesOf('student_portal').filter(f => f !== 'login.html')],
    ['instructor', 'instructor_portal', htmlPagesOf('instructor_portal')],
    ['admin_ba', 'admin_portal', htmlPagesOf('admin_portal').filter(f => f !== 'signin.html')],
    ['admin_fd', 'admin_portal', htmlPagesOf('admin_portal').filter(f => f !== 'signin.html')]
  ];
  t.check('smoke page list includes admin_portal/audit.html (BA page and front-desk redirect)', SETS[2][2].includes('audit.html') && SETS[3][2].includes('audit.html'));
  for (const width of [1280, 390]) {
    for (const [who, dir, pages] of SETS) {
      const { ctx, page, problems } = await newPage(browser, base, { width });
      await WHO[who](page);
      for (const f of pages) {
        problems.length = 0;
        await page.goto(`${base}/${dir}/${f}`); await settle(page);
        const landed = new URL(page.url()).pathname.replace(/^\//, '');
        const expectedRedirect = (who === 'admin_fd' && ['staff', 'audit', 'policies', 'revenue', 'insights', 'reports', 'imports', 'grading'].includes(f.replace('.html', ''))) || (who === 'instructor' && f === 'grading.html');
        const ok = landed === `${dir}/${f}` ? true : expectedRedirect && landed === `${dir}/index.html`;
        /* a guarded page redirects, so the page that finally shows may still be booting: wait for it (or time out and fail below) */
        await page.waitForFunction(() => document.body && document.body.classList.contains('ok'), null, { timeout: 10000 }).catch(() => {});
        const vis = await page.evaluate(() => document.body.classList.contains('ok') && !!document.querySelector('.shell, main, .page'));
        t.check(`${width}px ${who} ${dir}/${f}${landed !== `${dir}/${f}` ? ' (redirect to ' + landed + ')' : ''}: loads, visible, zero errors`, ok && vis && problems.length === 0, `${landed} vis=${vis} ${problems.join(' | ')}`);
      }
      await ctx.close();
    }
    const { ctx, page, problems } = await newPage(browser, base, { width });
    for (const f of htmlPagesOf('landingpage')) {
      problems.length = 0;
      await page.goto(`${base}/landingpage/${f}`); await settle(page);
      t.check(`${width}px public landingpage/${f}: loads, zero errors`, problems.length === 0 && new URL(page.url()).pathname.endsWith(f === 'index.html' ? '/' : f) || problems.length === 0, problems.join(' | '));
    }
    await page.goto(`${base}/student_portal/login.html`); await settle(page);
    t.check(`${width}px student_portal/login.html: loads, zero errors`, problems.length === 0, problems.join(' | '));
    await page.goto(`${base}/admin_portal/signin.html`); await settle(page);
    t.check(`${width}px admin_portal/signin.html: loads, zero errors`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await app.stop();
}
t.done();
