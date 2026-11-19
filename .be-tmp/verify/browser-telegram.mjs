// Browser run (headless Edge): the Telegram card on the student profile page, both states, 1280 and 390.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect } from './lib.mjs';
import { launch, newPage, settle, signInStudent, SCREENS } from './browser-lib.mjs';
const t = suite('browser-telegram');
await resetDb();
const NO_TG = { TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '', BREVO_API_KEY: '' };
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const browser = await launch();
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
try {
  for (const withBot of [false, true]) {
    const app = await spawnApp({ ...NO_TG, ...(withBot ? { TELEGRAM_BOT_USERNAME: 'ASK_Test_Bot' } : {}) });
    try {
      for (const width of [1280, 390]) {
        await q(`UPDATE student_profile SET telegram_chat_id = NULL`);
        const { ctx, page, problems } = await newPage(browser, app.base, { width });
        await signInStudent(page, app.base);
        await page.goto(`${app.base}/student_portal/profile.html`); await settle(page);
        const tag = `bot=${withBot ? 'set' : 'none'} @${width}`;
        t.check(`${tag}: card visible, status Not linked`, await page.locator('#tgCard').isVisible() && (await page.locator('#tgStatus').innerText()).trim() === 'Not linked');
        t.check(`${tag}: five numbered steps`, (await page.locator('#tgBody .tg-steps li').count()) === 5);
        t.check(`${tag}: shows the signed-in student's own member number`, (await page.locator('#tgMemberNo').innerText()).trim() === 'ASK-2025-1834');
        const link = page.locator('#tgBody a.sbtn');
        if (withBot) {
          t.check(`${tag}: Open bot link points to t.me/ASK_Test_Bot`, (await link.count()) === 1 && (await link.getAttribute('href')) === 'https://t.me/ASK_Test_Bot');
        } else {
          t.check(`${tag}: no button, text "Ask the office for the bot name"`, (await link.count()) === 0 && /Ask the office for the bot name/.test(await page.locator('#tgBody').innerText()));
        }
        t.check(`${tag}: nothing wider than the viewport`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        await page.locator('#tgCard').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SCREENS, `telegram-notlinked-${withBot ? 'bot' : 'nobot'}-${width}.png`), fullPage: true });
        if (withBot) {
          await q(`UPDATE student_profile SET telegram_chat_id = '5550001' WHERE member_no = 'ASK-2025-1834'`);
          await page.reload(); await settle(page);
          t.check(`${tag}: linked state: status Linked, Unlink button, no steps`, (await page.locator('#tgStatus').innerText()).trim() === 'Linked' && await page.locator('#tgUnlink').isVisible() && (await page.locator('#tgBody .tg-steps').count()) === 0);
          t.check(`${tag}: chat id is not in the page`, !(await page.content()).includes('5550001'));
          await page.screenshot({ path: path.join(SCREENS, `telegram-linked-${width}.png`), fullPage: true });
          await page.click('#tgUnlink'); await page.waitForTimeout(700);
          t.check(`${tag}: Unlink returns to Not linked and clears the DB row`, (await page.locator('#tgStatus').innerText()).trim() === 'Not linked' && (await q(`SELECT telegram_chat_id FROM student_profile WHERE member_no = 'ASK-2025-1834'`))[0].telegram_chat_id === null);
        }
        clean(tag, problems);
        await ctx.close();
      }
    } finally { await app.stop(); }
  }
} finally { await browser.close(); await pg.end(); }
t.done();
