// Browser: the level-up (progress) button stays done across pages, reload and sign-out/in. Headless Edge at 1280 and 390.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect } from './lib.mjs';
import { launch, newPage, settle, signInStudent, SCREENS } from './browser-lib.mjs';
const t = suite('browser-levelup');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const pg = await pgConnect();
const closeModals = page => page.evaluate(() => { if (document.querySelector('#modal.open')) closeModal(); });
const cards = page => page.locator('.lvl-card[data-claim="session"]').count();
const count = page => page.locator('#nbCount').innerText();
try {
  const sess = (await pg.query(`select lesson_id from class_session where status <> 'Cancelled' and session_date <= '2026-11-06' order by session_date desc, start_time desc limit 4`)).rows.map(r => r.lesson_id);
  for (const width of [1280, 390]) {
    await pg.query(`delete from level_up_ack`);
    await pg.query(`update class_attendance set marked_at = now() - interval '30 days' where user_id='S-001' and attendance_status='Attended'`);
    await pg.query(`insert into class_attendance (lesson_id,user_id,attendance_status,marked_at) values ($1,'S-001','Attended',now()) on conflict (lesson_id,user_id) do update set attendance_status='Attended', marked_at=now()`, [sess[width === 1280 ? 0 : 1]]);
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStudent(page, base);
    await page.waitForTimeout(800); await closeModals(page);
    const tag = `@${width}`;
    t.check(`${tag} prompt shown before tapping`, (await cards(page)) === 1);
    const before = Number(await count(page));
    await page.screenshot({ path: path.join(SCREENS, `levelup-before-${width}.png`) });
    await page.click('.lvl-card[data-claim="session"]');
    await page.waitForTimeout(1500); await closeModals(page);
    t.check(`${tag} prompt cleared after tap and bar moved +1`, (await cards(page)) === 0 && Number(await count(page)) === before + 1, `${before} -> ${await count(page)}`);
    await page.screenshot({ path: path.join(SCREENS, `levelup-after-${width}.png`) });
    t.check(`${tag} saved in db`, (await pg.query(`select count(*)::int n from level_up_ack where user_id='S-001'`)).rows[0].n === 1);
    await page.goto(`${base}/student_portal/packages.html`); await settle(page); await page.waitForTimeout(500);
    await page.goto(`${base}/student_portal/index.html`); await settle(page); await page.waitForTimeout(1200); await closeModals(page);
    t.check(`${tag} still done after another page and back`, (await cards(page)) === 0 && Number(await count(page)) === before + 1, `${await cards(page)} ${await count(page)}`);
    await page.reload(); await settle(page); await page.waitForTimeout(1200); await closeModals(page);
    t.check(`${tag} still done after reload`, (await cards(page)) === 0 && Number(await count(page)) === before + 1);
    await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    await signInStudent(page, base); await page.waitForTimeout(1200); await closeModals(page);
    t.check(`${tag} still done after sign-out and sign-in`, (await cards(page)) === 0 && Number(await count(page)) === before + 1);
    await page.screenshot({ path: path.join(SCREENS, `levelup-after-signin-${width}.png`) });
    t.check(`${tag} zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }

  // failure keeps the prompt and shows the error toast
  {
    await pg.query(`delete from level_up_ack`);
    const { ctx, page, problems } = await newPage(browser, base, { width: 1280, allow: ['level-ups/ack', 'Failed to load resource'] });
    await signInStudent(page, base); await page.waitForTimeout(800); await closeModals(page);
    const before = Number(await count(page));
    await page.route('**/level-ups/ack', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } }) }));
    t.check('failure: prompt shown', (await cards(page)) === 1);
    await page.click('.lvl-card[data-claim="session"]'); await page.waitForTimeout(800);
    t.check('failure: prompt kept and bar not moved', (await cards(page)) === 1 && Number(await count(page)) === before);
    t.check('failure: error toast shown', (await page.locator('.toast').allInnerTexts()).join(' ').length > 0, (await page.locator('.toast').allInnerTexts()).join('|'));
    await page.screenshot({ path: path.join(SCREENS, 'levelup-failure-1280.png') });
    t.check('failure: nothing saved', (await pg.query(`select count(*)::int n from level_up_ack`)).rows[0].n === 0);
    await page.unroute('**/level-ups/ack');
    await page.click('.lvl-card[data-claim="session"]'); await page.waitForTimeout(1500);
    t.check('failure: retry works once the server answers', (await cards(page)) === 0 && Number(await count(page)) === before + 1);
    await ctx.close();
  }
} finally { await browser.close(); await app.stop(); await pg.end(); }
t.done();
