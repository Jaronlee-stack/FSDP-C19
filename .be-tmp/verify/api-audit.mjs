// Audit log: one row per audited action (plan2.md section 6) with the right actor / entity / summary, rollback, secrets scan,
// append-only trigger, GET /admin/audit + export.csv (auth matrix, filters, pagination, validation, CSV), seeded rows, and a double schema load.
import { spawnApp, resetDb, client, login, pgConnect, suite, findSecrets } from './lib.mjs';
import { makeFixtures } from './instructor-fixtures.mjs';

await resetDb();
const app = await spawnApp();
const base = app.base;
const t = suite('api-audit');
const { check, expect } = t;
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const maxId = async () => (await q(`select coalesce(max(id), 0)::int n from audit_log`))[0].n;
const ACT = {
  BA: { id: 'ADM-001', role: 'admin', adminType: 'business' },
  FD: { id: 'ADM-101', role: 'admin', adminType: 'frontdesk' },
  INS: { id: 'INS-0042', role: 'instructor', adminType: null },
  NONE: { id: null, role: null, adminType: null }
};
const captured = [];               // temporary passwords seen in responses: must never reach an audit row
const covered = new Set();

/* run fn, then expect exactly `n` new audit rows; the row with `action` must carry the actor snapshot, entity, a summary and a fresh time */
async function audited(label, action, fn, { actor, entityType, entityId, n = 1, status } = {}) {
  const before = await maxId();
  const r = await fn();
  const rows = await q(`select * from audit_log where id > $1 order by id`, [before]);
  const okStatus = status ? r.status === status : r.status < 300;
  const row = rows.find(x => x.action === action);
  const fresh = row && Math.abs(Date.now() - new Date(row.occurred_at).getTime()) < 120000;
  const okRow = row && row.actor_user_id === actor.id && row.actor_role === actor.role && row.actor_admin_type === actor.adminType
    && (entityType === undefined || row.entity_type === entityType) && (entityId === undefined || row.entity_id === entityId)
    && typeof row.summary === 'string' && row.summary.trim().length > 0 && fresh && (actor.id === null || !!row.actor_name);
  check(`${action}: ${label} -> ${rows.length} row(s), actor ${actor.id || 'none'}, entity ${entityType || '?'}/${entityId === undefined ? '?' : entityId}`,
    okStatus && rows.length === n && okRow, `status ${r.status} ${(r.text || '').slice(0, 160)} | rows ${JSON.stringify(rows.map(x => [x.action, x.actor_user_id, x.actor_role, x.actor_admin_type, x.entity_type, x.entity_id]))}`);
  covered.add(action);
  return { r, row: row || {} };
}

try {
  /* ---------- seeded rows ---------- */
  const seeded = (await q(`select count(*)::int n, min(occurred_at) a, max(occurred_at) b, count(distinct action)::int k from audit_log`))[0];
  check('seed: at least 14 audit rows, all inside 2025-11-06..2027-11-06', seeded.n >= 14 && seeded.a >= new Date('2025-11-06T00:00:00+08:00') && seeded.b < new Date('2027-11-07T00:00:00+08:00'), JSON.stringify(seeded));
  const seedActors = await q(`select distinct actor_user_id a from audit_log where actor_user_id is not null`);
  check('seed: every seeded actor exists in users', (await q(`select count(*)::int n from audit_log a where actor_user_id is not null and not exists (select 1 from users u where u.id = a.actor_user_id)`))[0].n === 0 && seedActors.length >= 3);

  /* ---------- auth ---------- */
  const BA = client(base), FD = client(base), INS = client(base);
  await audited('Business Admin signs in', 'auth.login', () => BA.post('/auth/login', { portal: 'admin', identifier: 'ADM-001', password: 'password123' }), { actor: ACT.BA, entityType: 'user', entityId: 'ADM-001' });
  await audited('front desk signs in', 'auth.login', () => FD.post('/auth/login', { portal: 'admin', identifier: 'ADM-101', password: 'password123' }), { actor: ACT.FD, entityType: 'user', entityId: 'ADM-101' });
  await audited('instructor signs in', 'auth.login', () => INS.post('/auth/login', { portal: 'instructor', identifier: 'INS-0042', password: 'password123' }), { actor: ACT.INS, entityType: 'user', entityId: 'INS-0042' });
  const lf = await audited('wrong password for ADM-101', 'auth.login_failed', () => client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-101', password: 'Typed-Secret-1' }), { actor: ACT.NONE, entityType: 'user', entityId: 'ADM-101', status: 401 });
  check('auth.login_failed: details hold portal + reason only, never the typed identifier or password', JSON.stringify(lf.row.details) === JSON.stringify({ portal: 'admin', reason: 'wrong_password' }), JSON.stringify(lf.row.details));
  const lu = await audited('unknown account', 'auth.login_failed', () => client(base).post('/auth/login', { portal: 'student', identifier: 'ASK-1999-4242', password: 'Typed-Secret-2' }), { actor: ACT.NONE, entityType: null, entityId: null, status: 401 });
  check('auth.login_failed (unknown): reason unknown_account, the typed id is not stored anywhere', lu.row.details && lu.row.details.reason === 'unknown_account' && !JSON.stringify(lu.row).includes('ASK-1999-4242'));
  const marcus = (await q(`select user_id from student_profile where member_no = 'ASK-2026-0102'`))[0].user_id;
  const M = await login(base, 'student', 'ASK-2026-0102');
  await audited('student changes own password', 'auth.password_changed', () => M.post('/auth/change-password', { currentPassword: 'password123', newPassword: 'Marcus2026pw', confirmPassword: 'Marcus2026pw' }), { actor: { id: marcus, role: 'student', adminType: null }, entityType: 'user', entityId: marcus });
  await audited('wrong current password', 'auth.password_change_failed', () => M.post('/auth/change-password', { currentPassword: 'nope-nope-1', newPassword: 'Marcus2027pw' }), { actor: { id: marcus, role: 'student', adminType: null }, entityType: 'user', entityId: marcus, status: 400 });

  /* ---------- staff ---------- */
  const sc = await audited('create a front desk account', 'staff.created', () => BA.post('/admin/staff', { name: 'Audit Desk', type: 'frontdesk', email: 'audit.desk@askdojo.example' }), { actor: ACT.BA, entityType: 'staff', entityId: 'ADM-103' });
  captured.push(sc.r.json.tempPassword);
  check('staff.created: details have no email value', !JSON.stringify(sc.row.details).includes('audit.desk@'), JSON.stringify(sc.row.details));
  const rc = await audited('front desk -> business', 'staff.role_changed', () => BA.patch('/admin/staff/ADM-103', { type: 'business' }), { actor: ACT.BA, entityType: 'staff', entityId: 'ADM-103' });
  check('staff.role_changed: before/after type', JSON.stringify(rc.row.details).includes('frontdesk') && JSON.stringify(rc.row.details).includes('business'), JSON.stringify(rc.row.details));
  await audited('deactivate', 'staff.deactivated', () => BA.patch('/admin/staff/ADM-103', { status: 'inactive' }), { actor: ACT.BA, entityType: 'staff', entityId: 'ADM-103' });
  await audited('reactivate', 'staff.reactivated', () => BA.patch('/admin/staff/ADM-103', { status: 'active' }), { actor: ACT.BA, entityType: 'staff', entityId: 'ADM-103' });
  const pr = await audited('reset password', 'staff.password_reset', () => BA.post('/admin/staff/ADM-103/reset-password', {}), { actor: ACT.BA, entityType: 'staff', entityId: 'ADM-103' });
  captured.push(pr.r.json.tempPassword);

  /* ---------- members and follow-ups ---------- */
  const mu = await audited('front desk edits contact details', 'member.updated', () => FD.patch('/admin/members/ASK-2025-1834', { phone: '9123 9999', email: 'lervyn.audit@email.com' }), { actor: ACT.FD, entityType: 'member', entityId: 'ASK-2025-1834' });
  check('member.updated: PII field names only, never the values', !/9123 9999|lervyn\.audit/.test(JSON.stringify(mu.row.details) + mu.row.summary), JSON.stringify(mu.row.details));
  await audited('belt change', 'member.belt_changed', () => BA.patch('/admin/members/ASK-2025-1834', { rankId: '3k', reason: 'Audit test' }), { actor: ACT.BA, entityType: 'member', entityId: 'ASK-2025-1834' });
  await audited('message', 'member.message_sent', () => FD.post('/admin/members/ASK-2025-1834/messages', { body: 'See you Friday' }), { actor: ACT.FD, entityType: 'member', entityId: 'ASK-2025-1834' });
  await audited('contact attempt', 'followup.contact_logged', () => FD.post('/admin/members/ASK-2025-1834/contact-attempts', { method: 'Call', outcome: 'No answer' }), { actor: ACT.FD, entityType: 'member', entityId: 'ASK-2025-1834' });
  const fc = await audited('create follow-up', 'followup.created', () => BA.post('/admin/followups', { memberNo: 'ASK-2025-1834', kind: 'renewal', ownerId: 'ADM-101', dueDate: '2026-11-10' }), { actor: ACT.BA, entityType: 'followup' });
  await audited('update follow-up', 'followup.updated', () => BA.patch(`/admin/followups/${fc.row.entity_id}`, { status: 'done' }), { actor: ACT.BA, entityType: 'followup', entityId: fc.row.entity_id });
  await audited('follow-up attempt', 'followup.attempt_logged', () => FD.post(`/admin/followups/${fc.row.entity_id}/attempts`, { method: 'Email', outcome: 'Sent' }), { actor: ACT.FD, entityType: 'followup', entityId: fc.row.entity_id });

  /* ---------- payments, refunds, day lock, equipment ---------- */
  const p1 = await audited('take payment', 'payment.collected', () => FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'dogi:Cotton (Standard)', method: 'Stripe' }), { actor: ACT.FD, entityType: 'payment' });
  await audited('void', 'payment.voided', () => BA.post(`/admin/payments/${p1.row.entity_id}/void`, { reason: 'Audit void' }), { actor: ACT.BA, entityType: 'payment', entityId: p1.row.entity_id });
  await audited('report a mistake', 'payment.mistake_reported', () => FD.post(`/admin/payments/${p1.row.entity_id}/mistake`, { reason: 'Wrong amount' }), { actor: ACT.FD, entityType: 'payment', entityId: p1.row.entity_id });
  const p2 = await audited('take payment 2', 'payment.collected', () => FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'dogi:Cotton (Standard)', method: 'PayNow' }), { actor: ACT.FD, entityType: 'payment' });
  await audited('adjust', 'payment.adjusted', () => BA.post(`/admin/payments/${p2.row.entity_id}/void`, { reason: 'Discount', adjustTo: 10 }), { actor: ACT.BA, entityType: 'payment', entityId: p2.row.entity_id });
  const p3 = await audited('take payment 3', 'payment.collected', () => FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'dogi:Cotton (Standard)', method: 'PayNow' }), { actor: ACT.FD, entityType: 'payment' });
  const rq = await audited('refund request', 'refund.requested', () => FD.post('/admin/refunds', { paymentId: p3.row.entity_id, reason: 'Wrong size' }), { actor: ACT.FD, entityType: 'refund' });
  await audited('refund decision', 'refund.decided', () => BA.post(`/admin/refunds/${rq.row.entity_id}/decision`, { decision: 'approved' }), { actor: ACT.BA, entityType: 'refund', entityId: rq.row.entity_id });
  await audited('collect outstanding dues (L-1008)', 'payment.collected', () => FD.post('/admin/payments/L-1008/collect', {}), { actor: ACT.FD, entityType: 'payment', entityId: 'L-1008' });
  await audited('lock the day', 'day.locked', () => FD.post('/admin/payments/day/lock', {}), { actor: ACT.FD, entityType: 'day', entityId: '2026-11-06' });
  await audited('unlock the day', 'day.unlocked', () => BA.del('/admin/payments/day/lock/2026-11-06', {}), { actor: ACT.BA, entityType: 'day', entityId: '2026-11-06' });
  await audited('equipment ready', 'equipment.ready', () => FD.post('/admin/equipment/E-02/ready', {}), { actor: ACT.FD, entityType: 'equipment', entityId: 'E-02' });
  const ho = await audited('equipment handover', 'equipment.handed_over', () => FD.post('/admin/equipment/E-02/handover', { collectedBy: 'Hannah Teo' }), { actor: ACT.FD, entityType: 'equipment', entityId: 'E-02' });
  check('equipment.handed_over: the collector name is not stored', !JSON.stringify(ho.row.details).includes('Hannah Teo'), JSON.stringify(ho.row.details));

  /* ---------- exceptions, extensions, registrations ---------- */
  const ex = await audited('raise exception', 'exception.raised', () => FD.post('/admin/exceptions', { kind: 'access', memberNo: 'ASK-2025-1834', detail: 'Needs access' }), { actor: ACT.FD, entityType: 'exception' });
  await audited('decide exception', 'exception.decided', () => BA.post(`/admin/exceptions/${ex.row.entity_id}/decision`, { decision: 'declined', reason: 'No' }), { actor: ACT.BA, entityType: 'exception', entityId: ex.row.entity_id });
  await audited('decide MC-01', 'mc.decision', () => BA.post('/admin/mc-requests/MC-01/decision', { decision: 'declined', reason: 'Document unreadable' }), { actor: ACT.BA, entityType: 'mc_request', entityId: 'MC-01' });
  await audited('tick a checklist item', 'registration.checklist_changed', () => FD.patch('/admin/applications/APP-02/checklist', { ruleId: 'paid', done: true }), { actor: ACT.FD, entityType: 'registration_application', entityId: 'APP-02' });
  await audited('activate APP-01', 'registration.activated', () => FD.post('/admin/applications/APP-01/activate', {}), { actor: ACT.FD, entityType: 'registration_application', entityId: 'APP-01' });
  await audited('request info on APP-04', 'registration.info_requested', () => FD.post('/admin/applications/APP-04/request-info', { text: 'Please send the guardian signature' }), { actor: ACT.FD, entityType: 'registration_application', entityId: 'APP-04' });
  await audited('reject APP-04', 'registration.rejected', () => FD.post('/admin/applications/APP-04/reject', { note: 'Duplicate registration' }), { actor: ACT.FD, entityType: 'registration_application', entityId: 'APP-04' });
  const reg = {
    name: 'Aud Itor', dojoId: 'hq', age: 28, dob: '1998-05-05', gender: 'Female', nationality: 'Singaporean', phone: '9000 1111', email: 'aud.itor@example.com',
    emergencyContact: 'Sam (Brother) · 9000 2222', priorExperience: null, previousMember: false, medical: null,
    dogi: { type: 'Cotton (Standard)', size: '3' }, packageId: 'a25', signer: 'Aud Itor', signatureProvided: true, password: 'Auditor2026', confirmPassword: 'Auditor2026'
  };
  const pubReg = await audited('public registration (auto-activated: submitted + activated)', 'registration.submitted', () => client(base).post('/public/registrations', reg), { actor: ACT.NONE, entityType: 'registration_application', n: 2 });
  check('public registration: the activated row has no actor either', (await q(`select actor_user_id a from audit_log where action = 'registration.activated' and entity_id = $1`, [pubReg.row.entity_id]))[0].a === null);
  await audited('desk registration (submitted + activated)', 'registration.submitted', () => FD.post('/admin/registrations', { ...reg, name: 'Desk Aud', email: 'desk.aud@example.com' }), { actor: ACT.FD, entityType: 'registration_application', n: 2 });

  /* ---------- desk rosters ---------- */
  const lesson = (id, day, start, end, type) => q(`insert into class_session (lesson_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity, status) values ($1, 'hq', $2, $3, $4, 'Mat C', $5, 'INS-0042', 20, 'Scheduled')`, [id, day, start, end, type]);
  const book = (lid, uid) => q(`insert into class_attendance (lesson_id, user_id, attendance_status, booked_via) values ($1, $2, 'Booked', 'online')`, [lid, uid]);
  await lesson('LS-AU-ADV', '2026-11-10', '20:00', '21:00', 'Advanced');
  await lesson('LS-AU-A', '2026-11-11', '18:00', '19:00', 'Adults'); await book('LS-AU-A', 'S-002');
  await lesson('LS-AU-PAST', '2026-11-05', '10:00', '11:00', 'Adults'); await book('LS-AU-PAST', 'S-001'); await book('LS-AU-PAST', 'S-002');
  const before0 = await maxId();
  expect('a normal desk booking (not an override) is not audited', await FD.post('/admin/rosters/LS-AU-A/bookings', { memberNo: 'ASK-2025-2511' }), 200);
  check('...no audit row for it (routine, D12)', (await maxId()) === before0);
  await audited('override booking', 'booking.overridden', () => BA.post('/admin/rosters/LS-AU-ADV/bookings', { memberNo: 'ASK-2025-2064', override: true, reason: 'Sensei invited her' }), { actor: ACT.BA, entityType: 'lesson', entityId: 'LS-AU-ADV' });
  await audited('staff cancels a booking', 'booking.cancelled_by_staff', () => FD.del('/admin/rosters/LS-AU-A/bookings/S-002', { refund: false, reason: 'No MC' }), { actor: ACT.FD, entityType: 'lesson', entityId: 'LS-AU-A' });
  await audited('submit attendance', 'attendance.submitted', () => FD.post('/admin/rosters/LS-AU-PAST/submit', { rows: [{ userId: 'S-001', status: 'Attended' }, { userId: 'S-002', status: 'No-Show' }] }), { actor: ACT.FD, entityType: 'lesson', entityId: 'LS-AU-PAST' });
  const cor = await audited('correct attendance after submit', 'attendance.corrected', () => FD.put('/admin/rosters/LS-AU-PAST/attendance/S-002', { status: 'Attended', reason: 'Instructor confirmed' }), { actor: ACT.FD, entityType: 'lesson', entityId: 'LS-AU-PAST' });
  check('attendance.corrected: before/after status in details', /No-Show|noshow|no_show/i.test(JSON.stringify(cor.row.details)) && /Attended|present/i.test(JSON.stringify(cor.row.details)), JSON.stringify(cor.row.details));

  /* ---------- business admin settings ---------- */
  const cl = await audited('create closure', 'closure.created', () => BA.post('/admin/closures', { dojoId: 'hq', from: '2026-12-01', note: 'Audit' }), { actor: ACT.BA, entityType: 'closure' });
  await audited('delete closure', 'closure.deleted', () => BA.del(`/admin/closures/${cl.row.entity_id}`, {}), { actor: ACT.BA, entityType: 'closure', entityId: cl.row.entity_id });
  const les = (await q(`select lesson_id from class_session where status = 'Scheduled' and session_date > '2026-11-12' and lesson_id like 'LS-2026%' order by session_date, lesson_id limit 1`))[0].lesson_id;
  await audited('cancel a class', 'class.cancelled', () => BA.post(`/admin/classes/${les}/cancel`, { note: 'Unwell' }), { actor: ACT.BA, entityType: 'lesson', entityId: les });
  const pol = await audited('policy values', 'policy.updated', () => BA.patch('/admin/policies', { annual_dues: 51, cancel_hours: 5 }), { actor: ACT.BA, entityType: 'policy' });
  check('policy.updated: before/after of the changed keys', JSON.stringify(pol.row.details).includes('51') && JSON.stringify(pol.row.details).includes('48'), JSON.stringify(pol.row.details));
  await audited('package price', 'policy.package_updated', () => BA.patch('/admin/policies/packages/a10', { price: 280 }), { actor: ACT.BA, entityType: 'policy', entityId: 'a10' });
  await audited('auto-activation rule', 'policy.rule_updated', () => BA.patch('/admin/policies/auto-activation/paid', { enabled: false }), { actor: ACT.BA, entityType: 'policy', entityId: 'paid' });
  const tp = await audited('create template', 'policy.template_created', () => BA.post('/admin/policies/templates', { name: 'Audit tpl', text: 'Hi' }), { actor: ACT.BA, entityType: 'policy' });
  await audited('update template', 'policy.template_updated', () => BA.patch(`/admin/policies/templates/${tp.r.json.id}`, { text: 'Hi again' }), { actor: ACT.BA, entityType: 'policy', entityId: tp.r.json.id });
  await audited('delete template', 'policy.template_deleted', () => BA.del(`/admin/policies/templates/${tp.r.json.id}`, {}), { actor: ACT.BA, entityType: 'policy', entityId: tp.r.json.id });
  const tt = await audited('timetable create', 'timetable.changed', () => BA.post('/admin/timetable', { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 10 }), { actor: ACT.BA, entityType: 'timetable' });
  check('timetable.changed (create): details.change = created', tt.row.details && tt.row.details.change === 'created', JSON.stringify(tt.row.details));
  const tu = await audited('timetable update', 'timetable.changed', () => BA.patch(`/admin/timetable/${tt.row.entity_id}`, { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 12 }), { actor: ACT.BA, entityType: 'timetable', entityId: tt.row.entity_id });
  const td = await audited('timetable delete', 'timetable.changed', () => BA.del(`/admin/timetable/${tt.row.entity_id}`, {}), { actor: ACT.BA, entityType: 'timetable', entityId: tt.row.entity_id });
  check('timetable.changed: updated / removed recorded', tu.row.details.change === 'updated' && td.row.details.change === 'removed', JSON.stringify([tu.row.details, td.row.details]));
  const imp = (await q(`select id from import_issue where status = 'open' order by id limit 1`))[0];
  check('fixture: an open import issue exists', !!imp);
  if (imp) await audited('import decision', 'import.decided', () => BA.patch(`/admin/imports/${imp.id}`, { status: 'dismissed' }), { actor: ACT.BA, entityType: 'import', entityId: imp.id });
  const iv = await audited('intervention add', 'intervention.added', () => BA.post('/admin/insights/interventions', { name: 'Audit', slot: 'Sat 10', before: 5, after: 9, decision: 'continue' }), { actor: ACT.BA, entityType: 'intervention' });
  await audited('intervention decide', 'intervention.decided', () => BA.patch(`/admin/insights/interventions/${iv.row.entity_id}`, { decision: 'stop' }), { actor: ACT.BA, entityType: 'intervention', entityId: iv.row.entity_id });
  await audited('notification send', 'notification.sent', () => BA.post('/admin/notifications/send', { title: 'Audit note', audience: { type: 'student', target: 'ASK-2025-1834' } }), { actor: ACT.BA, entityType: 'notification' });

  /* ---------- grading ---------- */
  await audited('approve GA-12', 'grading.application_decided', () => BA.post('/admin/grading/applications/GA-12/decision', { decision: 'approved' }), { actor: ACT.BA, entityType: 'grading_application', entityId: 'GA-12' });
  await audited('promote S-005', 'grading.promotion_decided', () => BA.post('/admin/grading/candidates/GR-20260927/S-005/promotion', { decision: 'promote' }), { actor: ACT.BA, entityType: 'grading_candidate', entityId: 'GR-20260927:S-005' });
  const fx = await makeFixtures(pg);
  if (fx.usable) {
    const scores = Object.fromEntries(['Omote', 'Ura'].flatMap(v => ['entry', 'control', 'posture'].map(c => [`${v}-${c}`, 3])));
    const gr = await audited('examiner submits a result', 'grading.result_submitted', () => INS.post(`/instructor/grading/sessions/${fx.gr}/candidates/S-002/result`, { scores, well: 'Calm ukemi.', toImprove: 'Lower hips.', signature: true }), { actor: ACT.INS, entityType: 'grading_candidate', entityId: `${fx.gr}:S-002` });
    check('grading.result_submitted: no feedback text in the row', !/Calm ukemi|Lower hips/.test(JSON.stringify(gr.row.details) + gr.row.summary));
  } else { check('(skipped grading.result_submitted: the live grading fixture needs a Singapore time between 00:20 and 22:00)', true); covered.add('grading.result_submitted'); }

  /* ---------- refused or rolled-back actions leave no row ---------- */
  let b = await maxId();
  expect('void a missing payment -> 404', await BA.post('/admin/payments/L-9999/void', { reason: 'x' }), 404);
  check('failed action wrote no audit row', (await maxId()) === b);
  b = await maxId();
  expect('front desk policy edit -> 403', await FD.patch('/admin/policies', { annual_dues: 60 }), 403);
  expect('front desk staff create -> 403', await FD.post('/admin/staff', { name: 'Nope', type: 'frontdesk', email: 'nope@askdojo.example' }), 403);
  check('forbidden actions wrote no audit row', (await maxId()) === b);
  // an action whose audit write fails rolls back as a whole (the audit insert is in the same transaction)
  await q(`create function audit_fail_probe() returns trigger language plpgsql as $$ begin if NEW.action in ('policy.updated', 'auth.login_failed') then raise exception 'probe: audit write failed'; end if; return NEW; end $$`);
  await q(`create trigger audit_fail_probe before insert on audit_log for each row execute function audit_fail_probe()`);
  try {
    const pol0 = (await BA.get('/admin/policies')).text;
    b = await maxId();
    const fail = await BA.patch('/admin/policies', { annual_dues: 99 });
    check('audit write fails inside the action -> 500 and a generic error body', fail.status === 500 && !/probe|audit_log|stack/i.test(fail.text), `${fail.status} ${fail.text.slice(0, 160)}`);
    check('...the policy change was rolled back with it and no audit row exists', (await BA.get('/admin/policies')).text === pol0 && (await maxId()) === b);
    const normal = await client(base).post('/auth/login', { portal: 'admin', identifier: 'ADM-101', password: 'wrong-one-1' });
    check('auth.login_failed: a failing audit write (recordSafe) does not change the 401 response', normal.status === 401 && normal.json.error.code === lf.r.json.error.code && normal.json.error.message === lf.r.json.error.message, normal.text);
    check('...and no row was written', (await maxId()) === b);
  } finally {
    await q(`drop trigger audit_fail_probe on audit_log`); await q(`drop function audit_fail_probe()`);
  }

  /* ---------- the audit API ---------- */
  const anon = client(base), ST = await login(base, 'student', 'ASK-2025-1834');
  for (const p of ['/admin/audit', '/admin/audit/export.csv']) {
    expect(`${p}: anonymous -> 401`, await anon.get(p), 401);
    expect(`${p}: student -> 403`, await ST.get(p), 403);
    expect(`${p}: instructor -> 403`, await INS.get(p), 403);
    expect(`${p}: front desk -> 403 BUSINESS_ADMIN_ONLY`, await FD.get(p), 403, 'BUSINESS_ADMIN_ONLY');
    const ok = await BA.get(p);
    check(`${p}: Business Admin -> 200 with Cache-Control no-store`, ok.status === 200 && /no-store/.test(ok.headers.get('cache-control') || ''), `${ok.status}`);
  }
  const all = await BA.get('/admin/audit?pageSize=100');
  const dbTotal = (await q(`select count(*)::int n from audit_log`))[0].n;
  check('list: shape { rows, total, page, pageSize, pages, facets } and total = db count', all.status === 200 && all.json.total === dbTotal && all.json.page === 1 && all.json.pageSize === 100 && all.json.pages === Math.ceil(dbTotal / 100) && all.json.facets && Array.isArray(all.json.facets.actors), JSON.stringify({ total: all.json.total, dbTotal }));
  const r0 = all.json.rows[0];
  check('list: row mapping { id, at, actor{id,name,role,adminType}, action, group, entityType, entityId, summary, details, ip }', r0 && ['id', 'at', 'actor', 'action', 'group', 'entityType', 'entityId', 'summary', 'details', 'ip'].every(k => k in r0) && ['id', 'name', 'role', 'adminType'].every(k => k in r0.actor) && r0.group === r0.action.split('.')[0], JSON.stringify(r0));
  check('list: newest first', all.json.rows.every((r, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(r.at)));
  // pagination consistency
  const seen = []; let pages = 0, pg1 = null;
  for (let p = 1; p <= 200; p++) { const r = await BA.get(`/admin/audit?pageSize=7&page=${p}`); if (p === 1) pg1 = r.json; pages++; seen.push(...r.json.rows.map(x => x.id)); if (p >= r.json.pages) break; }
  check('pagination: walking every page of 7 returns each row exactly once, pages = ceil(total / 7)', seen.length === dbTotal + 0 && new Set(seen).size === seen.length && pg1.pages === Math.ceil(dbTotal / 7) && pages === pg1.pages, `${seen.length}/${dbTotal} pages ${pages}/${pg1 && pg1.pages}`);
  const beyond = await BA.get('/admin/audit?pageSize=7&page=9999');
  check('pagination: a page past the end is empty with the same total', beyond.status === 200 && beyond.json.rows.length === 0 && beyond.json.total === dbTotal);
  // filters
  const F = async (qs, pred, label) => { const r = await BA.get('/admin/audit?pageSize=100&' + qs); check(`filter ${label || qs}: ${r.json && r.json.total} rows, all match`, r.status === 200 && r.json.total > 0 && r.json.rows.every(pred), r.text.slice(0, 200)); return r; };
  await F('group=staff', r => r.group === 'staff');
  await F('action=auth.login', r => r.action === 'auth.login');
  await F('actorId=ADM-101', r => r.actor.id === 'ADM-101');
  await F('entityType=payment', r => r.entityType === 'payment');
  await F('entityType=staff&entityId=ADM-103', r => r.entityType === 'staff' && r.entityId === 'ADM-103');
  await F('q=' + encodeURIComponent('ADM-103'), r => /ADM-103/i.test(r.summary + r.entityId + r.actor.name + r.action));
  const day = await F('from=2026-10-01&to=2026-10-31', r => { const d = new Date(r.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); return d >= '2026-10-01' && d <= '2026-10-31'; }, 'from/to (Oct 2026, Singapore days)');
  check('filter from/to: count equals the db count for that window', day.json.total === (await q(`select count(*)::int n from audit_log where occurred_at >= '2026-10-01T00:00:00+08:00' and occurred_at < '2026-11-01T00:00:00+08:00'`))[0].n);
  const combo = await BA.get('/admin/audit?group=payment&actorId=ADM-101&pageSize=100');
  check('filters combine (group + actor)', combo.json.total > 0 && combo.json.rows.every(r => r.group === 'payment' && r.actor.id === 'ADM-101') && combo.json.total === (await q(`select count(*)::int n from audit_log where action like 'payment.%' and actor_user_id = 'ADM-101'`))[0].n);
  const esc = await BA.get('/admin/audit?q=' + encodeURIComponent('100%_'));
  check('q: % and _ are literal (no match)', esc.status === 200 && esc.json.total === 0);
  expect("q: SQL-looking text is only data", await BA.get('/admin/audit?q=' + encodeURIComponent("'; DROP TABLE audit_log;--")), 200);
  check('...audit_log still there', (await q(`select count(*)::int n from audit_log`))[0].n >= dbTotal);
  // validation
  for (const qs of ['from=2026-10-01&to=2026-09-01', 'group=nope', 'action=NOPE', 'action=auth', 'pageSize=101', 'pageSize=0', 'page=0', 'page=abc', 'from=2026-13-01', 'foo=1', 'q=' + 'x'.repeat(101)])
    expect(`validation: ${qs.slice(0, 40)} -> 400`, await BA.get('/admin/audit?' + qs), 400, 'VALIDATION_ERROR');
  expect('validation: export rejects page params', await BA.get('/admin/audit/export.csv?page=2'), 400, 'VALIDATION_ERROR');
  // CSV
  await q(`insert into audit_log (actor_user_id, actor_name, actor_role, action, summary) values (null, '=cmd|calc', 'admin', 'auth.login', '=1+1'), (null, '@SUM(A1)', 'admin', 'auth.login', '+2+3'), (null, 'x', 'admin', 'auth.login', '-4-5 formula')`);
  b = await maxId();
  const csv = await BA.get('/admin/audit/export.csv?group=policy');
  const lines = csv.text.trim().split(/\r\n/);
  const polCount = (await q(`select count(*)::int n from audit_log where action like 'policy.%'`))[0].n;
  check('csv: text/csv, attachment audit-log-2026-11-06.csv, no-store', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type')) && /attachment; filename="audit-log-2026-11-06\.csv"/.test(csv.headers.get('content-disposition') || '') && /no-store/.test(csv.headers.get('cache-control') || ''), JSON.stringify([...csv.headers]));
  check('csv: header row', lines[0] === '"Time (SGT)","Actor ID","Actor","Role","Action","Entity type","Entity ID","Summary","Details"', lines[0]);
  check('csv: one line per matching row', lines.length - 1 === polCount, `${lines.length - 1} vs ${polCount}`);
  const exRow = (await q(`select * from audit_log where id > $1 and action = 'audit.exported'`, [b]))[0];
  check('csv: audit.exported row by ADM-001 with filters and count', exRow && exRow.actor_user_id === 'ADM-001' && exRow.entity_type === 'audit' && exRow.details.count === polCount && JSON.stringify(exRow.details.filters).includes('policy'), JSON.stringify(exRow && exRow.details));
  covered.add('audit.exported');
  const fcsv = await BA.get('/admin/audit/export.csv?action=auth.login&q=' + encodeURIComponent('formula'));
  const fcsv2 = await BA.get('/admin/audit/export.csv?action=auth.login');
  check("csv: cells starting with = + - @ are prefixed with '", /"'=1\+1"/.test(fcsv2.text) && /"'=cmd\|calc"/.test(fcsv2.text) && /"'\+2\+3"/.test(fcsv2.text) && /"'@SUM\(A1\)"/.test(fcsv2.text) && /"'-4-5 formula"/.test(fcsv.text), fcsv2.text.slice(0, 300));

  /* ---------- trigger: append-only ---------- */
  const anyId = (await q(`select id from audit_log where actor_user_id is not null order by id limit 1`))[0].id;
  for (const [label, sql] of [['UPDATE summary', `update audit_log set summary = 'x' where id = ${anyId}`], ['DELETE', `delete from audit_log where id = ${anyId}`], ['TRUNCATE', `truncate audit_log`],
    ['UPDATE actor to another user', `update audit_log set actor_user_id = 'ADM-101' where id = ${anyId}`], ['UPDATE actor to NULL plus summary', `update audit_log set actor_user_id = null, summary = 'x' where id = ${anyId}`]]) {
    let msg = ''; try { await pg.query(sql); } catch (e) { msg = e.message; }
    check(`trigger: ${label} is refused (append-only)`, /append-only/.test(msg), msg || 'no error');
  }
  await pg.query('begin');
  let setNull = 'ok'; try { await pg.query(`update audit_log set actor_user_id = null where id = $1`, [anyId]); } catch (e) { setNull = e.message; }
  await pg.query('rollback');
  check('trigger: only the FK ON DELETE SET NULL transition (actor -> NULL, nothing else) is allowed', setNull === 'ok', setNull);
  const n0 = (await q(`select count(*)::int n from audit_log`))[0].n;
  await q(`insert into audit_log (action, summary) values ('auth.login', 'probe insert')`);
  check('trigger: INSERT still works', (await q(`select count(*)::int n from audit_log`))[0].n === n0 + 1);
  let badAction = ''; try { await pg.query(`insert into audit_log (action, summary) values ('Bad Action', 'x')`); } catch (e) { badAction = e.message; }
  check('schema: action must look like group.verb (CHECK)', /check/i.test(badAction), badAction);

  /* ---------- coverage + secrets ---------- */
  const PLAN = ['auth.login', 'auth.login_failed', 'auth.password_changed', 'staff.created', 'staff.role_changed', 'staff.deactivated', 'staff.reactivated', 'staff.password_reset',
    'member.updated', 'member.belt_changed', 'member.message_sent', 'followup.contact_logged', 'followup.attempt_logged', 'followup.created', 'followup.updated',
    'payment.collected', 'payment.voided', 'payment.adjusted', 'payment.mistake_reported', 'refund.requested', 'refund.decided', 'day.locked', 'day.unlocked', 'equipment.ready', 'equipment.handed_over',
    'exception.raised', 'exception.decided', 'mc.decision', 'registration.checklist_changed', 'registration.activated', 'registration.rejected', 'registration.info_requested', 'registration.submitted',
    'booking.overridden', 'booking.cancelled_by_staff', 'attendance.corrected', 'attendance.submitted', 'closure.created', 'closure.deleted', 'class.cancelled',
    'policy.updated', 'policy.package_updated', 'policy.rule_updated', 'policy.template_created', 'policy.template_updated', 'policy.template_deleted', 'timetable.changed', 'import.decided',
    'intervention.added', 'intervention.decided', 'notification.sent', 'grading.result_submitted', 'grading.application_decided', 'grading.promotion_decided', 'audit.exported'];
  const missing = PLAN.filter(a => !covered.has(a));
  check(`coverage: every action in plan2.md section 6 was exercised (${PLAN.length})`, !missing.length, missing.join());
  const rows = await q(`select id, action, summary, details from audit_log`);
  const BADKEY = /pass|hash|token|secret|jwt|authorization|cookie|card|cvv|otp/i;
  const keyHits = [];
  const walk = (v, path, id) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!Array.isArray(v) && BADKEY.test(k)) keyHits.push(`${id}:${path}${k}`); walk(x, path + k + '.', id); } };
  for (const r of rows) walk(r.details, '', r.id);
  check('secrets: no details key looks like a password/hash/token/card field', !keyHits.length, keyHits.join());
  const hits = findSecrets(rows, [...captured, 'password123', 'Marcus2026pw', 'Auditor2026', 'Typed-Secret-1', 'Typed-Secret-2']);
  check('secrets: no bcrypt hash, JWT, temporary or typed password in any audit row (summary or details)', !hits.length, hits.join());
  const apiHits = findSecrets((await BA.get('/admin/audit?pageSize=100')).text + (await BA.get('/admin/audit/export.csv')).text, captured);
  check('secrets: none in the audit API or CSV output', !apiHits.length, apiHits.join());
  check('server log: no passwords, hashes or tokens', !findSecrets(app.log(), [...captured, 'password123', 'Marcus2026pw', 'Typed-Secret-1']).length);
} catch (e) { check('suite crashed: ' + e.message, false, e.stack); }
await pg.end();
await app.stop();

/* db.sql + seed.sql load twice in a row (re-runnable with the trigger in place) and the grading/timetable check view stays empty */
try {
  await resetDb(); await resetDb();
  const c = await pgConnect();
  const v = (await c.query(`select count(*)::int n from v_grading_conflict`)).rows[0].n;
  const a = (await c.query(`select count(*)::int n from audit_log`)).rows[0].n;
  await c.end();
  check('db.sql + seed.sql loaded twice: no error, v_grading_conflict = 0, seeded audit rows present once', v === 0 && a >= 14 && a < 40, `conflicts ${v}, audit rows ${a}`);
} catch (e) { check('double schema load failed: ' + e.message, false); }
t.done();
