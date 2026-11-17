// Verification library. API:
//   const env = await launch();            -> { browser, base, close() }   (starts the static server and Edge)
//   const { ctx, page, errors } = await newPage(env, { mobile })   fresh context, external requests blocked,
//                                          errors = console errors and uncaught page errors
//   await signInAs(page, env.base, 'ba' | 'fd' | 'instructor' | 'student')   always through the sign-in UI
//   await shot(page, 'ba-dashboard-1280')  -> .admin-fix-tmp/screens/<name>.png
//   setFeat('FEAT-001'); check(id, cond, msg)   records pass/fail in results.json
//   finish()                               prints a summary and sets the exit code
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(process.env.TEMP || process.env.TMP, 'admin-verify', 'x.js'));
const { chromium } = require('playwright-core');
export const SCREENS = path.resolve(here, '..', 'screens');
const RESULTS = path.join(here, 'results.json');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

export async function launch() {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  return { browser, base, close: async () => { await browser.close(); server.close(); } };
}

export async function newPage(env, { mobile = false } = {}) {
  const ctx = await env.browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}

const WHO = { ba: ['ADM-001', 'admin'], fd: ['ADM-101', 'admin'], instructor: ['INS-0042', 'instructor'] };
export async function signInAs(page, base, who) {
  if (who === 'student') {
    await page.goto(`${base}/student_portal/login.html`);
    await page.click('#loginForm button[type=submit]');
    await page.waitForURL(/student_portal\/index/);
    return;
  }
  const [id, tab] = WHO[who];
  await page.goto(`${base}/admin_portal/signin.html`);
  await page.click(`#roleTabs [data-role="${tab}"]`);
  await page.fill('#s-id', id);
  await page.click('#staffForm button[type=submit]');
  await page.waitForURL(tab === 'admin' ? /admin_portal\/index/ : /instructor_portal\/index/);
}

export async function shot(page, name) {
  fs.mkdirSync(SCREENS, { recursive: true });
  await page.waitForTimeout(3000);   // let count-ups and entrance animations finish
  await page.screenshot({ path: path.join(SCREENS, `${name}.png`), fullPage: false });
}

/* ---------- results.json ---------- */
let feat = 'FEAT-?', failed = 0, passed = 0;
export const setFeat = f => { feat = f; };
function load() { try { return JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch (_) { return { checks: [] }; } }
export function check(id, cond, msg = '') {
  const ok = !!cond; ok ? passed++ : failed++;
  const db = load();
  db.checks = db.checks.filter(c => !(c.feat === feat && c.id === id));
  db.checks.push({ feat, id, pass: ok, msg, at: new Date().toISOString() });
  fs.writeFileSync(RESULTS, JSON.stringify(db, null, 1));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${msg ? ' · ' + msg : ''}`);
  return ok;
}
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
export const text = page => page.evaluate(() => document.body.innerText);
