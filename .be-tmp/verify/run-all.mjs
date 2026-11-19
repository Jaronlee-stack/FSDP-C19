// Runs the whole verification: PGlite socket DB, every API and browser suite, the SQL injection suite and a few static checks.
// Usage: node .be-tmp/verify/run-all.mjs      (exit code 0 only when everything passes)
// Each suite resets the database itself and starts its own app instance (see lib.mjs spawnApp).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, ROOT, DB_PORT_FILE, SERVER_FILE, sleep } from './lib.mjs';

const LOGS = path.join(HERE, 'run-logs');
fs.mkdirSync(LOGS, { recursive: true });

const SUITES = [
  'api-auth', 'api-public', 'api-student', 'api-instructor', 'api-account', 'api-audit', 'api-admin-desk', 'api-admin-business', 'api-sqli',
  'browser-login', 'browser-student', 'browser-instructor', 'browser-admin-desk', 'browser-admin-business', 'browser-account', 'browser-audit'
];

const rows = [];
let dbProc = null;

const run = (file, args, opts = {}) => new Promise(resolve => {
  const p = spawn(process.execPath, [file, ...args], { cwd: ROOT, env: opts.env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => { out += '\nTIMEOUT'; p.kill(); }, opts.timeout || 600000);
  p.on('exit', code => { clearTimeout(timer); resolve({ code, out }); });
});

async function startDb() {
  try { fs.unlinkSync(DB_PORT_FILE); } catch (_) { /* none */ }
  dbProc = spawn(process.execPath, [path.join(HERE, 'db.mjs')], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100 && !fs.existsSync(DB_PORT_FILE); i++) await sleep(150);
  if (!fs.existsSync(DB_PORT_FILE)) throw new Error('PGlite did not start');
}

async function stopDb() {
  if (dbProc && dbProc.exitCode === null) { dbProc.kill(); await sleep(500); }
  for (const f of [DB_PORT_FILE, SERVER_FILE]) { try { fs.unlinkSync(f); } catch (_) { /* gone */ } }
}

/* ---------- static checks ---------- */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function staticChecks() {
  const res = [];
  const add = (name, ok, detail = '') => res.push({ name, ok, detail });

  const pub = walk(path.join(ROOT, 'src', 'public')).filter(f => /\.(js|html)$/.test(f));
  const text = f => fs.readFileSync(f, 'utf8');
  const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

  const banned = [/\bSEED\s*\(/, /\bDB_KEY\b/, /(?<![.\w])save\s*\(/, /\bdemoOn\b/, /\bsimulateTaps\b/, /ask-role/, /ask-admin/, /ask-last-id/, /ask-prototype/, /\bsessionStorage\b/,
    /\bresetDemo\b/, /\[data-reset\]/, /\badmSeed\b/, /\brmSeed\b/, /\bfbSeed\b/, /fallbackSeed/, /fallbackExtras/];
  const hits = [];
  for (const f of pub) {
    const t = text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   // comments may mention the old names
    for (const re of banned) if (re.test(t)) hits.push(`${rel(f)} ${re}`);
  }
  add('no SEED/save/DB_KEY/demo/prototype-storage leftovers in src/public', hits.length === 0, hits.join('; '));

  const allowed = new Set(['ask-rail', 'ask-home-view', 'ask-sound', 'VIEW_KEY', 'SOUND_KEY', 'k']);
  const storeHits = [];
  for (const f of pub) {
    const t = text(f);
    for (const m of t.matchAll(/localStorage\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const arg = m[2].trim().replace(/['"`]/g, '');
      if (!allowed.has(arg)) storeHits.push(`${rel(f)} ${m[0]}`);
    }
    if (/localStorage\.(clear|key)\b/.test(t)) storeHits.push(`${rel(f)} localStorage.clear/key`);
  }
  add('localStorage only used for the three UI preferences', storeHits.length === 0, storeHits.join('; '));

  const sqlHits = [];
  const code = walk(path.join(ROOT, 'src')).filter(f => f.endsWith('.js') && !f.includes(path.join('src', 'public')) && !f.includes(path.join('src', 'models')));
  for (const f of code) {
    const t = text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/\b(SELECT\s+[\w*"(]|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/.test(t)) sqlHits.push(rel(f));
  }
  add('no SQL outside src/models', sqlHits.length === 0, sqlHits.join('; '));

  const leak = [];
  for (const f of code) {
    const t = text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/qr_token/.test(t) && !/[\\/]models[\\/]/.test(f)) leak.push(rel(f) + ' qr_token');
    if (/password_hash/.test(t) && /[\\/](controllers|routes|middleware|validators)[\\/]/.test(f)) leak.push(rel(f) + ' password_hash');
  }
  add('qr_token / password_hash are not handled in controllers, routes, middleware or validators', leak.length === 0, leak.join('; '));

  /* ---------- round 2: registration passwords, audit log, hidden grading notes ---------- */
  const src = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const fnBody = (s, head) => { const i = s.indexOf(head); if (i < 0) return null; const j = s.indexOf('\n}\n', i); return s.slice(i, j < 0 ? undefined : j); };
  const regBody = fnBody(noComments(src('src/services/registrationService.js')), 'async function register(');
  add('registration response path returns no tempPassword (registrationService.register + publicController)', !!regBody && !/tempPassword/.test(regBody) && !/tempPassword/.test(noComments(src('src/controllers/publicController.js'))), regBody ? '' : 'register() not found');
  const listCols = (/const LIST_COLS = `([^`]*)`/.exec(src('src/models/applicationModel.js')) || [])[1];
  add('registration_application.password_hash is not in applicationModel LIST_COLS', !!listCols && !/password_hash/.test(listCols), listCols ? '' : 'LIST_COLS not found');
  const forStudent = (/const forStudent = [\s\S]*?\.then\(/.exec(noComments(src('src/models/remarkModel.js'))) || [])[0];
  add("remarkModel.forStudent never selects kind 'grading'", !!forStudent && !/grading/.test(forStudent), forStudent ? forStudent.slice(0, 120) : 'forStudent not found');
  const need = ['src/public/admin_portal/audit.html', 'src/public/admin_portal/admin-audit.js', 'src/public/js/account.js', 'src/middleware/requestContext.js', 'src/models/auditModel.js', 'src/services/auditService.js', 'src/routes/admin/audit.routes.js'];
  const gone = need.filter(f => !fs.existsSync(path.join(ROOT, f)));
  add('round-2 files exist (audit page, account.js, audit model/service/routes, request context)', gone.length === 0, gone.join('; '));
  const auditHtml = fs.existsSync(path.join(ROOT, need[0])) ? src(need[0]) : '';
  add('audit.html is an admin page (data-portal admin, data-page audit) loading admin-audit.js', /data-portal="admin"/.test(auditHtml) && /data-page="audit"/.test(auditHtml) && /admin-audit\.js/.test(auditHtml));
  add("portal.js ADMIN_PAGES has the BA-only 'audit' entry", /\['audit',[^\]]*'Audit log',\s*'Control',\s*true\]/.test(src('src/public/js/portal.js')));
  add('no session/local storage use in account.js or admin-audit.js', !/localStorage|sessionStorage/.test(src('src/public/js/account.js') + src('src/public/admin_portal/admin-audit.js')));
  add('audit_log has the append-only trigger in db.sql', /CREATE TRIGGER audit_log_no_change[\s\S]*BEFORE UPDATE OR DELETE ON audit_log/.test(src('database/db.sql')) && /CREATE TRIGGER audit_log_no_truncate[\s\S]*BEFORE TRUNCATE ON audit_log/.test(src('database/db.sql')));
  const readme = src('README.md'), dbReadme = src('database/README.md');
  const docMiss = ['CHANGE_PW_RATE_MAX', 'CHANGE_PW_RATE_WINDOW_MS', '/auth/change-password', '/admin/audit', 'PASSWORD_CHANGE_REQUIRED', 'must_change_password'].filter(s => !readme.includes(s))
    .concat(['audit_log', 'must_change_password', 'password_changed_at', 'password_hash', 'audit_log_guard'].filter(s => !dbReadme.includes(s)).map(s => 'database/README.md:' + s));
  add('README.md and database/README.md document the round-2 endpoints, env vars, columns and trigger', docMiss.length === 0, docMiss.join('; '));
  return res;
}

async function productionChecks() {
  const res = [];
  const env = { ...process.env, NODE_ENV: 'production', PORT: '0', DB_HOST: '127.0.0.1', DB_PORT: '1', DB_NAME: 'x', DB_USER: 'x', DB_PASSWORD: 'x' };
  delete env.JWT_SECRET;
  const r = await run('app.js', [], { env, timeout: 20000 });
  res.push({ name: 'production start without JWT_SECRET fails fast', ok: r.code !== 0 && /JWT_SECRET/.test(r.out), detail: `exit ${r.code}` });
  return res;
}

/* ---------- main ---------- */
let exitCode = 1;
try {
  await startDb();
  for (const name of SUITES) {
    const t0 = Date.now();
    process.stdout.write(`running ${name} ... `);
    const r = await run(path.join(HERE, name + '.mjs'), []);
    fs.writeFileSync(path.join(LOGS, name + '.log'), r.out);
    const m = [...r.out.matchAll(/(\d+)\/(\d+) passed/g)].pop();
    const row = { name, ok: r.code === 0 && !!m && m[1] === m[2], passed: m ? +m[1] : 0, total: m ? +m[2] : 0, code: r.code, secs: Math.round((Date.now() - t0) / 1000) };
    rows.push(row);
    console.log(`${row.ok ? 'ok' : 'FAILED'} (${row.passed}/${row.total}, ${row.secs}s)`);
    if (!row.ok) console.log(r.out.split('\n').filter(l => /FAIL|Error|DEBUG|TIMEOUT/.test(l)).slice(0, 25).join('\n'));
    await sleep(300);
  }
  const extra = [...staticChecks(), ...await productionChecks()];

  console.log('\n=== Summary ===');
  console.log('suite'.padEnd(26) + 'result'.padEnd(10) + 'checks');
  for (const r of rows) console.log(r.name.padEnd(26) + (r.ok ? 'PASS' : 'FAIL').padEnd(10) + `${r.passed}/${r.total}`);
  for (const e of extra) console.log(e.name.slice(0, 66).padEnd(66) + (e.ok ? 'PASS' : 'FAIL') + (e.ok ? '' : '  ' + e.detail));
  const allOk = rows.every(r => r.ok) && extra.every(e => e.ok);
  const sum = rows.reduce((a, r) => a + r.passed, 0), tot = rows.reduce((a, r) => a + r.total, 0);
  console.log(`\nTotal suite checks: ${sum}/${tot}; static checks: ${extra.filter(e => e.ok).length}/${extra.length}`);
  console.log(allOk ? 'ALL PASSED' : 'SOME FAILED');
  exitCode = allOk ? 0 : 1;
} catch (e) {
  console.error('run-all failed:', e);
} finally {
  await stopDb();
  if (exitCode === 0) { try { fs.rmSync(LOGS, { recursive: true, force: true }); } catch (_) { /* gone */ } }   // keep the logs when something failed
}
process.exit(exitCode);
