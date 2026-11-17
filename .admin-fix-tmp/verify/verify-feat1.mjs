// FEAT-001: roles, sign-in, shell, guards, seed data, wording. Covers R01-R14, R15 (part), R17, R100-R103.
import { launch, newPage, signInAs, shot, check, setFeat, finish, text } from './lib.mjs';
setFeat('FEAT-001');

const env = await launch();
const B = env.base;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const navTexts = page => page.evaluate(() => [...document.querySelectorAll('.rail nav a')].map(a => a.querySelector('.t').textContent.trim()));
const groups = page => page.evaluate(() => [...document.querySelectorAll('.rail nav .grp')].map(g => g.textContent.trim()));
const tabs = page => page.evaluate(() => [...document.querySelectorAll('.tabbar > *')].map(e => e.querySelector('span').textContent.trim()));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('ask-prototype-v3') || 'null'));
const bell = async page => { await page.click('.topbar [data-notif]'); await page.waitForSelector('.notif'); const t = await page.evaluate(() => document.querySelector('.notif').innerText); await page.keyboard.press('Escape'); return t; };

const FD_NAV = ['Today', 'Classes', 'Members', 'Payments', 'Registrations', 'Equipment', 'Follow-ups', 'Notifications'];
const BA_NAV = ['Overview', 'Classes', 'Members', 'Payments', 'Registrations', 'Equipment', 'Follow-ups', 'Notifications', 'Insights', 'Revenue', 'Grading', 'Reports', 'Policies', 'Staff', 'Import issues'];
const EXISTING_FD = ['index', 'sessions', 'members', 'payments', 'applications', 'notify'];
const EXISTING_BA = [...EXISTING_FD, 'grading', 'reports'];
const BA_KEYS = ['insights', 'revenue', 'grading', 'reports', 'policies', 'staff', 'imports'];

try {
  /* ---------- sign-in page (R01, R02, R03, R04, R05) ---------- */
  {
    const { page, errors } = await newPage(env);
    await page.goto(`${B}/admin_portal/signin.html`);
    const t = await text(page);
    check('R01-signin-no-HQ-Admin', !/HQ Admin/i.test(await page.content()), 'sign-in page has no "HQ Admin"');
    check('R04-signin-copy', t.includes('For instructors and office staff. Accounts are issued by a Business Admin.'));
    check('R02-two-tabs', same(await page.evaluate(() => [...document.querySelectorAll('#roleTabs [data-role]')].map(b => b.textContent.trim())), ['Instructor', 'Admin']));
    await page.click('#roleTabs [data-role="admin"]');
    await page.fill('#s-id', 'ADM-001');
    check('R03-hint-ba', (await page.textContent('#sIdHint')).includes('Business Admin'), await page.textContent('#sIdHint'));
    await page.fill('#s-id', 'ADM-101');
    check('R03-hint-fd', (await page.textContent('#sIdHint')).startsWith('Admin account'), await page.textContent('#sIdHint'));
    check('R03-demo-ids-in-hint', /ADM-001/.test(await page.textContent('#sIdHint')) && /ADM-101/.test(await page.textContent('#sIdHint')));
    await page.fill('#s-id', 'ADM-999'); await page.click('#staffForm button[type=submit]');
    await page.waitForFunction(() => document.body.innerText.includes('No admin account'));
    check('R05-unknown-id', page.url().includes('signin'), 'unknown ID stays on sign-in with a message');
    await page.fill('#s-id', 'ADM1'); await page.click('#staffForm button[type=submit]');
    await page.waitForFunction(() => /Check your admin id/i.test(document.body.innerText));
    check('R05-bad-format', true);
    await page.fill('#s-id', 'ADM-102'); await page.click('#staffForm button[type=submit]');
    await page.waitForFunction(() => document.body.innerText.includes('deactivated'));
    check('R05-deactivated-account', page.url().includes('signin') && !(await page.evaluate(() => sessionStorage.getItem('ask-admin'))), 'inactive account blocked with "deactivated"');
    check('R05-no-console-errors', errors.length === 0, errors.join(' | '));
    for (const [flag, word] of [['expired', 'expired'], ['deactivated', 'deactivated'], ['denied', 'right staff account']]) {
      await page.goto(`${B}/admin_portal/signin.html?${flag}`);
      await page.waitForFunction(w => document.body.innerText.includes(w), word);
      check(`R05-flag-${flag}`, true);
    }
    await page.context().close();
  }

  /* ---------- no session → expired (R05, R09) ---------- */
  {
    const { page } = await newPage(env);
    await page.goto(`${B}/admin_portal/index.html`);
    await page.waitForURL(/signin\.html\?expired/);
    await page.waitForFunction(() => document.body.innerText.includes('session expired'));
    check('R09-no-session-expired', true, page.url());
    await page.context().close();
  }

  /* ---------- Admin (front desk) ---------- */
  {
    const { page, errors } = await newPage(env);
    await signInAs(page, B, 'fd');
    const acct = JSON.parse(await page.evaluate(() => sessionStorage.getItem('ask-admin')));
    check('R06-fd-session', acct && acct.id === 'ADM-101' && acct.type === 'frontdesk' && await page.evaluate(() => sessionStorage.getItem('ask-role')) === 'admin', JSON.stringify(acct));
    await page.waitForSelector('.rail nav a');
    check('R07-fd-nav', same(await navTexts(page), FD_NAV), (await navTexts(page)).join(', '));
    check('R07-fd-no-group-labels', (await groups(page)).length === 0);
    check('R01-fd-label', (await page.textContent('.rail-role')).trim() === 'Admin');
    check('R12-fd-person', (await page.textContent('.rail-me')).includes('Daniel Ong') && (await page.textContent('.rail-me')).includes('HQ Dojo'));
    check('R13-no-centre-switcher', (await page.locator('select[data-centre], .centre-switch').count()) === 0);
    check('R10-fd-no-data-ba', (await page.locator('[data-ba]').count()) === 0, 'index');
    const d = await db(page);
    check('R17-seed-keys', ['staff', 'ledger', 'refunds', 'exceptions', 'guests', 'equipment', 'followups', 'closures', 'rosters', 'memberInfo', 'imports', 'policies', 'sentLog', 'interventions', 'cohorts'].every(k => k in d));
    check('R17-seed-members', d.members.length >= 24 && d.members.some(m => m.source === 'External') && d.members.some(m => m.kind === 'child' && m.guardian) && d.members.some(m => m.st === 'Lapsed') && d.members.some(m => m.due), `members: ${d.members.length}`);
    check('R17-seed-policies', d.policies.registration === 60 && d.policies.annualDues === 48 && same(d.policies.methods, ['Stripe']) && d.policies.discounts.senior.pct === 40 && d.policies.discounts.student.pct === 50 && d.policies.booking.cancelHours === 4);
    check('R17-ledger-stripe-only', d.ledger.every(l => l.method === 'Stripe') && ['Paid', 'Failed', 'Processing', 'Outstanding'].every(s => d.ledger.some(l => l.st === s)));
    check('R17-sessions-defaults', d.sessions.every(s => s.mat && s.start && s.end));
    check('R17-guests', d.guests.some(g => g.used) && ['trial', 'day', 'week'].every(p => d.guests.some(g => g.pass === p)));
    // bell
    const b = await bell(page);
    check('R14-fd-bell', /Incomplete registrations/.test(b) && /Items to collect/.test(b) && /Follow-ups due/.test(b) && !/Exceptions/.test(b), b.replace(/\n/g, ' | '));
    // helpers from admin-shell.js
    const h = await page.evaluate(() => ({
      d1: discountFor('2003-01-01', false).pct, d2: discountFor('1950-01-01', false).pct, d3: discountFor('1990-01-01', false).pct, d4: discountFor('1990-01-01', true).pct,
      w1: whyNotFor({ g: '6th Kyu', gender: 'Male', age: 30 }, { type: 'Advanced' }), w2: whyNotFor({ g: '1st Kyu', gender: 'Male', age: 30 }, { type: 'Advanced' }), w3: whyNotFor({ g: '5th Kyu', gender: 'Male', age: 30 }, { type: 'Ladies' }),
      s: classState(new Date(), { time: '23:59' }), key: rosterKey(new Date(2026, 0, 5), { time: '19:00' })
    }));
    check('R104-helpers', h.d1 === 50 && h.d2 === 40 && h.d3 === 0 && h.d4 === 50 && h.w1 && !h.w2 && h.w3 === 'Ladies only' && h.key === '2026-01-05|19:00' && h.s === 'Upcoming', JSON.stringify(h));
    const src = await (await page.request.get(`${B}/admin_portal/admin-shell.js`)).text();
    check('R104-server-comment', /repeat/i.test(src) && /server/i.test(src));
    // pages
    for (const p of EXISTING_FD) {
      await page.goto(`${B}/admin_portal/${p}.html`);
      await page.waitForSelector('.rail nav a');
      const html = await page.content();
      check(`R01-fd-${p}-no-HQ-Admin`, !/HQ Admin/.test(html) && !/waiting for HQ/i.test(html));
      check(`R10-fd-${p}-no-data-ba`, (await page.locator('[data-ba]').count()) === 0);
      check(`R15-fd-${p}-no-hardcoded`, !/1,248|42,600/.test(await text(page)));
      check(`R101-fd-${p}-1280-no-overflow`, !(await overflow(page)));
    }
    await page.goto(`${B}/admin_portal/members.html`);
    check('R51-fd-no-export', (await page.locator('[data-export="members"]').count()) === 0);
    const act = (await db(page)).members.filter(m => m.st === 'Active').length, total = (await db(page)).members.length;
    check('R15-members-count', (await page.textContent('#memSub')).includes(`${act} active of ${total}`), await page.textContent('#memSub'));
    await page.goto(`${B}/admin_portal/index.html`);
    await page.waitForTimeout(1800);
    // FEAT-002 replaced the front desk home with Today: its registrations card is counted from the data
    const apps = await page.evaluate(() => APPS.length);
    check('R15-dashboard-counts', +(await page.textContent('#fdStats .stat:nth-child(4) .v')) === apps, `incomplete registrations ${apps}`);
    await page.goto(`${B}/admin_portal/notify.html`);
    check('R15-notify-preview', /\d+ recipients?/.test(await page.textContent('#audPreview')), await page.textContent('#audPreview'));   // FEAT-004: recipient count is computed from the data
    // BA-only pages → home with the toast (R09)
    for (const p of ['grading', 'reports']) {
      await page.goto(`${B}/admin_portal/${p}.html`);
      await page.waitForURL(/admin_portal\/index\.html/);
      await page.waitForFunction(() => document.body.innerText.includes('That page is for Business Admins'));
      check(`R09-fd-blocked-${p}`, true, page.url());
    }
    check('R09-ba-keys-guarded', await page.evaluate(ks => ks.every(k => ADMIN_PAGES.some(p => p[0] === k && p[4])), BA_KEYS), 'every BA-only key is flagged in ADMIN_PAGES (pages not built yet)');
    check('R09-fd-menu-has-no-ba-pages', await page.evaluate(ks => !P.pages.some(p => ks.includes(p[0])), BA_KEYS));
    check('R09-flash-param-removed', !page.url().includes('baonly'));
    check('R100-fd-console-errors', errors.length === 0, errors.join(' | '));
    // shots
    await page.goto(`${B}/admin_portal/index.html`); await shot(page, 'fd-dashboard-1280');
    await page.context().close();
  }

  /* ---------- Admin (front desk) at 390 ---------- */
  {
    const { page, errors } = await newPage(env, { mobile: true });
    await signInAs(page, B, 'fd');
    await page.waitForSelector('.tabbar');
    check('R08-fd-tabbar', same(await tabs(page), ['Today', 'Classes', 'Members', 'Payments', 'More']), (await tabs(page)).join(', '));
    for (const p of EXISTING_FD) {
      await page.goto(`${B}/admin_portal/${p}.html`); await page.waitForSelector('.tabbar');
      check(`R101-fd-${p}-390-no-overflow`, !(await overflow(page)));
    }
    check('R100-fd-390-console-errors', errors.length === 0, errors.join(' | '));
    await page.goto(`${B}/admin_portal/index.html`); await shot(page, 'fd-dashboard-390');
    await page.context().close();
  }

  /* ---------- Business Admin ---------- */
  {
    const { page, errors } = await newPage(env);
    await signInAs(page, B, 'ba');
    const acct = JSON.parse(await page.evaluate(() => sessionStorage.getItem('ask-admin')));
    check('R06-ba-session', acct && acct.id === 'ADM-001' && acct.type === 'business', JSON.stringify(acct));
    await page.waitForSelector('.rail nav a');
    check('R07-ba-nav', same(await navTexts(page), BA_NAV), (await navTexts(page)).join(', '));
    check('R07-ba-groups', same(await groups(page), ['Front desk', 'Management', 'Control']), (await groups(page)).join(', '));
    check('R07-groups-not-links', (await page.locator('.rail nav .grp a').count()) === 0 && (await page.locator('.rail nav a').count()) === 15);
    check('R01-ba-label', (await page.textContent('.rail-role')).trim() === 'Business Admin');
    check('R12-ba-person', (await page.textContent('.rail-me')).includes('Grace Lim'));
    check('R10-ba-has-data-ba', (await page.locator('[data-ba]').count()) > 0);
    const b = await bell(page);
    check('R14-ba-bell', /Exceptions/.test(b) && /Payment failures/.test(b) && /Import issues/.test(b) && /Promotion results/.test(b) && !/Items to collect/.test(b), b.replace(/\n/g, ' | '));
    for (const p of EXISTING_BA) {
      await page.goto(`${B}/admin_portal/${p}.html`);
      await page.waitForSelector('.rail nav a');
      const html = await page.content();
      check(`R01-ba-${p}-no-HQ-Admin`, !/HQ Admin/.test(html));
      check(`R09-ba-${p}-opens`, page.url().includes(`/${p}.html`), page.url());
      check(`R101-ba-${p}-1280-no-overflow`, !(await overflow(page)));
    }
    await page.goto(`${B}/admin_portal/members.html`);
    check('R51-ba-has-export', (await page.locator('[data-export="members"]').count()) === 1);
    await page.goto(`${B}/admin_portal/payments.html`);
    await page.waitForTimeout(1800);
    const led = (await db(page)).ledger;
    const out = led.filter(l => l.st === 'Outstanding').reduce((s, l) => s + l.amt, 0);
    check('R15-payments-outstanding', +(await page.textContent('#payStats .stat:nth-child(2) .v')).replace(/[^0-9.]/g, '') === out, `${await page.textContent('#payStats .stat:nth-child(2) .v')} vs ${out}`);
    await page.click('[data-pt="month"]');
    check('R15-payments-rows', (await page.locator('#payRows tr').count()) > 3);
    check('R100-ba-console-errors', errors.length === 0, errors.join(' | '));
    await page.goto(`${B}/admin_portal/index.html`); await shot(page, 'ba-dashboard-1280');
    await page.context().close();
  }
  {
    const { page, errors } = await newPage(env, { mobile: true });
    await signInAs(page, B, 'ba');
    await page.waitForSelector('.tabbar');
    check('R08-ba-tabbar', same(await tabs(page), ['Overview', 'Insights', 'Classes', 'Members', 'More']), (await tabs(page)).join(', '));
    for (const p of EXISTING_BA) {
      await page.goto(`${B}/admin_portal/${p}.html`); await page.waitForSelector('.tabbar');
      check(`R101-ba-${p}-390-no-overflow`, !(await overflow(page)));
    }
    check('R100-ba-390-console-errors', errors.length === 0, errors.join(' | '));
    await page.goto(`${B}/admin_portal/index.html`); await shot(page, 'ba-dashboard-390');
    await page.context().close();
  }

  /* ---------- an old saved database loads without throwing (R17, R103) ---------- */
  {
    const { page, errors } = await newPage(env);
    // plant an old-shape database before any page script runs (a page that is unloading would save over it)
    await page.addInitScript(() => {
      if (!localStorage.getItem('ask-prototype-v3')) localStorage.setItem('ask-prototype-v3', JSON.stringify({
        members: [{ n: 'Old Member', no: 'ASK-OLD-1', g: '6th Kyu', dojo: 'hq', hrs: 3, st: 'Active', joined: 'Jan 2020' }],
        sessions: [{ day: 0, time: '19:00', type: 'Adults', ins: 'Bob Tan Sensei', cap: 20, booked: 2, dojo: 'hq', code: 'HQ-OLD-1' }],
        rmSeed: 2, fbSeed: true
      }));
    });
    await signInAs(page, B, 'ba');
    await page.waitForSelector('.rail nav a');
    await page.evaluate(() => save());
    const d = await db(page);
    check('R17-old-db-no-throw', errors.length === 0, errors.join(' | '));
    check('R17-old-db-members-kept-and-added', d.members[0].no === 'ASK-OLD-1' && d.members[0].n === 'Old Member' && d.members.length > 10);
    check('R17-old-db-session-fields-added', d.sessions[0].code === 'HQ-OLD-1' && d.sessions[0].booked === 2 && d.sessions[0].mat === 'Mat A' && d.sessions[0].end === '20:00');
    check('R17-old-db-new-keys-present', Array.isArray(d.staff) && d.admSeed === 1);
    await page.goto(`${B}/admin_portal/members.html`); await page.waitForSelector('#memRows tr');
    check('R17-old-db-members-page', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  /* ---------- sign out clears the role (R06) ---------- */
  {
    const { page } = await newPage(env);
    await signInAs(page, B, 'ba');
    await page.click('[data-logout]'); await page.waitForURL(/signin/);
    check('R06-signout-clears', (await page.evaluate(() => sessionStorage.getItem('ask-admin'))) === null && (await page.evaluate(() => sessionStorage.getItem('ask-role'))) === null);
    await page.goto(`${B}/admin_portal/index.html`); await page.waitForURL(/signin\.html\?expired/);
    check('R09-after-signout-expired', true);
    await page.context().close();
  }
} catch (e) {
  check('FEAT-001-script-ran-to-end', false, String(e && e.stack || e));
} finally {
  await env.close();
}
finish();
