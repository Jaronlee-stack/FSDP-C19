// Loads every portal page in headless Edge at 1280 and 390 px; reports console errors and failed requests.
// Run: node .db-tmp/browser-check.mjs   (playwright-core lives in %TEMP%\askpw, not in the repo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, PUBLIC } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(pathToFileURL(path.join(process.env.TEMP, 'askpw', 'node_modules', 'playwright-core', 'index.mjs')).href);
const SHOTS = path.join(HERE, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.relative(PUBLIC, path.join(dir, e.name)).replace(/\\/g, '/')] : []);
const pages = walk(PUBLIC).filter(p => /^(student_portal|instructor_portal|admin_portal|landingpage)\//.test(p)).sort();
const SHOT = new Set(['student_portal/index.html', 'student_portal/book.html', 'student_portal/grading.html', 'student_portal/profile.html', 'instructor_portal/index.html', 'admin_portal/index.html', 'admin_portal/sessions.html', 'landingpage/dojo.html']);

const sessionFor = p => {
  if (p.startsWith('student_portal/') && p !== 'student_portal/login.html') return { 'ask-role': 'student' };
  if (p.startsWith('instructor_portal/')) return { 'ask-role': 'instructor' };
  if (p.startsWith('admin_portal/') && p !== 'admin_portal/signin.html') return { 'ask-role': 'admin', 'ask-admin': JSON.stringify({ id: 'ADM-001', name: 'Grace Lim', type: 'business' }) };
  return {};
};

const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
let errors = 0, failed = 0;
const lines = [];
try {
  for (const width of [1280, 390]) {
    for (const p of pages) {
      const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
      const sess = sessionFor(p);
      await ctx.addInitScript(s => { try { for (const k in s) if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, s[k]); } catch (_) {} }, sess);
      const page = await ctx.newPage();
      const problems = [];
      page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico') && !/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_ABORTED|ERR_CONNECTION/.test(m.text())) problems.push(`console: ${m.text()} (${m.location().url})`); });
      page.on('pageerror', e => problems.push('pageerror: ' + e.message));
      page.on('requestfailed', r => { if (r.url().startsWith(base)) problems.push('request failed: ' + r.url()); });   // external logo/font hosts are not reachable offline: ignored
      page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
      await page.goto(base + p, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const landed = new URL(page.url()).pathname.replace(/^\//, '');
      if (landed !== p && !(p === 'instructor_portal/grading.html' && landed === 'instructor_portal/index.html')) problems.push(`redirected to ${landed}`);   // grading is gated to examiners during a shift: the redirect is expected
      if (SHOT.has(p)) await page.screenshot({ path: path.join(SHOTS, `${p.replace(/\//g, '_').replace('.html', '')}-${width}.png`), fullPage: true });
      problems.forEach(x => (/failed|HTTP/.test(x) ? failed++ : errors++));
      lines.push(`${problems.length ? 'FAIL' : 'ok  '} ${width} ${p}${problems.length ? '\n       ' + problems.join('\n       ') : ''}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.log(lines.join('\n'));
console.log(`\nconsole/page errors: ${errors}, failed requests: ${failed}, pages: ${pages.length} x 2 widths`);
process.exit(errors || failed ? 1 : 0);
