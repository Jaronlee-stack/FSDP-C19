// Shared browser helpers (playwright-core + headless Edge, both outside the repo).
import fs from 'node:fs';
import path from 'node:path';
import { playwright, EDGE, HERE, ROOT } from './lib.mjs';

export const SCREENS = path.join(ROOT, '.be-tmp', 'screens');
fs.mkdirSync(SCREENS, { recursive: true });

export async function launch() {
  const { chromium } = await playwright();
  return chromium.launch({ executablePath: EDGE, headless: true });
}

/* errors that only mean "the internet is not reachable" (external logo/fonts) are not app problems */
const EXTERNAL_NOISE = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_ABORTED|ERR_CONNECTION|ERR_NETWORK|ERR_TUNNEL|ERR_PROXY|ERR_TIMED_OUT|net::ERR/;

/* a page whose console errors, page errors, failed same-origin requests and HTTP >= 400 are collected in `problems` */
export async function newPage(browser, base, { width = 1280, problems = [], allow = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const page = await ctx.newPage();
  const ignore = text => allow.some(a => (a instanceof RegExp ? a.test(text) : text.includes(a)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location().url || '', text = m.text();
    if (url.endsWith('/favicon.ico') || EXTERNAL_NOISE.test(text) || ignore(text)) return;
    problems.push(`console: ${text} (${url})`);
  });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  /* ERR_ABORTED = the browser cancelled a request because the page navigated away (for example the guard sending the front desk home). Not a server failure: HTTP errors are still counted below. */
  page.on('requestfailed', r => { if (r.url().startsWith(base) && !ignore(r.url()) && !/ERR_ABORTED/.test((r.failure() || {}).errorText || '')) problems.push('request failed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base) && !r.url().endsWith('/favicon.ico') && !ignore(`${r.status()} ${r.url()}`)) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return { ctx, page, problems };
}

export const settle = page => page.waitForLoadState('load').then(() => page.waitForTimeout(500));

/* sign in through the real forms */
export async function signInStudent(page, base, id = 'ASK-2025-1834', pw = 'password123') {
  await page.goto(base + '/student_portal/login.html');
  await settle(page);
  await page.fill('#l-id', id); await page.fill('#l-pass', pw);
  await Promise.all([page.waitForURL(/student_portal\/index\.html/, { timeout: 8000 }), page.click('#loginForm button[type="submit"]')]);
  await settle(page);
}
export async function signInStaff(page, base, role, id, pw = 'password123') {
  await page.goto(base + '/admin_portal/signin.html');
  await settle(page);
  await page.click(`#roleTabs [data-role="${role}"]`);
  await page.fill('#s-id', id); await page.fill('#s-pass', pw);
  await Promise.all([page.waitForURL(new RegExp(`${role}_portal/index\\.html`), { timeout: 8000 }), page.click('#staffForm button[type="submit"]')]);
  await settle(page);
}

export const storageDump = page => page.evaluate(() => ({
  local: Object.keys(localStorage), session: Object.keys(sessionStorage),
  localValues: Object.values(localStorage).join('|'), sessionValues: Object.values(sessionStorage).join('|'), cookie: document.cookie
}));

export const htmlPagesOf = dir => fs.readdirSync(path.join(ROOT, 'src', 'public', dir)).filter(f => f.endsWith('.html')).sort();
