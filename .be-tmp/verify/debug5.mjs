import { spawnApp, resetDb } from './lib.mjs';
import { launch, newPage, settle, signInStaff } from './browser-lib.mjs';
await resetDb();
const app = await spawnApp(); const base = app.base;
const browser = await launch();
try {
  const { page, problems } = await newPage(browser, base, { width: 1280 });
  page.on('console', m => console.log('console', m.type(), m.text()));
  page.on('response', r => { if (r.url().includes('/api/')) console.log('api', r.status(), r.url().replace(base, '')); });
  await signInStaff(page, base, 'admin', 'ADM-001');
  await page.goto(base + '/admin_portal/policies.html'); await settle(page); await page.waitForTimeout(800);
  await page.click('#polTabs [data-pt="triggers"]'); await page.fill('#t-dec', '30'); await page.click('#polForm button[type="submit"]'); await page.waitForTimeout(1500);
  console.log(await page.evaluate(() => JSON.stringify({ toasts: document.getElementById('toasts').innerText, modal: document.getElementById('modalBody').innerText.slice(0, 300), open: document.getElementById('modal').className })));
  console.log(problems);
} finally { await browser.close(); await app.stop(); process.exit(0); }
