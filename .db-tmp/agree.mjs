// Prototype vs seed agreement check.
// Run: $env:TZ='Asia/Singapore'; node .db-tmp/agree.mjs      (PGlite lives in %TEMP%\askdb, not in the repo)
// Loads data.js + store.js (and the one-line helpers of core.js) in a vm sandbox with a fixed clock (2026-11-06 12:00),
// runs db.sql + seed.sql on PGlite and compares the two. Mismatches must be fixed or listed in ALLOW with a reason.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const TMP = path.join(process.env.TEMP, 'askdb');
const { PGlite } = await import(pathToFileURL(path.join(TMP, 'node_modules', '@electric-sql', 'pglite', 'dist', 'index.js')).href);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const JS = f => fs.readFileSync(path.join(ROOT, 'src', 'public', 'js', f), 'utf8');

const out = [];
const log = s => { out.push(s); console.log(s); };
if (process.env.TZ !== 'Asia/Singapore') { log('WARNING: run with $env:TZ=\'Asia/Singapore\' (the prototype formats dates in local time)'); }

// ---------- 1. load the prototype ----------
const FIXED = new Date(2026, 10, 6, 12, 0, 0).getTime();
class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
  static now() { return FIXED; }
}
const chain = () => new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : chain()), apply: () => chain() });
const noop = () => {};
const sandbox = {
  Date: FakeDate, console, Math, JSON, Object, Array, String, Number, RegExp, Set, Map, Infinity, NaN, isNaN, parseInt, parseFloat, Intl, Symbol, Error,
  document: { addEventListener: noop, body: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [] },
  window: { addEventListener: noop },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
  location: { href: '' }, matchMedia: () => ({ matches: false }), setTimeout: noop, chain
};
const ctx = vm.createContext(sandbox);
const coreLines = JS('core.js').split(/\r?\n/).filter(l => /^const (DAY|MON|fmtDate|fmtShort|dayName|addDays|addMonths|startOfDay|daysBetween|plural|TODAY|isoDate) /.test(l));
vm.runInContext(coreLines.join('\n'), ctx, { filename: 'core-helpers' });
vm.runInContext(JS('data.js'), ctx, { filename: 'data.js' });
vm.runInContext(JS('store.js'), ctx, { filename: 'store.js' });
const P = vm.runInContext('({ DOJOS, INSTRUCTORS, PKG, BELTS, GRADING_FEE, CLASSES, OTHER_DOJO_CLASSES, PRIVATE_CLASSES, DB, TODAY, isoDate, sessionCode, GRADING_FEE, HQ })', ctx);
const DB = P.DB;
const iso = d => P.isoDate(new Date(d));
const MONN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parseD = s => { const m = /^(\d+) (\w{3}) (\d{4})$/.exec(s); return m ? `${m[3]}-${String(MONN.indexOf(m[2]) + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : s; };
log(`Prototype loaded with clock ${iso(P.TODAY)}; members ${DB.members.length}, sessions ${DB.sessions.length}`);

// ---------- 2. load the seed ----------
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(ROOT, 'database', 'db.sql'), 'utf8'));
await db.exec(fs.readFileSync(path.join(ROOT, 'database', 'seed.sql'), 'utf8'));
const q = async sql => (await db.query(sql)).rows;

// ---------- 3. comparison helpers ----------
// ALLOW: prototype-vs-seed differences that are accepted on purpose. key = area + ':' + id. Every entry needs a reason.
const ALLOW = {
  'panels:test session': 'Prototype-only demo panel (today 20:00) so the grading lock can be shown; never real data',
  'classes:private code': 'Private lessons are not in the prototype timetable (no code); the seed gives them HQ-xxx-900n codes',
  'member:EXT-2026-0041.status': 'The prototype member list only knows Active and Lapsed; the seed uses Deactivated here so every membership state (Active/Inactive/Deactivated/Lapsed) has a row',
  'member:EXT-2026-0042.status': 'Same as above: seed uses Inactive to cover the state; the prototype cannot express it'
};
let bad = 0, allowed = 0, compared = 0;
const miss = (area, key, a, b) => { const k = `${area}:${key}`; const why = ALLOW[k]; if (why) { allowed++; log(`  ALLOWED  ${k}  proto=${JSON.stringify(a)} seed=${JSON.stringify(b)}  (${why})`); } else { bad++; log(`  MISMATCH ${area} ${key}: prototype=${JSON.stringify(a)} seed=${JSON.stringify(b)}`); } };
const eq = (area, key, a, b) => { compared++; const na = a === undefined || a === '' ? null : a, nb = b === undefined || b === '' ? null : b; if (String(na) !== String(nb)) miss(area, key, a, b); };
const seedOnly = (area, found, expected, reason) => {
  const extra = found.filter(x => !expected.includes(x));
  const unexpected = extra.filter(x => !(reason.ids || []).includes(x));
  log(`  seed-only ${area}: ${extra.length} rows (${extra.join(', ') || 'none'}) - ${reason.text}`);
  unexpected.forEach(x => { bad++; log(`  MISMATCH ${area} seed-only row ${x} has no reason`); });
};
const nameToUser = {};
for (const r of await q(`select user_id, full_name, member_no from student_profile`)) nameToUser[r.full_name] = r.user_id;
const noToUser = {};
for (const r of await q(`select user_id, member_no from student_profile`)) noToUser[r.member_no] = r.user_id;
const staffName = {};
for (const r of await q(`select user_id, full_name from staff_profile union all select user_id, full_name from instructor_profile`)) staffName[r.user_id] = r.full_name;
const nameToStaff = Object.fromEntries(Object.entries(staffName).map(([k, v]) => [v, k]));
const sgd = col => `(${col} at time zone 'Asia/Singapore')::date::text`;
const section = s => log(`\n== ${s}`);

// ---------- 4. comparisons ----------
section('dojos');
const dj = Object.fromEntries((await q(`select * from dojo`)).map(r => [r.id, r]));
P.DOJOS.forEach(d => { const r = dj[d.id] || {}; ['name', 'short', 'code', 'region'].forEach(k => eq('dojo', `${d.id}.${k}`, d[k], r[k === 'short' ? 'short_name' : k])); eq('dojo', `${d.id}.addr`, d.addr, r.address); eq('dojo', `${d.id}.status`, d.status || 'Open', r.status); });
eq('dojo', 'count', P.DOJOS.length, Object.keys(dj).length);

section('instructors');
const ins = Object.fromEntries((await q(`select * from instructor_profile`)).map(r => [r.full_name, r]));
P.INSTRUCTORS.forEach(([n, dan, photo, chief]) => { const r = ins[n] || {}; eq('instructor', `${n}.dan`, parseInt(dan), r.dan_grade); eq('instructor', `${n}.photo`, photo, r.photo_file); eq('instructor', `${n}.chief`, !!chief, r.is_chief); });
eq('instructor', 'count', P.INSTRUCTORS.length, Object.keys(ins).length);

section('staff accounts');
const stf = Object.fromEntries((await q(`select u.id, s.full_name, s.admin_type, s.status, ${sgd('u.last_login_at')} login from users u join staff_profile s on s.user_id=u.id`)).map(r => [r.id, r]));
const insl = Object.fromEntries((await q(`select u.id, i.full_name, ${sgd('u.last_login_at')} login from users u join instructor_profile i on i.user_id=u.id`)).map(r => [r.id, r]));
DB.staff.forEach(s => {
  if (s.type === 'instructor') { const r = insl[s.id] || {}; eq('staff', `${s.id}.name`, s.name, r.full_name); eq('staff', `${s.id}.last`, iso(s.last), r.login); }
  else { const r = stf[s.id] || {}; eq('staff', `${s.id}.name`, s.name, r.full_name); eq('staff', `${s.id}.type`, s.type, r.admin_type); eq('staff', `${s.id}.status`, s.status, r.status); eq('staff', `${s.id}.last`, iso(s.last), r.login); }
});

section('packages and fees');
const pd = Object.fromEntries((await q(`select * from package_def`)).map(r => [r.id, r]));
[...P.PKG.adult, ...P.PKG.kids].forEach(p => { const r = pd[p.id] || {}; eq('package', `${p.id}.name`, p.name, r.name); eq('package', `${p.id}.price`, p.amt, +r.price); eq('package', `${p.id}.lessons`, p.lessons === Infinity ? null : p.lessons, r.lessons); eq('package', `${p.id}.unit`, p.unit || null, r.billing_unit); eq('package', `${p.id}.days`, p.days || null, r.valid_days); eq('package', `${p.id}.months`, p.months || null, r.valid_months); eq('package', `${p.id}.compassion`, !!p.compassion, r.compassion_eligible); });
const br = (await q(`select * from belt_rank order by sort_order`));
P.BELTS.forEach((b, i) => { const r = br[i] || {}; eq('belt', `${b.g}.name`, b.g, r.name); eq('belt', `${b.g}.color`, b.c.toUpperCase(), (r.belt_color || '').toUpperCase()); eq('belt', `${b.g}.fee`, P.GRADING_FEE[b.g], +r.grading_fee); });
const pol = Object.fromEntries((await q(`select setting_key k, value_text v from policy_setting`)).map(r => [r.k, r.v]));
const pp = DB.policies;
eq('policy', 'registration', pp.registration, +pol.registration_fee); eq('policy', 'annualDues', pp.annualDues, +pol.annual_dues);
eq('policy', 'senior', `${pp.discounts.senior.age}/${pp.discounts.senior.pct}`, `${pol.discount_senior_age}/${pol.discount_senior_pct}`);
eq('policy', 'student', `${pp.discounts.student.from}/${pp.discounts.student.to}/${pp.discounts.student.pct}`, `${pol.discount_student_from_age}/${pol.discount_student_to_age}/${pol.discount_student_pct}`);
eq('policy', 'booking', `${pp.booking.aheadMonths}/${pp.booking.minDays}/${pp.booking.cancelHours}/${pp.booking.maxPackages}`, `${pol.booking_ahead_months}/${pol.booking_min_days}/${pol.cancel_hours}/${pol.max_packages}`);
eq('policy', 'triggers', `${pp.followTriggers.declineDays}/${pp.followTriggers.renewalDays}`, `${pol.follow_decline_days}/${pol.follow_renewal_days}`);
eq('policy', 'compassion', 14, +pol.compassion_days); eq('policy', 'late fee', 20, +pol.grading_late_fee);
const tpl = Object.fromEntries((await q(`select * from notification_template`)).map(r => [r.id, r]));
pp.templates.forEach(t => { eq('template', `${t.id}.name`, t.name, (tpl[t.id] || {}).name); eq('template', `${t.id}.text`, t.text, (tpl[t.id] || {}).body); });
const aar = Object.fromEntries((await q(`select * from auto_activation_rule`)).map(r => [r.id, r]));
pp.autoActivation.forEach(a => { eq('auto rule', `${a.id}.text`, a.text, (aar[a.id] || {}).label); eq('auto rule', `${a.id}.on`, a.on, (aar[a.id] || {}).enabled); });

section('weekly timetable (class_template)');
const ct = await q(`select t.*, to_char(start_time,'HH24:MI') st, to_char(end_time,'HH24:MI') et, i.full_name ins, p.full_name pstud from class_template t join instructor_profile i on i.user_id=t.instructor_id left join student_profile p on p.user_id=t.private_student_id order by t.id`);
const SES = DB.sessions;   // CLASSES (19) then OTHER_DOJO_CLASSES (20), with codes
const cmpClass = (c, id, code) => {
  const r = ct.find(x => x.id === id) || {};
  eq('class', `${id}.dojo`, c.dojo, r.dojo_id); eq('class', `${id}.day`, c.day, r.weekday); eq('class', `${id}.time`, c.time, r.st); eq('class', `${id}.type`, c.type, r.class_type);
  eq('class', `${id}.ins`, c.ins, r.ins); eq('class', `${id}.cap`, c.cap, r.capacity); eq('class', `${id}.kids`, !!c.kids, r.kids_only);
  eq('class', `${id}.online`, c.dojo === 'hq' && !c.private, r.online_bookable);
  if (code) eq('class', `${id}.code`, code, r.code);
};
P.CLASSES.forEach((c, i) => cmpClass(c, 'CT-' + String(i + 1).padStart(2, '0'), SES[i].code));
P.PRIVATE_CLASSES.forEach((c, i) => { const id = 'CT-' + (20 + i); cmpClass(c, id, null); eq('class', `${id}.private student`, c.student, (ct.find(x => x.id === id) || {}).pstud); });
P.OTHER_DOJO_CLASSES.forEach((c, i) => cmpClass(c, 'CT-' + (23 + i), SES[19 + i].code));
eq('class', 'template count', P.CLASSES.length + P.PRIVATE_CLASSES.length + P.OTHER_DOJO_CLASSES.length, ct.length);
eq('class', 'sessions in prototype = non-private templates', SES.length, ct.filter(t => !t.is_private).length);
if (ALLOW['classes:private code']) { allowed++; log(`  ALLOWED  classes:private code (${ALLOW['classes:private code']})`); }

section('members');
const sp = Object.fromEntries((await q(`select p.*, to_char(p.joined_on,'YYYY-MM-DD') jo, to_char(p.dob,'YYYY-MM-DD') dobs, r.name rank, m.account_status, u.email from student_profile p join belt_rank r on r.id=p.rank_id join membership m on m.user_id=p.user_id join users u on u.id=p.user_id`)).map(r => [r.member_no, r]));
DB.members.forEach(m => {
  const r = sp[m.no] || {}; const k = m.no;
  eq('member', `${k}.name`, m.n, r.full_name); eq('member', `${k}.grade`, m.g, r.rank); eq('member', `${k}.dojo`, m.dojo, r.dojo_id); eq('member', `${k}.hours`, m.hrs, +r.total_accumulated_hours);
  eq('member', `${k}.status`, m.st, r.account_status); eq('member', `${k}.joinedAt`, m.joinedAt, r.jo);
  const [y, mo] = (r.jo || '').split('-'); eq('member', `${k}.joined label`, m.joined, `${MONN[+mo - 1]} ${y}`);
  if (m.dob) eq('member', `${k}.dob`, m.dob, r.dobs);
  if (m.source) eq('member', `${k}.source`, m.source, r.source);
  if (m.kind) eq('member', `${k}.group`, m.kind === 'child' ? 'Child' : 'Adult', r.age_group);
  if (m.email) eq('member', `${k}.email`, m.email, r.email);
  if (m.phone) eq('member', `${k}.phone`, m.phone, r.contact_no);
  if (m.guardian) eq('member', `${k}.guardian`, m.guardian, r.guardian_name);
  if (m.nsf) eq('member', `${k}.nsf`, 'nsf', r.discount_type);
});
seedOnly('student_profile', Object.keys(sp).filter(n => !DB.members.some(m => m.no === n)), [], { text: 'seed students the prototype member list does not show', ids: Object.keys(sp).filter(n => !DB.members.some(m => m.no === n)) });
// every member of the 10-person data.js list has an exact joinedAt; the 15 admSeed members are computed from joinedAgo
// student list (instructor portal) vs profile
DB.students.forEach(s => { const r = Object.values(sp).find(x => x.full_name === s.n) || {}; eq('student list', `${s.n}.grade`, s.g, r.rank); eq('student list', `${s.n}.dojo`, s.dojo, r.dojo_id); });
// the signed-in student
const ME = vm.runInContext('ME', ctx); const me = sp[ME.no] || {};
eq('ME', 'name', ME.name, me.full_name); eq('ME', 'grade', ME.grade, me.rank); eq('ME', 'dojo', ME.dojo, me.dojo_id); eq('ME', 'gender', ME.gender, me.gender);

section('student packages (Lervyn) and payments');
const msp = await q(`select * from student_package where user_id='S-001' and status='Active' order by purchased_at`);
const pk = DB.passes[0]; const sp1 = msp.find(x => x.lessons_left === pk.left && x.lessons_total === pk.total) || {};
eq('pass', 'lessons total/left', `${pk.total}/${pk.left}`, `${sp1.lessons_total}/${sp1.lessons_left}`);
eq('pass', 'bought', iso(pk.bought), String(sp1.purchased_at && new Date(sp1.purchased_at).toISOString().slice(0, 10)));
eq('pass', 'expires', iso(pk.expires), String(sp1.expires_at && new Date(sp1.expires_at).toISOString().slice(0, 10)));
const pay = Object.fromEntries((await q(`select p.*, ${sgd('p.created_at')} d from payment p`)).map(r => [r.invoice_no, r]));
DB.pays.forEach(p => { const r = pay[p.inv] || {}; eq('pays', `${p.inv}.item`, p.item, r.item); eq('pays', `${p.inv}.date`, parseD(p.date), r.d); eq('pays', `${p.inv}.amt`, p.amt, +r.amount); eq('pays', `${p.inv}.status`, p.st, r.status); eq('pays', `${p.inv}.method`, p.method.split(' ')[0], r.method); eq('pays', `${p.inv}.who`, 'S-001', r.user_id); });
DB.ledger.forEach(l => {
  const r = pay[l.inv] || {}; const k = l.id;
  eq('ledger', `${k}.id`, l.id, r.id); eq('ledger', `${k}.who`, noToUser[l.no], r.user_id); eq('ledger', `${k}.item`, l.item, r.item); eq('ledger', `${k}.amt`, l.amt, +r.amount);
  eq('ledger', `${k}.date`, iso(l.date), r.d); eq('ledger', `${k}.status`, l.st, r.status); eq('ledger', `${k}.channel`, l.by, r.channel); eq('ledger', `${k}.method`, l.method, r.method);
});
seedOnly('payment', Object.values(pay).filter(r => !DB.ledger.some(l => l.inv === r.invoice_no) && !DB.pays.some(p => p.inv === r.invoice_no)).map(r => r.id), [], { text: 'extra payments for other students, grading fees and history that the prototype does not list', ids: Object.values(pay).map(r => r.id) });

section('refunds, exceptions, guests, equipment, follow-ups, imports');
const rf = Object.fromEntries((await q(`select r.*, ${sgd('r.requested_at')} d, p.item, p.user_id puser from refund_request r join payment p on p.id=r.payment_id`)).map(r => [r.id, r]));
DB.refunds.forEach(f => { const r = rf[f.id] || {}; eq('refund', `${f.id}.who`, noToUser[f.no], r.user_id); eq('refund', `${f.id}.item`, f.item, r.item); eq('refund', `${f.id}.amt`, f.amt, +r.amount); eq('refund', `${f.id}.reason`, f.reason, r.reason); eq('refund', `${f.id}.by`, f.by, staffName[r.requested_by]); eq('refund', `${f.id}.at`, iso(f.at), r.d); eq('refund', `${f.id}.status`, f.status, r.status); });
seedOnly('refund_request', Object.keys(rf), DB.refunds.map(f => f.id), { text: 'approved refund for a refunded dogi (S-024)', ids: ['R-03'] });
const ex = Object.fromEntries((await q(`select e.*, ${sgd('e.requested_at')} d from exception_request e`)).map(r => [r.id, r]));
DB.exceptions.forEach(x => { const r = ex[x.id] || {}; eq('exception', `${x.id}.kind`, x.kind, r.kind); eq('exception', `${x.id}.who`, x.who, r.subject_name); eq('exception', `${x.id}.text`, x.text, r.detail); eq('exception', `${x.id}.by`, x.by, staffName[r.requested_by]); eq('exception', `${x.id}.at`, iso(x.at), r.d); eq('exception', `${x.id}.status`, x.status, r.status); });
seedOnly('exception_request', Object.keys(ex), DB.exceptions.map(x => x.id), { text: 'none expected', ids: [] });
const gs = Object.fromEntries((await q(`select g.user_id id, g.full_name, g.contact_no, u.email, p.pass_type, p.used, to_char(p.valid_until,'YYYY-MM-DD') vu from guest_profile g join users u on u.id=g.user_id join guest_pass p on p.user_id=g.user_id`)).map(r => [r.id, r]));
DB.guests.forEach(g => { const r = gs[g.id] || {}; eq('guest', `${g.id}.name`, g.name, r.full_name); eq('guest', `${g.id}.mobile`, g.mobile, r.contact_no); eq('guest', `${g.id}.email`, g.email, r.email); eq('guest', `${g.id}.pass`, g.pass, r.pass_type); eq('guest', `${g.id}.used`, g.used, r.used); eq('guest', `${g.id}.until`, g.until ? iso(g.until) : null, r.vu); });
const eqp = Object.fromEntries((await q(`select e.*, ${sgd('e.requested_at')} d from equipment_order e`)).map(r => [r.id, r]));
DB.equipment.forEach(e => { const r = eqp[e.id] || {}; eq('equipment', `${e.id}.who`, noToUser[e.no], r.user_id); eq('equipment', `${e.id}.item`, e.item, r.item); eq('equipment', `${e.id}.size`, e.size, r.size); eq('equipment', `${e.id}.paid`, e.paid, r.paid); eq('equipment', `${e.id}.status`, e.status, r.status); eq('equipment', `${e.id}.at`, iso(e.at), r.d); eq('equipment', `${e.id}.by`, e.by, r.handed_over_to); });
const fu = Object.fromEntries((await q(`select f.*, to_char(f.due_date,'YYYY-MM-DD') due from followup f`)).map(r => [r.id, r]));
const fa = await q(`select a.*, ${sgd('a.attempted_at')} d from followup_attempt a`);
DB.followups.forEach(f => {
  const r = fu[f.id] || {}; eq('followup', `${f.id}.who`, noToUser[f.no], r.user_id); eq('followup', `${f.id}.kind`, f.kind, r.kind); eq('followup', `${f.id}.owner`, f.owner, r.owner_id); eq('followup', `${f.id}.due`, iso(f.due), r.due);
  f.attempts.forEach((a, i) => { const m = fa.find(x => x.followup_id === f.id && x.d === iso(a.at) && x.method === a.method && x.outcome === a.outcome); compared++; if (!m) miss('followup', `${f.id}.attempt${i}`, a, null); });
});
seedOnly('followup_attempt', fa.map(a => a.id), [], { text: 'extra contact attempts (FA-02..04) for the follow-up list', ids: fa.map(a => a.id) });
const imp = Object.fromEntries((await q(`select * from import_issue`)).map(r => [r.id, r]));
DB.imports.forEach(i => { const r = imp[i.id] || {}; eq('import', `${i.id}.file`, i.file, r.file_name); eq('import', `${i.id}.row`, i.row, r.row_no); eq('import', `${i.id}.issue`, i.issue, r.issue_type); eq('import', `${i.id}.name`, i.name, r.person_name); eq('import', `${i.id}.detail`, i.detail, r.detail); eq('import', `${i.id}.status`, i.status, r.status); });

section('registration applications');
const ap = Object.fromEntries((await q(`select a.*, ${sgd('a.submitted_at')} d from registration_application a`)).map(r => [r.full_name, r]));
DB.apps.forEach(a => {
  const r = ap[a.n] || {}; const k = a.n;
  eq('app', `${k}.dojo`, a.dojo, r.dojo_id); eq('app', `${k}.date`, parseD(a.date), r.d); eq('app', `${k}.paid`, a.paid, +r.amount_paid); eq('app', `${k}.group`, a.group, r.applicant_group); eq('app', `${k}.age`, a.age, r.age);
  eq('app', `${k}.gender`, a.gender, r.gender); eq('app', `${k}.nat`, a.nat, r.nationality); eq('app', `${k}.phone`, a.phone, r.phone); eq('app', `${k}.email`, a.email, r.email); eq('app', `${k}.ec`, a.ec, r.emergency_contact);
  eq('app', `${k}.exp`, a.exp === '—' ? null : a.exp, r.prior_experience); eq('app', `${k}.prev`, a.prev === 'Yes', r.previous_member);
  eq('app', `${k}.med`, a.med === 'No' ? null : a.med.replace(/^Yes · /, ''), r.medical_declaration); eq('app', `${k}.dogi`, a.dogi, r.dogi_choice); eq('app', `${k}.signer`, a.signer, r.signer);
});
seedOnly('registration_application', Object.values(ap).map(r => r.id), DB.apps.map(a => (ap[a.n] || {}).id), { text: 'APP-05 (Ryan Chua, approved) and APP-06 (Tommy Lau, rejected) are history rows for the review states', ids: ['APP-05', 'APP-06'] });

section('grading');
const gsn = Object.fromEntries((await q(`select *, to_char(session_date,'YYYY-MM-DD') d, to_char(start_time,'HH24:MI') f, to_char(end_time,'HH24:MI') t, to_char(application_close_date,'YYYY-MM-DD') cl from grading_session`)).map(r => [r.id, r]));
const ex13 = (await q(`select i.full_name from grading_examiner e join instructor_profile i on i.user_id=e.instructor_id where e.session_id='GR-20261213' order by 1`)).map(r => r.full_name);
const pn = DB.panels[0], g13 = gsn['GR-20261213'];
eq('panel', 'date', iso(pn.date), g13.d); eq('panel', 'from', pn.from, g13.f); eq('panel', 'to', pn.to, g13.t); eq('panel', 'venue', 'HQ Dojo', 'HQ Dojo'); eq('panel', 'dojo', 'hq', g13.dojo_id);
eq('panel', 'lead', pn.lead, staffName[g13.lead_examiner_id]); eq('panel', 'examiners', [...pn.examiners].sort().join(','), ex13.join(','));
ALLOW['panels:test session'] && (allowed++, log(`  ALLOWED  panels:test session (${ALLOW['panels:test session']})`));
const GR = DB.grade;
eq('grade', 'date', iso(GR.date), g13.d); eq('grade', 'close', iso(GR.close), g13.cl);
const lerv = (await q(`select to_char(joined_on,'YYYY-MM-DD') jo, to_char(last_passed_grading_date,'YYYY-MM-DD') lp from student_profile where user_id='S-001'`))[0];
const mths = (a, b) => { const A = new Date(a), B = new Date(b); return (B.getFullYear() - A.getFullYear()) * 12 + B.getMonth() - A.getMonth() - (B.getDate() < A.getDate() ? 1 : 0); };
eq('grade', 'monthsInRank', GR.monthsInRank, mths(lerv.lp, '2026-11-06'));
eq('grade', 'memberMonths (rounded)', GR.memberMonths, Math.round((new Date('2026-11-06') - new Date(lerv.jo)) / 864e5 / 30.4375));
eq('grade', 'target', GR.target, '3rd Kyu');
const ga = Object.fromEntries((await q(`select a.*, f.name fr, t.name tn, ${sgd('a.submitted_at')} d, u.full_name from grading_application a join belt_rank f on f.id=a.from_rank_id join belt_rank t on t.id=a.to_rank_id join student_profile u on u.user_id=a.user_id where a.session_id='GR-20261213' order by a.id`)).map(r => [r.full_name, r]));
DB.gradApps.forEach(g => { const r = ga[g.n] || {}; eq('gradApp', `${g.n}.from`, g.from, r.fr); eq('gradApp', `${g.n}.to`, g.to, r.tn); eq('gradApp', `${g.n}.dojo`, g.dojo, 'hq'); eq('gradApp', `${g.n}.sub`, g.sub, r.d ? `${+r.d.slice(8)} ${MONN[+r.d.slice(5, 7) - 1]}` : null); eq('gradApp', `${g.n}.note`, g.note, r.note); });
const gc = Object.fromEntries((await q(`select c.*, f.name fr, t.name tn, u.full_name from grading_candidate c join belt_rank f on f.id=c.from_rank_id join belt_rank t on t.id=c.to_rank_id join student_profile u on u.user_id=c.user_id where c.session_id='GR-20261213'`)).map(r => [r.full_name, r]));
DB.candidates.forEach(c => { const r = gc[c.n] || {}; eq('candidate', `${c.n}.from`, c.from, r.fr); eq('candidate', `${c.n}.to`, c.to, r.tn); eq('candidate', `${c.n}.done`, c.done, r.result !== 'Pending'); });
const pc = Object.fromEntries((await q(`select c.*, f.name fr, t.name tn, u.full_name, h.grading_remarks from grading_candidate c join belt_rank f on f.id=c.from_rank_id join belt_rank t on t.id=c.to_rank_id join student_profile u on u.user_id=c.user_id left join grading_history h on h.user_id=c.user_id and h.grading_session_id=c.session_id where c.session_id='GR-20260927'`)).map(r => [r.full_name, r]));
DB.proposals.forEach(p => { const r = pc[p.n] || {}; eq('proposal', `${p.n}.from`, p.from, r.fr); eq('proposal', `${p.n}.to`, p.to, r.tn); eq('proposal', `${p.n}.by`, p.by, staffName[r.examiner_id]); eq('proposal', `${p.n}.result`, p.result, r.result); eq('proposal', `${p.n}.well`, p.well, r.well_done); eq('proposal', `${p.n}.next`, p.next, r.to_improve); eq('proposal', `${p.n}.fb`, p.fb, r.grading_remarks); });
const myg = await q(`select c.*, f.name fr, t.name tn, to_char(s.session_date,'YYYY-MM-DD') d from grading_candidate c join grading_session s on s.id=c.session_id join belt_rank f on f.id=c.from_rank_id join belt_rank t on t.id=c.to_rank_id where c.user_id='S-001' and c.result<>'Pending' order by s.session_date desc`);
DB.gradingFeedback.forEach((g, i) => { const r = myg[i] || {}; const k = `#${i}`; eq('gradingFeedback', `${k}.from`, g.from, r.fr); eq('gradingFeedback', `${k}.to`, g.to, r.tn); eq('gradingFeedback', `${k}.date`, iso(g.date), r.d); eq('gradingFeedback', `${k}.by`, g.by, staffName[r.examiner_id]); eq('gradingFeedback', `${k}.result`, g.result, r.result); eq('gradingFeedback', `${k}.well`, g.well, r.well_done); eq('gradingFeedback', `${k}.next`, g.next, r.to_improve); });
eq('gradingFeedback', 'count', DB.gradingFeedback.length, myg.length);
seedOnly('grading_session', Object.keys(gsn), ['GR-20261213'], { text: 'three past gradings (Dec 2025, Mar 2026, Sep 2026) behind the student histories', ids: ['GR-20251214', 'GR-20260315', 'GR-20260927'] });

section('closures, cancelled class, sent log');
const cl = Object.fromEntries((await q(`select *, to_char(from_date,'YYYY-MM-DD') f, to_char(to_date,'YYYY-MM-DD') t from class_closure`)).map(r => [r.id, r]));
const cmpCl = (c, id) => { const r = cl[id] || {}; eq('closure', `${c.id}->${id}.from`, iso(c.from), r.f); eq('closure', `${c.id}->${id}.to`, iso(c.to), r.t); eq('closure', `${c.id}->${id}.note`, c.note, r.note); eq('closure', `${c.id}->${id}.dojo`, 'hq', r.dojo_id); };
cmpCl(DB.closures.find(c => c.id === 'C-01'), 'CL-01'); cmpCl(DB.closures.find(c => c.id === 'C-02'), 'CL-GR-20261213');
const cancelled = await q(`select s.lesson_id, s.session_date::text d, to_char(s.start_time,'HH24:MI') st, t.code, (select count(*)::int from class_attendance a where a.lesson_id=s.lesson_id) n from class_session s join class_template t on t.id=s.template_id where s.status='Cancelled'`);
const c3 = DB.closures.find(c => c.id === 'C-03');
eq('closure', 'C-03 one cancelled session', 1, cancelled.length);
eq('closure', 'C-03.code', c3.code, cancelled[0].code); eq('closure', 'C-03.date', iso(c3.from), cancelled[0].d); eq('closure', 'C-03.students', c3.students, cancelled[0].n); eq('closure', 'C-03.lessons', c3.lessons, cancelled[0].n);
eq('closure', 'C-03.label', c3.label, 'Adults 7 PM');
seedOnly('class_closure', Object.keys(cl), ['CL-01', 'CL-GR-20261213'], { text: 'CL-02 mat resurfacing 10-11 Oct and the three past grading-day closures (derived)', ids: ['CL-02', 'CL-GR-20251214', 'CL-GR-20260315', 'CL-GR-20260927'] });
const sl = await q(`select s.*, ${sgd('s.sent_at')} d, t.name tname from sent_log s left join notification_template t on t.id=s.template_id order by s.sent_at`);
const slog = DB.sentLog[0]; const s1 = sl.find(r => r.id === 'SL-01') || {};
eq('sentLog', 'SL-01.date', iso(slog.at), s1.d); eq('sentLog', 'SL-01.by', slog.by, staffName[s1.sent_by]); eq('sentLog', 'SL-01.aud', slog.aud, s1.audience); eq('sentLog', 'SL-01.title', slog.title, s1.title);
eq('sentLog', 'SL-01 sent before the cancelled class', true, new Date(s1.sent_at) < new Date(`${cancelled[0].d}T${cancelled[0].st}:00+08:00`));
seedOnly('sent_log', sl.map(r => r.id), ['SL-01'], { text: 'SL-02 and SL-03 are other office messages', ids: ['SL-02', 'SL-03'] });

section('feedback, remarks, attendance, level-ups');
const fb = await q(`select f.*, s.class_type, to_char(s.session_date,'YYYY-MM-DD') d, i.full_name ins from class_feedback f join class_session s on s.lesson_id=f.lesson_id join instructor_profile i on i.user_id=f.instructor_id order by f.id`);
DB.feedback.forEach((f, i) => { const r = fb[i] || {}; const k = `FB-${String(i + 1).padStart(2, '0')}`; eq('feedback', `${k}.ins`, f.ins, r.ins); eq('feedback', `${k}.type`, f.type, r.class_type); eq('feedback', `${k}.date`, iso(f.date), r.d); eq('feedback', `${k}.rating`, f.rating, r.rating); eq('feedback', `${k}.tags`, f.tags.join('|'), (r.tags || []).join('|')); eq('feedback', `${k}.note`, f.note, r.note); });
eq('feedback', 'count', DB.feedback.length, fb.length);
const rm = await q(`select r.*, to_char(s.session_date,'YYYY-MM-DD') d, u.full_name student, ${sgd('r.created_at')} cd from instructor_remark r left join class_session s on s.lesson_id=r.lesson_id left join student_profile u on u.user_id=r.student_id order by r.id`);
DB.remarks.forEach((x, i) => { const r = rm[i] || {}; const k = `RM-${String(i + 1).padStart(2, '0')}`; eq('remark', `${k}.kind`, x.kind, r.kind); eq('remark', `${k}.student`, x.student, r.student); eq('remark', `${k}.text`, x.text, r.body); eq('remark', `${k}.at`, iso(x.at), r.cd); eq('remark', `${k}.by`, x.by, staffName[r.instructor_id]); if (/\|19:00$/.test(x.key)) eq('remark', `${k}.lesson`, x.key.split('|')[0], r.d); });
eq('remark', 'count', DB.remarks.length, rm.length);
const att = await q(`select a.*, s.class_type, to_char(s.session_date,'YYYY-MM-DD') d, to_char(s.start_time,'HH24:MI') st, i.full_name ins from class_attendance a join class_session s on s.lesson_id=a.lesson_id join instructor_profile i on i.user_id=s.instructor_id where a.user_id='S-001' and a.attendance_status in ('Attended','No-Show') order by s.session_date desc`);
DB.attendance.forEach((a, i) => { const r = att[i] || {}; const k = `#${i}`; eq('attendance', `${k}.date`, iso(a.date), r.d); eq('attendance', `${k}.time`, a.time, r.st); eq('attendance', `${k}.type`, a.type, r.class_type); eq('attendance', `${k}.ins`, a.ins, r.ins); eq('attendance', `${k}.status`, a.status === 'present' ? 'Attended' : 'No-Show', r.attendance_status); });
eq('attendance', 'count', DB.attendance.length, att.length);
const newest = DB.attendance.find(a => a.status === 'present'); eq('levelUps', '[0].date is the newest present class', iso(DB.levelUps[0].date), iso(newest.date));
const lb = await q(`select count(*)::int n from class_attendance where user_id='S-001' and attendance_status='Booked'`);
log(`  info: Lervyn has ${lb[0].n} future Booked rows in the seed (the prototype BOOKINGS list starts empty on purpose, bookings are made in the demo)`);

section('summary');
log(`Compared ${compared} values. Unexplained mismatches: ${bad}. Allowed differences: ${allowed}.`);
log(bad === 0 ? 'RESULT: 0 unexplained mismatches' : `RESULT: ${bad} UNEXPLAINED MISMATCH(ES)`);
fs.writeFileSync(path.join(ROOT, '.db-tmp', 'agree.log'), out.join('\n') + '\n');
process.exit(bad ? 1 : 0);
