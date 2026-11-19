// Quick acceptance probes for FEAT-001 evaluated inside the portal page (uses serve.mjs and playwright-core from %TEMP%\askpw).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';
const { chromium } = await import(pathToFileURL(path.join(process.env.TEMP, 'askpw', 'node_modules', 'playwright-core', 'index.mjs')).href);
const { server, port } = await startServer(0);
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const ctx = await browser.newContext();
await ctx.addInitScript(() => { try { sessionStorage.setItem('ask-role', 'admin'); sessionStorage.setItem('ask-admin', JSON.stringify({ id: 'ADM-001', name: 'Grace Lim', type: 'business' })); } catch (_) {} });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/admin_portal/index.html`);
const r = await page.evaluate(() => {
  const s = SEED(), codes = s.sessions.map(x => x.code), iso = isoDate;
  const sun11 = CLASSES.find(c => c.day === 6 && c.time === '11:00');
  const sunIns = CLASSES.filter(c => c.day === 6).map(c => c.ins);
  const tue = SESSIONS.find(x => x.dojo === HQ && x.day === 1 && x.time === '19:00' && x.type === 'Adults');
  return {
    today: iso(TODAY), sessions: s.sessions.length, hq: s.sessions.filter(x => x.dojo === HQ).length, unique: new Set(codes).size, classes: CLASSES.length,
    hqCodeSun11: s.sessions[18].code, sun11ins: sun11.ins, sundayInstructors: sunIns,
    dec13Cancelled: closureOn(new Date(2026, 11, 13), tue) && 'HQ closed', hqClosedDec13: !!hqClosedOn(new Date(2026, 11, 13)),
    tueCancelled: iso(lastDow_(1)) && !!closureOn(DB.closures.find(c => c.id === 'C-03').from, tue),
    attendance: DB.attendance.map(a => `${iso(a.date)} ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(new Date(a.date).getDay() + 6) % 7]} ${a.time} ${a.ins} ${a.status}`),
    insMon: myClassesSafe(new Date(2026, 11, 13))
  };
  function lastDow_(dow) { const d = new Date(TODAY); do { d.setDate(d.getDate() - 1); } while ((d.getDay() + 6) % 7 !== dow); return d; }
  function myClassesSafe(d) { return hqClosedOn(d) ? [] : 'open'; }
});
console.log(JSON.stringify(r, null, 1));
await browser.close(); server.close();
