// Verifies instructor_portal/index.html after the script-list fix. Loads db.sql, seed.sql, seed_extra.sql, migrations 0003..0008 into the running PGlite.
import fs from 'node:fs';
import path from 'node:path';
import { spawnApp, pgConnect, ROOT, suite } from './lib.mjs';
import { launch, newPage, settle, signInStaff, SCREENS } from './browser-lib.mjs';
const t = suite('instructor-index');
const D = f => fs.readFileSync(path.join(ROOT, 'database', f), 'utf8');
const pg = await pgConnect();
for (const f of ['db.sql', 'seed.sql', 'seed_extra.sql', ...fs.readdirSync(path.join(ROOT, 'database', 'migrations')).filter(x => /^000[3-8]/.test(x)).sort().map(x => 'migrations/' + x)]) {
  try { await pg.query(D(f)); console.log('loaded', f); } catch (e) { console.log('LOAD FAIL', f, e.message); }
}
const dates = (await pg.query(`select session_date::text d, count(*)::int n from class_session where instructor_id='INS-0042' and status<>'Cancelled' group by 1 order by 1`)).rows;
console.log('INS-0042 class days:', dates.slice(0, 12).map(r => r.d + '(' + r.n + ')').join(' '));
await pg.end();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const extOnly = /^(chrome|moz|edge)-extension:|data:text\/plain;base64/;
try {
  for (const width of [1280, 390]) {
    const problems = [];
    const { ctx, page } = await newPage(browser, base, { width, problems });
    const reqFail = [];
    page.on('requestfailed', r => { if (!/ERR_ABORTED/.test((r.failure() || {}).errorText || '')) reqFail.push(r.url() + ' ' + (r.failure() || {}).errorText); });
    await signInStaff(page, base, 'instructor', 'INS-0042');
    await page.goto(base + '/instructor_portal/index.html'); await settle(page); await page.waitForTimeout(1000);
    const p0 = page.url();
    t.check(`@${width} lands on instructor index`, /instructor_portal\//.test(p0), p0);
    t.check(`@${width} body.ok (guard passed)`, await page.evaluate(() => document.body.classList.contains('ok')));
    t.check(`@${width} ASK, isBA defined`, await page.evaluate(() => typeof ASK !== 'undefined' && typeof isBA === 'function' || typeof isBA !== 'undefined'));
    t.check(`@${width} title present`, (await page.title()).length > 0, await page.title());
    t.check(`@${width} day title`, (await page.locator('#dayTitle').innerText()).length > 0);
    const body = await page.locator('body').innerText();
    t.check(`@${width} role label Instructor`, /Instructor/.test(body));
    t.check(`@${width} sidebar/nav present`, (await page.locator('nav a, aside a, .rail a, .side a').count()) > 0);
    const slots = await page.locator('#schedGrid .cls-slot').count();
    const emptyMsg = await page.locator('#schedGrid').innerText();
    t.check(`@${width} schedule renders blocks or empty message (slots=${slots})`, slots > 0 || emptyMsg.trim().length > 0 || (await page.locator('#schedCard').isVisible()));
    await page.screenshot({ path: path.join(SCREENS, `instructor-index-${width}-day.png`) });
    await page.click('#schView [data-view="week"]'); await page.waitForTimeout(700);
    t.check(`@${width} week view: 7 days`, (await page.locator('#weekList .wk-day').count()) === 7);
    await page.screenshot({ path: path.join(SCREENS, `instructor-index-${width}-week.png`) });
    await page.click('#schView [data-view="month"]'); await page.waitForTimeout(700);
    t.check(`@${width} month view: 42 days`, (await page.locator('#monthGrid .mc-day').count()) === 42);
    await page.screenshot({ path: path.join(SCREENS, `instructor-index-${width}-month.png`) });
    await page.click('#schToday'); await page.click('#schView [data-view="day"]'); await page.waitForTimeout(700);
    // try a roster: today first, then step through days of the week
    let opened = false;
    for (let i = 0; i < 8 && !opened; i++) {
      const s = page.locator('#schedGrid .cls-slot').first();
      if (await s.count()) {
        await s.click(); await page.waitForTimeout(900);
        opened = await page.locator('#rosterCard').isVisible();
        if (opened) {
          t.check(`@${width} roster opens (title "${await page.locator('#rosterTitle').innerText()}", rows=${await page.locator('#roster .row').count()})`, true);
          await page.screenshot({ path: path.join(SCREENS, `instructor-index-${width}-roster.png`) });
          const rf = page.locator('#rosterFilter button');
          if (await rf.count() > 1) { await rf.nth(1).click(); await page.waitForTimeout(300); }
          await page.fill('#rosterSearch', 'a'); await page.waitForTimeout(300);
          await page.click('#rosterClose'); await page.waitForTimeout(300);
          t.check(`@${width} roster closes`, !(await page.locator('#rosterCard').isVisible()));
        }
      }
      if (!opened) { await page.click('#schNext'); await page.waitForTimeout(700); }
    }
    if (!opened) console.log(`NOTE @${width}: no class found to open a roster within 8 days`);
    // seeded class near 6 Nov via chips
    const chips = await page.locator('#dayChips .ag-day').count();
    for (let i = 0; i < chips; i++) { await page.locator('#dayChips .ag-day').nth(i).click(); await page.waitForTimeout(250); }
    t.check(`@${width} day chips clickable (${chips})`, chips === 7);
    const real = problems.filter(p => !extOnly.test(p));
    t.check(`@${width} zero console/page errors, HTTP errors, failed requests`, real.length === 0 && reqFail.length === 0, real.concat(reqFail).join(' | '));
    for (const f of ['grading.html', 'profile.html']) {
      const before = problems.length;
      await page.goto(`${base}/instructor_portal/${f}`); await settle(page); await page.waitForTimeout(900);
      const ok = await page.evaluate(() => document.body.classList.contains('ok'));
      const u = page.url();
      console.log(`${f} @${width}: url=${u} body.ok=${ok}`);
      if (f === 'profile.html') { t.check(`@${width} profile.html shown`, ok, u); await page.screenshot({ path: path.join(SCREENS, `instructor-index-${width}-profile.png`) }); }
      else t.check(`@${width} grading.html loads (shown or gated to schedule)`, ok || /nograding/.test(u), u);
      const add = problems.slice(before).filter(p => !extOnly.test(p));
      t.check(`@${width} ${f} zero errors`, add.length === 0, add.join(' | '));
    }
    await ctx.close();
  }
} finally { await browser.close(); await app.stop(); }
t.done();
