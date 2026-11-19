// Student Telegram link endpoints: GET/DELETE /student/telegram, ownership, audit, bot name resolution, chat-link audit. Spawns its own app; no network calls.
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnApp, resetDb, appEnv, login, pgConnect, suite, ACCOUNTS, ROOT, freePort } from './lib.mjs';
await resetDb();
const S = suite('api-telegram');
const { check, expect } = S;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const NO_TG = { TELEGRAM_BOT_TOKEN: '', TELEGRAM_BOT_USERNAME: '', TELEGRAM_WEBHOOK_SECRET: '', BREVO_API_KEY: '' };
let app = await spawnApp(NO_TG);
try {
  const L = await login(app.base, ...ACCOUNTS.student);                 // Lervyn, ASK-2025-1834
  const J = await login(app.base, 'student', 'ASK-2024-0921');          // Jamie Tan
  const INS = await login(app.base, ...ACCOUNTS.instructor);
  const ADM = await login(app.base, ...ACCOUNTS.business);
  const FD = await login(app.base, ...ACCOUNTS.frontdesk);
  const anon = (await import('./lib.mjs')).client(app.base);

  const lerv = (await q(`SELECT user_id FROM student_profile WHERE member_no = 'ASK-2025-1834'`))[0].user_id;
  const jam = (await q(`SELECT user_id FROM student_profile WHERE member_no = 'ASK-2024-0921'`))[0].user_id;

  // ---- GET
  const g = await L.get('/student/telegram');
  check('GET: 200, linked=false, memberNo is the caller\'s own, botUsername null with no token', g.status === 200 && g.json.linked === false && g.json.memberNo === 'ASK-2025-1834' && g.json.botUsername === null, g.text);
  check('GET: only linked, botUsername, memberNo keys', JSON.stringify(Object.keys(g.json).sort()) === '["botUsername","linked","memberNo"]', g.text);
  for (const [m, p] of [['GET', '/student/telegram'], ['DELETE', '/student/telegram']]) {
    expect(`${m}: 401 without a cookie`, await anon.api(m, p), 401);
    for (const [n, c] of [['instructor', INS], ['business admin', ADM], ['front desk', FD]]) expect(`${m}: 403 WRONG_ROLE for ${n}`, await c.api(m, p), 403, 'WRONG_ROLE');
  }
  expect('DELETE with a non-JSON content type: 415', await L.api('DELETE', '/student/telegram', undefined, { headers: { 'Content-Type': 'text/plain' }, rawBody: 'x' }), 415);

  // ---- DELETE only touches the caller
  await q(`UPDATE student_profile SET telegram_chat_id = '111222333' WHERE user_id = $1`, [lerv]);
  await q(`UPDATE student_profile SET telegram_chat_id = '444555666' WHERE user_id = $1`, [jam]);
  const g2 = await L.get('/student/telegram');
  check('GET after a chat id is set: linked=true and no chat id in the body', g2.json.linked === true && !/111222333|444555666|chat/i.test(g2.text), g2.text);
  const d = await L.del('/student/telegram');
  check('DELETE: 200, linked=false, no chat id in the body', d.status === 200 && d.json.linked === false && d.json.memberNo === 'ASK-2025-1834' && !/111222333|444555666|chat/i.test(d.text), d.text);
  const rows = await q(`SELECT user_id, telegram_chat_id FROM student_profile WHERE user_id IN ($1, $2)`, [lerv, jam]);
  check('DELETE: caller\'s chat id is NULL, the other student\'s is untouched', rows.find(r => r.user_id === lerv).telegram_chat_id === null && rows.find(r => r.user_id === jam).telegram_chat_id === '444555666', JSON.stringify(rows));
  const a = await q(`SELECT * FROM audit_log WHERE action = 'telegram.unlinked'`);
  check('audit: one telegram.unlinked row for the caller, no chat id inside', a.length === 1 && a[0].actor_user_id === lerv && a[0].actor_role === 'student' && a[0].entity_id === lerv && !JSON.stringify(a[0]).includes('111222333'), JSON.stringify(a));
  const d2 = await L.del('/student/telegram');
  check('DELETE again: 200, still unlinked, no second audit row', d2.status === 200 && d2.json.linked === false && (await q(`SELECT 1 FROM audit_log WHERE action = 'telegram.unlinked'`)).length === 1, d2.text);
  const jg = await J.get('/student/telegram');
  check('the other student still reads linked=true', jg.json.linked === true && jg.json.memberNo === 'ASK-2024-0921', jg.text);
  const sc = await ADM.get('/admin/audit?group=telegram');
  check('audit log filter accepts group=telegram and lists the row', sc.status === 200 && JSON.stringify(sc.json).includes('telegram.unlinked'), sc.text.slice(0, 200));
} finally { await app.stop(); }

// ---- bot username from the environment
app = await spawnApp({ ...NO_TG, TELEGRAM_BOT_USERNAME: '@ASK_Test_Bot' });
try {
  const L = await login(app.base, ...ACCOUNTS.student);
  const g = await L.get('/student/telegram');
  check('TELEGRAM_BOT_USERNAME is used (leading @ dropped), no token needed', g.status === 200 && g.json.botUsername === 'ASK_Test_Bot', g.text);
} finally { await app.stop(); }
app = await spawnApp({ ...NO_TG, TELEGRAM_BOT_USERNAME: 'bad name!' });
try {
  const L = await login(app.base, ...ACCOUNTS.student);
  const g = await L.get('/student/telegram');
  check('an invalid TELEGRAM_BOT_USERNAME is ignored (null)', g.status === 200 && g.json.botUsername === null, g.text);
} finally { await app.stop(); }

// ---- getMe path, axios stubbed in-process (no network)
Object.assign(process.env, appEnv(await freePort(), { ...NO_TG, TELEGRAM_BOT_TOKEN: 'stub-token-not-real' }));
const req = createRequire(path.join(ROOT, 'package.json'));
const axios = req('axios');
let calls = 0, mode = 'ok';
axios.get = async url => { calls++; if (mode === 'fail') throw new Error('stubbed network failure'); return { data: { ok: true, result: { username: 'Stub_Bot' } } }; };
const tg = req('./src/services/telegramBotService.js');
mode = 'fail';
check('getMe failure: null (fail soft)', (await tg.getBotUsername()) === null && calls === 1);
check('getMe failure is not retried straight away', (await tg.getBotUsername()) === null && calls === 1);

// ---- chat-linking writes an audit row (code row inserted directly, hashed the way the service does)
const chat = '777888999', code = '123456';
const hash = crypto.createHash('sha256').update(`${chat}:${code}`).digest('hex');
const lerv2 = (await q(`SELECT user_id FROM student_profile WHERE member_no = 'ASK-2025-1834'`))[0].user_id;
await q(`INSERT INTO telegram_link_code (chat_id, user_id, code_hash, expires_at, attempts, sent_at) VALUES ($1, $2, $3, now() + interval '10 minutes', 0, now())`, [chat, lerv2, hash]);
const v = await tg.verifyLinkCode(chat, code);
const linked = await q(`SELECT telegram_chat_id FROM student_profile WHERE user_id = $1`, [lerv2]);
const la = await q(`SELECT actor_user_id, actor_role, entity_id, details FROM audit_log WHERE action = 'telegram.linked'`);
check('verifyLinkCode: still links the chat', v.success === true && linked[0].telegram_chat_id === chat, JSON.stringify(v));
check('verifyLinkCode: writes one telegram.linked audit row without the chat id', la.length === 1 && la[0].actor_user_id === lerv2 && !JSON.stringify(la[0]).includes(chat), JSON.stringify(la));
const bad = await tg.verifyLinkCode('000', '654321');
check('verifyLinkCode: unknown chat still rejected', bad.success === false);
await pg.end();
S.done();
process.exit(process.exitCode || 0);
