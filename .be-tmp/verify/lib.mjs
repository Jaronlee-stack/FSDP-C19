// Shared helpers for the verification scripts. Tooling (pglite, pg, playwright-core) lives in %TEMP%, never in the repo.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DB_PORT_FILE = path.join(HERE, '.dbport');
export const SERVER_FILE = path.join(HERE, '.server.json');
const askdb = path.join(process.env.TEMP, 'askdb');
export const requireDb = createRequire(path.join(askdb, 'package.json'));
export const importDb = name => import(pathToFileURL(requireDb.resolve(name)).href);
export const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const playwright = () => import(pathToFileURL(path.join(process.env.TEMP, 'askpw', 'node_modules', 'playwright-core', 'index.mjs')).href);

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
export const dbPort = () => Number(fs.readFileSync(DB_PORT_FILE, 'utf8').trim());

export async function pgConnect() {
  const pg = requireDb('pg');
  const c = new pg.Client({ host: '127.0.0.1', port: dbPort(), database: 'postgres', user: 'postgres', password: 'x' });
  await c.connect();
  return c;
}

export async function resetDb() {
  const c = await pgConnect();
  try {
    await c.query(fs.readFileSync(path.join(ROOT, 'database', 'db.sql'), 'utf8'));
    await c.query(fs.readFileSync(path.join(ROOT, 'database', 'seed.sql'), 'utf8'));
  } finally { await c.end(); }
}

/* env for one app run; the real .env is never read here (dotenv does not override variables that are already set) */
export function appEnv(port, extra = {}) {
  return {
    ...process.env,
    NODE_ENV: 'development', PORT: String(port), DB_HOST: '127.0.0.1', DB_PORT: String(dbPort()), DB_NAME: 'postgres', DB_USER: 'postgres',
    DB_PASSWORD: 'x', DB_POOL_MAX: '1', JWT_SECRET: 'verify-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    JWT_EXPIRES_IN: '8h', APP_FAKE_TODAY: '2026-11-06', LOGIN_RATE_MAX: '1000', CHANGE_PW_RATE_MAX: '1000', ...extra
  };
}

export async function spawnApp(extra = {}) {
  const port = await freePort();
  const proc = spawn(process.execPath, ['app.js'], { cwd: ROOT, env: appEnv(port, extra), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (proc.exitCode !== null) throw new Error('app exited early:\n' + log);
    try { const r = await fetch(base + '/api/v1/meta'); if (r.ok) break; } catch (_) { /* not up yet */ }
    await sleep(150);
  }
  return { proc, port, base, log: () => log, stop: () => new Promise(r => { if (proc.exitCode !== null) return r(); proc.once('exit', r); proc.kill(); }) };
}

/* base URL of the long-running server started by server.mjs */
export const serverBase = () => JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8')).base;

/* fetch client with a cookie jar */
export function client(base) {
  const jar = {}; const raw = [];
  const api = async (method, p, body, { headers = {}, rawBody, noJson } = {}) => {
    const h = { ...headers };
    if (!noJson && method !== 'GET' && method !== 'HEAD' && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + '/api/v1' + p, { method, headers: h, body: rawBody !== undefined ? rawBody : method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body ?? {}), redirect: 'manual' });
    for (const sc of res.headers.getSetCookie()) { raw.push(sc); const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '' || /expires=thu, 01 jan 1970/i.test(sc)) delete jar[k]; else jar[k] = v; }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (_) { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { api, jar, rawCookies: raw, get: (p, o) => api('GET', p, undefined, o), post: (p, b, o) => api('POST', p, b, o), put: (p, b, o) => api('PUT', p, b, o), patch: (p, b, o) => api('PATCH', p, b, o), del: (p, b, o) => api('DELETE', p, b, o) };
}

export async function login(base, portal, identifier, password = 'password123') {
  const c = client(base);
  const r = await c.post('/auth/login', { portal, identifier, password });
  c.loginResult = r;
  return c;
}

export const ACCOUNTS = {
  student: ['student', 'ASK-2025-1834'],
  instructor: ['instructor', 'INS-0042'],
  business: ['admin', 'ADM-001'],
  frontdesk: ['admin', 'ADM-101']
};

/* secrets that must never appear in a response body, an audit row or the DOM: bcrypt hashes, JWTs and any captured plain passwords */
export const SECRET_PATTERNS = [/\$2[aby]\$\d\d\$/, /eyJ[\w-]+\.[\w-]+\.[\w-]+/];
export function findSecrets(value, plain = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const hits = SECRET_PATTERNS.filter(re => re.test(text)).map(String);
  for (const p of plain) if (p && text.includes(p)) hits.push('plain:' + p.slice(0, 2) + '…');
  return hits;
}

/* tiny test runner */
export function suite(name) {
  const results = []; let failed = 0;
  const check = (label, ok, detail = '') => { if (!ok) failed++; results.push({ label, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  -> ' + detail : ''}`); };
  const expect = (label, r, status, code) => {
    const ok = r.status === status && (code === undefined || (r.json && r.json.error && r.json.error.code === code));
    check(label, ok, `got ${r.status} ${r.text.slice(0, 160)}`);
  };
  const done = () => { console.log(`\n${name}: ${results.length - failed}/${results.length} passed`); process.exitCode = failed ? 1 : 0; return failed === 0; };
  return { check, expect, done };
}
