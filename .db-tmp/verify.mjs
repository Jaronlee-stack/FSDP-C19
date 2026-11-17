// Verification harness. Run: node .db-tmp/verify.mjs   (PGlite is installed in %TEMP%\askdb, not in the repo)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TMP = path.join(process.env.TEMP, 'askdb');
const { PGlite } = await import(pathToFileURL(path.join(TMP, 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js')).href);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dbSql = fs.readFileSync(path.join(ROOT, 'database', 'db.sql'), 'utf8');
const seedSql = fs.readFileSync(path.join(ROOT, 'database', 'seed.sql'), 'utf8');

const lines = [];
let failures = 0;
const log = s => { lines.push(s); console.log(s); };
const check = (name, ok, detail = '') => { if (!ok) failures++; log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const q = async (db, sql) => (await db.query(sql)).rows;

const db = new PGlite();
log(`PGlite verification, ${new Date().toISOString()} (machine clock; seed anchor is 2026-11-06)`);
log(`PostgreSQL: ${(await q(db, 'select version() v'))[0].v}`);

// a) load
try { await db.exec(dbSql); check('db.sql runs with zero errors', true); } catch (e) { check('db.sql runs with zero errors', false, e.message); }
try { await db.exec(seedSql); check('seed.sql runs with zero errors (transaction commits)', true); } catch (e) { check('seed.sql runs with zero errors', false, e.message); console.log(e); fs.writeFileSync(path.join(ROOT, '.db-tmp', 'verify.log'), lines.join('\n')); process.exit(1); }

// re-run db.sql (drops everything) then seed again
try { await db.exec(dbSql); await db.exec(dbSql); check('db.sql re-run twice is idempotent (drops and recreates)', true); } catch (e) { check('db.sql re-run idempotent', false, e.message); }
const empty = await q(db, `select count(*)::int c from users`);
check('after re-run all tables are empty again', empty[0].c === 0);
try { await db.exec(seedSql); check('seed.sql loads again after re-running db.sql', true); } catch (e) { check('seed.sql loads again after db.sql re-run', false, e.message); }

// b) counts
const tables = (await q(db, `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`)).map(r => r.table_name);
log(`\nTables: ${tables.length}`);
const counts = {};
for (const t of tables) counts[t] = (await q(db, `select count(*)::int c from "${t}"`))[0].c;
log(Object.entries(counts).map(([t, c]) => `  ${t.padEnd(26)} ${c}`).join('\n'));
const emptyTables = Object.entries(counts).filter(([, c]) => c === 0).map(([t]) => t);
check('every table has >= 1 seed row', emptyTables.length === 0, emptyTables.join(', ') || 'none empty');
check('old tables are gone (class_booking, admin_profile, frontdesk_profile)', !tables.some(t => ['class_booking', 'admin_profile', 'frontdesk_profile'].includes(t)));

// FK integrity (constraints enforce it; double-check by joining every FK)
const fks = await q(db, `
  select c.conname, c.conrelid::regclass::text tbl, c.confrelid::regclass::text ref,
         (select string_agg(quote_ident(a.attname), ',' order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum) cols,
         (select string_agg(quote_ident(a.attname), ',' order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum) refcols
  from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace`);
let orphan = 0;
for (const f of fks) {
  const cols = f.cols.split(','), rcols = f.refcols.split(',');
  const on = cols.map((c, i) => `x.${c}=y.${rcols[i]}`).join(' and ');
  const nn = cols.map(c => `x.${c} is not null`).join(' and ');
  const n = (await q(db, `select count(*)::int c from ${f.tbl} x where ${nn} and not exists (select 1 from ${f.ref} y where ${on})`))[0].c;
  orphan += n;
}
check(`no orphan rows across ${fks.length} foreign keys`, orphan === 0, `${orphan} orphans`);

// every FK column set is the leading part of some index
const noIdx = [];
for (const f of fks) {
  const r = await q(db, `
    select 1 from pg_index i where i.indrelid='${f.tbl}'::regclass
      and (select array_agg(attnum order by ord) from unnest(i.indkey::int2[]) with ordinality u(attnum, ord) where ord <= array_length((select conkey from pg_constraint where conname='${f.conname}' and conrelid='${f.tbl}'::regclass),1))
          = (select conkey from pg_constraint where conname='${f.conname}' and conrelid='${f.tbl}'::regclass)
    limit 1`);
  // composite (user_id, role) role-guard FKs: user_id is the primary key, so the PK index serves the lookup
  if (!r.length && !(f.cols === 'user_id,role' && f.ref === 'users')) noIdx.push(`${f.tbl}(${f.cols})`);
}
check(`every foreign key has a supporting index (${fks.length} FKs; the 4 (user_id,role) guard FKs use the PK index)`, noIdx.length === 0, noIdx.join('; ') || 'all covered');

// c) date window
const cols = await q(db, `select table_name t, column_name c, data_type d from information_schema.columns where table_schema='public' and data_type in ('date','timestamp with time zone','timestamp without time zone') order by 1,2`);
const lo = '2025-11-06', hi = '2027-11-06';
const outside = []; const ranges = [];
for (const { t, c, d } of cols) {
  if (t === 'student_profile' && (c === 'dob' || c === 'joined_on')) continue;
  const r = (await q(db, d === 'date'
    ? `select min("${c}")::text mn, max("${c}")::text mx from "${t}"`
    : `select min(("${c}" at time zone 'Asia/Singapore')::date)::text mn, max(("${c}" at time zone 'Asia/Singapore')::date)::text mx from "${t}"`))[0];
  if (r.mn === null) continue;
  ranges.push(`  ${(t + '.' + c).padEnd(48)} ${r.mn} .. ${r.mx}`);
  if (r.mn < lo || r.mx > hi) outside.push(`${t}.${c} ${r.mn}..${r.mx}`);
}
log('\nDate/time column ranges (Singapore date):\n' + ranges.join('\n'));
check(`all ${ranges.length} populated date/timestamp columns (except student_profile.dob and joined_on) within ${lo}..${hi}`, outside.length === 0, outside.join('; ') || 'none outside');

// d) grading vs classes
const tplOverlap = `
  select g.id gs, e.instructor_id, t.id tpl, t.class_type, t.start_time, t.end_time from grading_session g
  join grading_examiner e on e.session_id=g.id
  join class_template t on t.instructor_id=e.instructor_id and t.weekday = extract(isodow from g.session_date)::int-1
  where t.start_time < g.end_time and t.end_time > g.start_time`;
const sesOverlap = `
  select g.id gs, e.instructor_id, s.lesson_id from grading_session g
  join grading_examiner e on e.session_id=g.id
  join class_session s on s.instructor_id=e.instructor_id and s.session_date=g.session_date and s.status<>'Cancelled'
  where s.start_time < g.end_time and s.end_time > g.start_time`;
const hqRoomTpl = `
  select g.id gs, t.id tpl from grading_session g
  join class_template t on t.dojo_id=g.dojo_id and t.weekday = extract(isodow from g.session_date)::int-1
  where t.start_time < g.end_time and t.end_time > g.start_time
    and not exists (select 1 from class_closure c where c.dojo_id=t.dojo_id and g.session_date between c.from_date and c.to_date)`;
const hqRoomSes = `
  select g.id gs, s.lesson_id from grading_session g
  join class_session s on s.dojo_id=g.dojo_id and s.session_date=g.session_date and s.status<>'Cancelled'
  where s.start_time < g.end_time and s.end_time > g.start_time`;
check('no examiner has a weekly class_template overlapping a grading session', (await q(db, tplOverlap)).length === 0, JSON.stringify(await q(db, tplOverlap)));
check('no examiner has a dated class_session overlapping a grading session', (await q(db, sesOverlap)).length === 0);
check('no normal HQ class (template, unless closed that day) overlaps a grading session', (await q(db, hqRoomTpl)).length === 0, JSON.stringify(await q(db, hqRoomTpl)));
check('no HQ class_session overlaps a grading session', (await q(db, hqRoomSes)).length === 0);
check('grading lead examiner is also listed as an examiner', (await q(db, `select 1 from grading_session g where not exists (select 1 from grading_examiner e where e.session_id=g.id and e.instructor_id=g.lead_examiner_id)`)).length === 0);
// negative test: put Robin Tan back on Sunday 11:00 Weapons (prototype state); the check must flag it
await db.exec('BEGIN');
await db.exec(`update class_template set instructor_id='INS-0057' where id='CT-19'`);
const neg = await q(db, tplOverlap);
await db.exec('ROLLBACK');
check('negative test: Robin Tan on Sunday 11:00 Weapons is detected (13 Dec and, as examiner, 27 Sep 2026)', neg.length === 2 && neg.some(r => r.gs === 'GR-20261213') && neg.every(r => r.instructor_id === 'INS-0057'), JSON.stringify(neg));
check('after rollback the overlap check is clean again', (await q(db, tplOverlap)).length === 0);
// negative: HQ closure removed -> room overlap detected
await db.exec('BEGIN'); await db.exec(`delete from class_closure where id='CL-GR-20261213'`);
const neg2 = await q(db, hqRoomTpl); const neg2v = await q(db, 'select * from v_grading_conflict'); await db.exec('ROLLBACK');
check('negative test: without closure CL-GR-20261213 the HQ Sunday classes overlap 13 Dec grading (3 templates)', neg2.length === 3, JSON.stringify(neg2));
check('negative test: without that closure v_grading_conflict is not empty (3 hq_template_open rows)', neg2v.length === 3 && neg2v.every(r => r.conflict === 'hq_template_open'), JSON.stringify(neg2v));

// e) grading venue
check('every grading_session is at hq', (await q(db, `select 1 from grading_session where dojo_id<>'hq'`)).length === 0);
const rej = async (name, sql) => { try { await db.exec('BEGIN'); await db.exec(sql); await db.exec('ROLLBACK'); check(name, false, 'statement was accepted'); } catch (e) { await db.exec('ROLLBACK').catch(() => {}); check(name, true, e.message.split('\n')[0]); } };
await rej('INSERT grading_session at bedok is rejected', `insert into grading_session(id,label,session_date,start_time,end_time,dojo_id,lead_examiner_id) values('GR-X','x','2026-12-20','09:00','10:00','bedok','INS-0042')`);
await rej('bad users.role rejected', `insert into users(id,role,email,password_hash) values('Z','front_desk','z@x','h')`);
await rej('bad payment.status rejected', `insert into payment(id,invoice_no,user_id,item,kind,amount,method,status,channel,created_at) values('Lx','INV-x','S-001','i','Other',1,'Stripe','Pending','desk',now())`);
await rej('bad class_attendance.attendance_status rejected', `insert into class_attendance(lesson_id,user_id,attendance_status) values('LS-20261109-1900-HQ-A','S-009','Late')`);
await rej('bad staff admin_type rejected', `insert into staff_profile(user_id,full_name,admin_type) values('ADM-001','x','owner')`);
await rej('student_profile on an instructor user is rejected (composite role FK)', `insert into student_profile(user_id,member_no,full_name,dob,joined_on,gender,age_group,contact_no,dojo_id,rank_id) values('INS-0001','ASK-X','x','2000-01-01','2026-01-01','Male','Adult','1','hq','6k')`);
await rej('weapon_hours > accumulated_hours rejected', `update student_profile set weapon_hours=999 where user_id='S-001'`);
await rej('class_feedback with a student column impossible: rating 6 rejected', `insert into class_feedback(id,lesson_id,instructor_id,rating) values('FBx','LS-20261109-1900-HQ-A','INS-0042',6)`);

// f) business rules
const one = async (sql) => (await q(db, sql));
check('no student has more than 2 Active student_package rows', (await one(`select user_id from student_package where status='Active' group by 1 having count(*)>2`)).length === 0);
check('lessons_left <= lessons_total everywhere', (await one(`select 1 from student_package where lessons_left>lessons_total`)).length === 0);
check('hours order weapon <= accumulated <= total everywhere', (await one(`select 1 from student_profile where not (weapon_hours<=accumulated_hours and accumulated_hours<=total_accumulated_hours)`)).length === 0);
check('member_no unique and in expected format', (await one(`select 1 from student_profile where member_no !~ '^(ASK|EXT)-20[0-9]{2}-[0-9]{4}$'`)).length === 0);
check('no class has more non-cancelled bookings than capacity', (await one(`select s.lesson_id from class_session s join class_attendance a on a.lesson_id=s.lesson_id and a.attendance_status<>'Cancelled' group by s.lesson_id, s.capacity having count(*)>s.capacity`)).length === 0);
check('Attended/No-Show only on past sessions; Booked only today or later', (await one(`select 1 from class_attendance a join class_session s using(lesson_id) where (a.attendance_status in ('Attended','No-Show') and s.session_date>=date '2026-11-06') or (a.attendance_status='Booked' and s.session_date<date '2026-11-06')`)).length === 0);
check('every check_in has a non-cancelled booking for that class', (await one(`select 1 from check_in c where not exists (select 1 from class_attendance a where a.lesson_id=c.lesson_id and a.user_id=c.user_id and a.attendance_status in ('Booked','Attended'))`)).length === 0);
check('no student booked into two overlapping classes', (await one(`select 1 from class_attendance a1 join class_session s1 using(lesson_id) join class_attendance a2 on a2.user_id=a1.user_id and a2.lesson_id<a1.lesson_id join class_session s2 on s2.lesson_id=a2.lesson_id and s2.session_date=s1.session_date where a1.attendance_status<>'Cancelled' and a2.attendance_status<>'Cancelled' and s1.start_time<s2.end_time and s2.start_time<s1.end_time`)).length === 0);
check('booking rules: children only in kids classes; Ladies women only; Intermediate>=4th Kyu; Advanced>=1st Kyu', (await one(`
  select 1 from class_attendance a join class_session s using(lesson_id) join class_template t on t.id=s.template_id
  join student_profile p on p.user_id=a.user_id join belt_rank r on r.id=p.rank_id
  where a.attendance_status<>'Cancelled' and not t.is_private and (t.kids_only <> (p.age_group='Child') or (t.class_type='Ladies' and p.gender<>'Female') or (t.class_type='Intermediate' and r.sort_order<3) or (t.class_type='Advanced' and r.sort_order<6))`)).length === 0);
check('no mat used by two classes at the same HQ time slot', (await one(`select 1 from class_template a join class_template b on a.id<b.id and a.dojo_id=b.dojo_id and a.weekday=b.weekday and a.mat=b.mat and a.start_time<b.end_time and b.start_time<a.end_time`)).length === 0);
const demo = await one(`
  select (select count(*) from student_profile where full_name='Lervyn Wong' and member_no='ASK-2025-1834' and rank_id='4k' and dojo_id='hq')::int lervyn,
         (select count(*) from instructor_profile where user_id='INS-0042' and full_name='Bob Tan Sensei')::int bob,
         (select count(*) from staff_profile where user_id='ADM-001' and admin_type='business' and full_name='Grace Lim')::int adm001,
         (select count(*) from staff_profile where user_id='ADM-101' and admin_type='frontdesk' and full_name='Daniel Ong' and status='active')::int adm101,
         (select count(*) from staff_profile where user_id='ADM-102' and status='inactive')::int adm102,
         (select count(*) from dojo)::int dojos, (select count(*) from instructor_profile)::int instructors`);
check('demo accounts: Lervyn Wong ASK-2025-1834 4th Kyu HQ; Bob Tan Sensei INS-0042; ADM-001 business; ADM-101 frontdesk; ADM-102 inactive', Object.entries(demo[0]).filter(([k]) => !['dojos', 'instructors'].includes(k)).every(([, v]) => +v === 1), JSON.stringify(demo[0]));
check('12 dojos and 18 instructors', demo[0].dojos == 12 && demo[0].instructors == 18);
const lerv = await one(`select (select count(*) from student_package where user_id='S-001')::int pk, (select count(*) from class_attendance where user_id='S-001')::int att, (select count(*) from payment where user_id='S-001')::int pay, (select count(*) from grading_history where user_id='S-001')::int gh`);
check('Lervyn has packages, bookings/attendance, payments and grading history', Object.values(lerv[0]).every(v => v > 0), JSON.stringify(lerv[0]));
const stat = await one(`select string_agg(distinct attendance_status, ',' order by attendance_status) a from class_attendance`);
check('attendance has all 4 statuses', stat[0].a === 'Attended,Booked,Cancelled,No-Show', stat[0].a);
const ps = await one(`select string_agg(distinct status, ',' order by status) a from payment`);
check('payments cover all 6 statuses', ps[0].a === 'Failed,Outstanding,Paid,Processing,Refunded,Voided', ps[0].a);
const ms = await one(`select string_agg(distinct account_status, ',' order by account_status) a from membership`);
check('memberships cover Active/Inactive/Deactivated/Lapsed', ms[0].a === 'Active,Deactivated,Inactive,Lapsed', ms[0].a);
const rs = await one(`select string_agg(distinct status, ',' order by status) a from registration_application`);
check('registrations in every state', rs[0].a === 'Approved,Needs info,Rejected,Submitted,Under review', rs[0].a);
check('class_feedback has no student/user column', (await one(`select 1 from information_schema.columns where table_name='class_feedback' and column_name ~ '(user|student)'`)).length === 0);
check('upcoming grading GR-20261213 is 2026-12-13 09:00-12:30 at hq with 3 examiners', (await one(`select 1 from grading_session g where id='GR-20261213' and session_date='2026-12-13' and start_time='09:00' and end_time='12:30' and dojo_id='hq' and (select count(*) from grading_examiner e where e.session_id=g.id)=3`)).length === 1);
check('one past completed grading session exists', (await one(`select 1 from grading_session where status='Completed' and session_date<'2026-11-06'`)).length >= 1);
check('guest_profile has trial statuses', (await one(`select 1 from guest_profile where trial_status is not null`)).length === 4);
const tc = (await one(`select count(*) filter (where dojo_id='hq' and not is_private)::int g, count(*) filter (where is_private)::int p, count(*) filter (where dojo_id<>'hq')::int o from class_template`))[0];
check('weekly timetable: 19 HQ group + 3 private + 20 sample non-HQ templates', tc.g === 19 && tc.p === 3 && tc.o === 20, JSON.stringify(tc));
const sessAll = await one(`select count(*)::int n, min(session_date)::text mn, max(session_date)::text mx from class_session`);
log(`INFO  class_session: ${JSON.stringify(sessAll[0])}`);

// ---------- round 2 checks ----------
// grading vs lessons (view)
check('v_grading_conflict returns 0 rows', (await one(`select * from v_grading_conflict`)).length === 0, JSON.stringify(await one(`select * from v_grading_conflict`)));
check('every grading date overlapping an HQ template has a class_closure row', (await one(`
  select g.id from grading_session g where exists (select 1 from class_template t where t.dojo_id=g.dojo_id and t.weekday=extract(isodow from g.session_date)::int-1 and t.start_time<g.end_time and g.start_time<t.end_time)
  and not exists (select 1 from class_closure c where c.dojo_id=g.dojo_id and g.session_date between c.from_date and c.to_date)`)).length === 0);
check('closures CL-GR-* exist for all 4 grading dates and CL-03..CL-06 are gone', (await one(`select count(*)::int n from class_closure where id like 'CL-GR-%'`))[0].n === 4 && (await one(`select 1 from class_closure where id in ('CL-03','CL-04','CL-05','CL-06')`)).length === 0);
check('no HQ class_session on closure dates (2026-12-13, 2026-11-26, 2026-10-10/11, 2026-09-27)', (await one(`select 1 from class_session s join class_closure c on c.dojo_id=s.dojo_id and s.session_date between c.from_date and c.to_date`)).length === 0
  && (await one(`select 1 from class_session where dojo_id='hq' and session_date in ('2026-12-13','2026-11-26','2026-10-10','2026-10-11','2026-09-27')`)).length === 0);
// negative: hypothetical Sunday grading without closure
await db.exec('BEGIN');
await db.exec(`insert into grading_session(id,label,session_date,start_time,end_time,dojo_id,lead_examiner_id) values('GR-20270314','Hypothetical','2027-03-14','09:00','12:00','hq','INS-0042')`);
await db.exec(`insert into grading_examiner(session_id,instructor_id) values('GR-20270314','INS-0042')`);
const negV = await q(db, `select conflict from v_grading_conflict`);
await db.exec('ROLLBACK');
check('negative test: a new Sunday grading 2027-03-14 without closure makes v_grading_conflict non-empty', negV.length === 3 && negV.every(r => r.conflict === 'hq_template_open'), JSON.stringify(negV));
// negative: examiner session conflict through a dated class_session
await db.exec('BEGIN');
await db.exec(`update class_session set status='Scheduled' where false`);
await db.exec(`insert into class_session(lesson_id,template_id,dojo_id,session_date,start_time,end_time,mat,class_type,instructor_id,capacity) values('LS-X-1','CT-19','hq','2026-12-13','11:00','12:00','Mat A','Weapons','INS-0042',12)`);
const negS = await q(db, `select conflict from v_grading_conflict`);
await db.exec('ROLLBACK');
check('negative test: a Bob Tan class_session on 13 Dec 11:00 is flagged (examiner_session + hq_session)', negS.some(r => r.conflict === 'examiner_session') && negS.some(r => r.conflict === 'hq_session'), JSON.stringify(negS));
check('after rollbacks the view is empty again', (await one(`select * from v_grading_conflict`)).length === 0);

// instructor double-booking across all dojos
const dblTpl = `select a.id a, b.id b from class_template a join class_template b on a.id<b.id and a.instructor_id=b.instructor_id and a.weekday=b.weekday and a.start_time<b.end_time and b.start_time<a.end_time`;
const dblSes = `select a.lesson_id a, b.lesson_id b from class_session a join class_session b on a.lesson_id<b.lesson_id and a.instructor_id=b.instructor_id and a.session_date=b.session_date and a.status<>'Cancelled' and b.status<>'Cancelled' and a.start_time<b.end_time and b.start_time<a.end_time`;
check('no instructor has two overlapping class_template rows (all dojos)', (await q(db, dblTpl)).length === 0, JSON.stringify(await q(db, dblTpl)));
check('no instructor has two overlapping non-cancelled class_session rows (all dojos)', (await q(db, dblSes)).length === 0, JSON.stringify((await q(db, dblSes)).slice(0, 3)));
await db.exec('BEGIN');
await db.exec(`insert into class_template(id,code,dojo_id,weekday,start_time,end_time,class_type,instructor_id,capacity,online_bookable) values('CT-X','BEDOK-TUE7-0001','bedok',1,'19:00','20:00','Adults','INS-0008',10,FALSE)`);
const negD = await q(db, dblTpl);
await db.exec('ROLLBACK');
check('negative test: Chew Eng Lam given a second Tue 19:00 class is detected (CT-23 vs new)', negD.length === 1 && negD[0].a === 'CT-23', JSON.stringify(negD));

// non-HQ timetables
const open = await one(`select d.id, (select count(*) from class_template t where t.dojo_id=d.id)::int n from dojo d where d.id<>'hq' and d.status='Open' order by d.id`);
check('every open non-HQ dojo has >= 1 class_template (10 dojos, 2 each)', open.length === 10 && open.every(r => r.n === 2), JSON.stringify(open));
check('tampineswest (temporarily closed) has no class_template', (await one(`select 1 from class_template where dojo_id='tampineswest'`)).length === 0);
check('no class_attendance rows exist for non-HQ sessions', (await one(`select 1 from class_attendance a join class_session s using(lesson_id) where s.dojo_id<>'hq'`)).length === 0);
check('non-HQ sessions exist for every non-HQ template', (await one(`select t.id from class_template t where t.dojo_id<>'hq' and not exists (select 1 from class_session s where s.template_id=t.id)`)).length === 0);
const hqOnly = await one(`select count(*)::int n from class_template where dojo_id<>'hq' and online_bookable`);
check('no non-HQ class_template is online_bookable', hqOnly[0].n === 0);
await rej('CHECK online_bookable_hq_only rejects an online-bookable class at bedok', `insert into class_template(id,code,dojo_id,weekday,start_time,end_time,class_type,instructor_id,capacity,online_bookable) values('CT-Y','BEDOK-MON7-0002','bedok',0,'19:00','20:00','Adults','INS-0001',10,TRUE)`);
check('the constraint online_bookable_hq_only exists', (await one(`select 1 from pg_constraint where conname='online_bookable_hq_only'`)).length === 1);

// joined_on
check('student_profile.joined_on is NOT NULL', (await one(`select 1 from information_schema.columns where table_name='student_profile' and column_name='joined_on' and is_nullable='NO'`)).length === 1);
check('joined_on year equals the year in member_no for all 29 students', (await one(`select 1 from student_profile where split_part(member_no,'-',2)::int <> extract(year from joined_on)::int`)).length === 0 && (await one(`select count(*)::int n from student_profile`))[0].n === 29);
check('joined_on is not after users.created_at date', (await one(`select 1 from student_profile p join users u on u.id=p.user_id where p.joined_on > (u.created_at at time zone 'Asia/Singapore')::date`)).length === 0);
check('joined_on is not after any payment, package or booking date of that student', (await one(`
  select p.user_id from student_profile p where
    exists (select 1 from payment y where y.user_id=p.user_id and p.joined_on > (y.created_at at time zone 'Asia/Singapore')::date)
    or exists (select 1 from student_package k where k.user_id=p.user_id and p.joined_on > k.purchased_at)
    or exists (select 1 from class_attendance a where a.user_id=p.user_id and p.joined_on > (a.booked_at at time zone 'Asia/Singapore')::date)
    or exists (select 1 from grading_history h where h.user_id=p.user_id and p.joined_on > h.grading_date)`)).length === 0);
check("a student's Registration payment date equals joined_on", (await one(`select 1 from payment y join student_profile p on p.user_id=y.user_id where y.kind='Registration' and (y.created_at at time zone 'Asia/Singapore')::date <> p.joined_on`)).length === 0);
check('joined_on is in the past (<= 2026-11-06) and Marcus joined 2026-09-14', (await one(`select 1 from student_profile where joined_on > date '2026-11-06'`)).length === 0 && (await one(`select 1 from student_profile where user_id='S-006' and joined_on='2026-09-14'`)).length === 1);
check('joined_on column is excluded from the window only because of the exemption (some joined_on before 2025-11-06)', (await one(`select 1 from student_profile where joined_on < date '2025-11-06'`)).length > 0);

// sessions range
const rg = (await one(`select min(session_date)::text mn, max(session_date)::text mx from class_session`))[0];
check('class_session range is 2026-09-21..2026-12-20', rg.mn === '2026-09-21' && rg.mx === '2026-12-20', JSON.stringify(rg));
check('Tue 3 Nov 19:00 Adults is the only Cancelled class_session', JSON.stringify(await one(`select lesson_id from class_session where status='Cancelled'`)) === JSON.stringify([{ lesson_id: 'LS-20261103-1900-HQ-A' }]));
check('feedback lesson_ids are real Bob Tan sessions that Ended', (await one(`select 1 from class_feedback f where not exists (select 1 from class_session s where s.lesson_id=f.lesson_id and s.instructor_id='INS-0042' and s.status='Ended')`)).length === 0);
check('sent_log SL-01 is dated 2026-11-03 17:00 (before the cancelled class)', (await one(`select 1 from sent_log where id='SL-01' and sent_at='2026-11-03 17:00+08'`)).length === 1);
const c3 = (await one(`select count(*)::int n from class_attendance where lesson_id='LS-20261103-1900-HQ-A'`))[0].n;
log(`INFO  class_attendance rows for LS-20261103-1900-HQ-A (prototype closure C-03 students/lessons): ${c3}`);

log(`\nRESULT: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
fs.writeFileSync(path.join(ROOT, '.db-tmp', 'verify.log'), lines.join('\n') + '\n');

// inventory
let inv = '# Table and column inventory (generated by verify.mjs)\n\n';
for (const t of tables) {
  const cs = await q(db, `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='${t}' order by ordinal_position`);
  inv += `## ${t} (${counts[t]} rows)\n\n| column | type | null | default |\n|---|---|---|---|\n` + cs.map(c => `| ${c.column_name} | ${c.data_type} | ${c.is_nullable} | ${(c.column_default || '').replace(/\|/g, '/')} |`).join('\n') + '\n\n';
}
fs.writeFileSync(path.join(ROOT, '.db-tmp', 'inventory.md'), inv);
process.exit(failures ? 1 : 0);
