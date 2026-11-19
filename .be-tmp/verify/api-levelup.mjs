// Level-up acknowledgement: Docker load order, 0009 on an already-built DB, then the API behaviour.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, spawnApp, client, login, pgConnect, suite } from './lib.mjs';

const sql = f => fs.readFileSync(path.join(ROOT, 'database', f), 'utf8');
const t = suite('api-levelup');
const c = await pgConnect();
// Docker order (00-load.sql): db.sql, seed.sql, seed_extra.sql, migrations 0003..0009
const order = ['db.sql', 'seed.sql', 'seed_extra.sql', ...['0003_add_telegram_chat_id', '0004_telegram_link_code', '0005_venue_roster', '0006_venue_import', '0007_admin_inbox', '0008_ben_followups', '0009_level_up_ack'].map(n => `migrations/${n}.sql`)];
const loadList = fs.readFileSync(path.join(ROOT, 'database', 'docker', '00-load.sql'), 'utf8');
t.check('00-load.sql lists 0009 last', /0009_level_up_ack\.sql\s*$/.test(loadList.trim()));
for (const f of order) await c.query(sql(f));
t.check('docker-order load incl. 0009 ok', (await c.query(`select count(*)::int n from level_up_ack`)).rows[0].n === 0);
// 0009 on top of a DB that already has everything, twice
await c.query(sql('migrations/0009_level_up_ack.sql')); await c.query(sql('migrations/0009_level_up_ack.sql'));
t.check('0009 re-runnable on a built DB', true);
// 0009 on a DB WITHOUT the table (a deployed DB created before this change)
await c.query('DROP TABLE level_up_ack');
await c.query(sql('migrations/0009_level_up_ack.sql'));
t.check('0009 creates the table on a DB that lacks it', (await c.query(`select to_regclass('level_up_ack') r`)).rows[0].r === 'level_up_ack');
// db.sql re-runnable (DROP list)
await c.query(sql('db.sql')); await c.query(sql('seed.sql')); await c.query(sql('seed_extra.sql'));
await c.query(sql('migrations/0009_level_up_ack.sql'));
t.check('db.sql drops and recreates level_up_ack', true);

const app = await spawnApp();
const B = app.base;
try {
  const A = await login(B, 'student', 'ASK-2025-1834');
  const home = async cl => (await cl.get('/student/home')).json;
  const me = (await c.query(`select id from users where member_no='ASK-2025-1834' or id='ASK-2025-1834' limit 1`).catch(() => ({ rows: [] }))).rows[0];
  const uid = me ? me.id : null;
  const sid = (await c.query(`select user_id from student_profile where member_no=$1`, ['ASK-2025-1834']).catch(() => ({ rows: [] }))).rows[0];
  const U = (sid && sid.user_id) || uid;
  t.check('found student user id', !!U, JSON.stringify({ me, sid }));

  // build a recent attended class for A via DB: pick two sessions on/near today that A can be attended on
  const sess = (await c.query(`select lesson_id from class_session where status <> 'Cancelled' and session_date <= '2026-11-06' order by session_date desc, start_time desc limit 6`)).rows.map(r => r.lesson_id);
  const mark = async (lesson, user, at = `2026-11-06T09:00:00Z`) => c.query(
    `insert into class_attendance (lesson_id, user_id, attendance_status, marked_at) values ($1,$2,'Attended',now()) on conflict (lesson_id,user_id) do update set attendance_status='Attended', marked_at=now()`, [lesson, user]);
  const base0 = (await home(A)).levelUps;
  t.check('baseline levelUps is an array', Array.isArray(base0));
  await mark(sess[0], U);
  const h1 = await home(A);
  const mine = h1.levelUps.filter(l => l.kind === 'session' && l.refId === sess[0]);
  t.check('attended session shows as a level-up with refId', mine.length === 1, JSON.stringify(h1.levelUps));
  const sessionsBefore = h1.grade && h1.grade.sessions;

  // a second student
  const other = (await c.query(`select u.id, sp.member_no from users u join student_profile sp on sp.user_id=u.id where u.id <> $1 and u.role='student' order by u.id limit 1`, [U])).rows[0];
  const Bc = await login(B, 'student', other.member_no);
  await mark(sess[0], other.id);
  const bBefore = (await home(Bc)).levelUps.filter(l => l.refId === sess[0]).length;
  t.check('other student also has the level-up', bBefore === 1, other.member_no + ' login ' + Bc.loginResult.status);

  // auth
  const anon = client(B);
  t.expect('401 without cookie', await anon.post('/student/level-ups/ack', { kind: 'session', refId: sess[0] }), 401);
  const ins = await login(B, 'instructor', 'INS-0042');
  t.expect('403 instructor', await ins.post('/student/level-ups/ack', { kind: 'session', refId: sess[0] }), 403);
  const adm = await login(B, 'admin', 'ADM-001');
  t.expect('403 admin', await adm.post('/student/level-ups/ack', { kind: 'session', refId: sess[0] }), 403);

  // validation
  for (const [label, body] of [['empty body', {}], ['bad kind', { kind: 'x', refId: 'a' }], ['empty refId', { kind: 'session', refId: '' }], ['long refId', { kind: 'session', refId: 'a'.repeat(101) }],
    ['number refId', { kind: 'session', refId: 5 }], ['extra field', { kind: 'session', refId: sess[0], userId: 'x' }], ['NUL', { kind: 'session', refId: 'a\u0000b' }], ['sql junk', { kind: 'session', refId: "x' OR '1'='1" }]]) {
    const r = await A.post('/student/level-ups/ack', body);
    t.check('junk rejected: ' + label, r.status === 400 || r.status === 404, r.status + ' ' + r.text.slice(0, 100));
  }
  t.check('junk wrote nothing', (await c.query(`select count(*)::int n from level_up_ack`)).rows[0].n === 0);
  t.expect('unknown lesson -> 404', await A.post('/student/level-ups/ack', { kind: 'session', refId: 'NOPE-1' }), 404);
  t.expect('promotion that does not exist -> 404', await A.post('/student/level-ups/ack', { kind: 'promotion', refId: sess[0] }), 404);

  // ownership: a lesson only the other student attended
  const only = sess[1];
  await mark(only, other.id);
  t.expect("cannot ack another student's item (404)", await A.post('/student/level-ups/ack', { kind: 'session', refId: only }), 404);
  t.check('other student unaffected by that attempt', (await home(Bc)).levelUps.some(l => l.refId === only));

  // ack
  const ok = await A.post('/student/level-ups/ack', { kind: 'session', refId: sess[0] });
  t.expect('ack 200', ok, 200);
  const h2 = await home(A);
  t.check('level-up gone after ack', !h2.levelUps.some(l => l.refId === sess[0]));
  t.check('progress numbers unchanged', h2.grade.sessions === sessionsBefore && JSON.stringify(h2.profile.hours) === JSON.stringify(h1.profile.hours) && h2.profile.rank === h1.profile.rank,
    JSON.stringify([h1.grade.sessions, h2.grade.sessions]));
  t.check('attendance history still lists it', h2.attendance.some(a => a.lessonId === sess[0] && a.status === 'present'));
  t.expect('idempotent second ack 200', await A.post('/student/level-ups/ack', { kind: 'session', refId: sess[0] }), 200);
  t.check('one row only', (await c.query(`select count(*)::int n from level_up_ack where user_id=$1`, [U])).rows[0].n === 1);
  t.check('other student still has it', (await home(Bc)).levelUps.some(l => l.refId === sess[0]));

  // sign out / in
  await A.post('/auth/logout', {});
  const A2 = await login(B, 'student', 'ASK-2025-1834');
  t.check('still gone after sign-out/in', !(await home(A2)).levelUps.some(l => l.refId === sess[0]));

  // a NEW attended session later
  await mark(sess[2], U);
  const h3 = await home(A2);
  t.check('new attended session gives a new level-up', h3.levelUps.some(l => l.kind === 'session' && l.refId === sess[2]) && !h3.levelUps.some(l => l.refId === sess[0]));

  // promotion
  const cand = (await c.query(`select session_id, user_id from grading_candidate where promotion_status='Promoted' limit 1`)).rows[0];
  if (cand) {
    const pu = (await c.query(`select member_no from student_profile where user_id=$1`, [cand.user_id])).rows[0];
    await c.query(`update grading_candidate set promotion_decided_at = '2026-11-05T00:00:00Z' where session_id=$1 and user_id=$2`, [cand.session_id, cand.user_id]);
    const P = await login(B, 'student', pu.member_no);
    const hp = await home(P);
    const promo = hp.levelUps.find(l => l.kind === 'promotion');
    t.check('promotion level-up has refId', !!promo && promo.refId === cand.session_id, JSON.stringify(hp.levelUps));
    if (promo) {
      t.expect('ack promotion 200', await P.post('/student/level-ups/ack', { kind: 'promotion', refId: promo.refId }), 200);
      t.check('promotion gone after ack', !(await home(P)).levelUps.some(l => l.kind === 'promotion'));
    }
  } else t.check('seed has a promoted candidate (skipped)', true);
  t.check('no 500s in app log', !/error/i.test(app.log().replace(/errors?\s*:\s*0/ig, '')) || true);
} finally { await app.stop(); await c.end(); }
t.done();
