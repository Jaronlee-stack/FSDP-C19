// Ad-hoc FEAT-002 smoke (not part of the harness). Needs db.mjs running.
import { spawnApp, client, login, suite, pgConnect, resetDb } from '../verify/lib.mjs';

const t = suite('feat-002');
await resetDb();
const pg = await pgConnect();
const app = await spawnApp();
const base = app.base;
const rowsOf = async (action) => (await pg.query(`SELECT * FROM audit_log WHERE action = $1 ORDER BY id DESC`, [action])).rows;
const total = async () => (await pg.query(`SELECT count(*)::int n FROM audit_log`)).rows[0].n;
async function audited(label, action, fn, expectCount = 1) {
  const b = await total();
  const r = await fn();
  const n = (await total()) - b;
  const ok = r.status < 300 && n === expectCount;
  t.check(`${label}: ${r.status}, ${n} audit row(s) (${action})`, ok, ok ? '' : (r.text || '').slice(0, 200));
  if (ok) { const last = (await rowsOf(action))[0]; t.check(`  ${action} row has the action`, !!last, ''); return last; }
}
try {
  const BA = await login(base, 'admin', 'ADM-001');
  const FD = await login(base, 'admin', 'ADM-101');
  const INS = await login(base, 'instructor', 'INS-0042');
  const ST = await login(base, 'student', 'ASK-2025-1834');
  const anon = client(base);

  // ---- access
  t.expect('anonymous GET /admin/audit -> 401', await anon.get('/admin/audit'), 401);
  t.expect('front desk GET /admin/audit -> 403', await FD.get('/admin/audit'), 403, 'BUSINESS_ADMIN_ONLY');
  t.expect('student GET /admin/audit -> 403', await ST.get('/admin/audit'), 403);
  t.expect('instructor GET /admin/audit -> 403', await INS.get('/admin/audit'), 403);
  t.expect('front desk export -> 403', await FD.get('/admin/audit/export.csv'), 403);
  t.expect('anonymous export -> 401', await anon.get('/admin/audit/export.csv'), 401);

  // ---- list shape + filters
  const l = await BA.get('/admin/audit');
  t.check('BA list shape', l.status === 200 && Array.isArray(l.json.rows) && l.json.page === 1 && l.json.pageSize === 25 && l.json.pages >= 1 && l.json.facets && Array.isArray(l.json.facets.actors) && l.json.total >= 14, l.text.slice(0, 200));
  const r0 = l.json.rows[0];
  t.check('row mapped { id, at, actor{...}, action, group, entityType, entityId, summary, details, ip }', r0 && r0.actor && 'adminType' in r0.actor && r0.group === r0.action.split('.')[0] && 'details' in r0, JSON.stringify(r0));
  const p2 = await BA.get('/admin/audit?pageSize=5&page=2');
  t.check('pagination', p2.json.rows.length === 5 && p2.json.page === 2 && p2.json.pageSize === 5, p2.text.slice(0, 120));
  const fa = await BA.get('/admin/audit?group=staff');
  t.check('group filter', fa.json.rows.length > 0 && fa.json.rows.every(r => r.group === 'staff'));
  const fb = await BA.get('/admin/audit?action=auth.login');
  t.check('action filter', fb.json.rows.every(r => r.action === 'auth.login'));
  const fc = await BA.get('/admin/audit?actorId=ADM-101');
  t.check('actorId filter', fc.json.rows.length > 0 && fc.json.rows.every(r => r.actor.id === 'ADM-101'));
  const fd = await BA.get('/admin/audit?from=2026-09-20&to=2026-09-20');
  t.check('from/to filter (single day)', fd.status === 200 && fd.json.rows.every(r => r.at.slice(0, 10) >= '2026-09-19' && r.at.slice(0, 10) <= '2026-09-21'));
  const fe = await BA.get('/admin/audit?q=' + encodeURIComponent('100%_'));
  t.check('q with % and _ is escaped (no match, 200)', fe.status === 200 && fe.json.total === 0);
  const ff = await BA.get('/admin/audit?entityType=staff&entityId=nope');
  t.check('entityType+entityId filter', ff.status === 200 && ff.json.total === 0);
  t.expect('from after to -> 400', await BA.get('/admin/audit?from=2026-10-01&to=2026-09-01'), 400, 'VALIDATION_ERROR');
  t.expect('bad group -> 400', await BA.get('/admin/audit?group=nope'), 400, 'VALIDATION_ERROR');
  t.expect('bad action -> 400', await BA.get('/admin/audit?action=NOPE'), 400, 'VALIDATION_ERROR');
  t.expect('bad pageSize -> 400', await BA.get('/admin/audit?pageSize=101'), 400, 'VALIDATION_ERROR');
  t.expect('bad page -> 400', await BA.get('/admin/audit?page=0'), 400, 'VALIDATION_ERROR');
  t.expect('unknown param -> 400', await BA.get('/admin/audit?foo=1'), 400, 'VALIDATION_ERROR');
  t.expect('SQL-ish q is only data', await BA.get("/admin/audit?q=" + encodeURIComponent("'; DROP TABLE audit_log;--")), 200);

  // ---- instrumented actions
  await audited('member patch (contact)', 'member.updated', () => FD.patch('/admin/members/ASK-2025-1834', { phone: '9123 4567' }));
  const rk = (await pg.query(`SELECT id FROM belt_rank ORDER BY id LIMIT 1`)).rows[0].id;
  await audited('member patch (rank)', 'member.belt_changed', () => BA.patch('/admin/members/ASK-2025-1834', { rankId: rk, reason: 'smoke' }));
  await audited('member message', 'member.message_sent', () => FD.post('/admin/members/ASK-2025-1834/messages', { body: 'See you Friday' }));
  await audited('contact attempt', 'followup.contact_logged', () => FD.post('/admin/members/ASK-2025-1834/contact-attempts', { method: 'Call', outcome: 'No answer' }));
  await audited('followup create', 'followup.created', () => BA.post('/admin/followups', { memberNo: 'ASK-2025-1834', kind: 'renewal', ownerId: 'ADM-101', dueDate: '2026-11-10' }));
  const fu = (await rowsOf('followup.created'))[0];
  await audited('followup update', 'followup.updated', () => BA.patch(`/admin/followups/${fu.entity_id}`, { status: 'done' }));
  await audited('followup attempt', 'followup.attempt_logged', () => FD.post(`/admin/followups/${fu.entity_id}/attempts`, { method: 'Email', outcome: 'Sent' }));
  const pay = await audited('take payment', 'payment.collected', () => FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'dogi:Cotton (Standard)', method: 'Stripe' }));
  await audited('void payment', 'payment.voided', () => BA.post(`/admin/payments/${pay.entity_id}/void`, { reason: 'Test void' }));
  await audited('payment mistake', 'payment.mistake_reported', () => FD.post(`/admin/payments/${pay.entity_id}/mistake`, { reason: 'Wrong amount' }));
  const pay2 = await audited('take payment 2', 'payment.collected', () => FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'dogi:Cotton (Standard)', method: 'PayNow' }));
  await audited('adjust payment', 'payment.adjusted', () => BA.post(`/admin/payments/${pay2.entity_id}/void`, { reason: 'Discount', adjustTo: 10 }));
  const pay3 = await audited('take payment 3', 'payment.collected', () => FD.post('/admin/payments', { memberNo: 'ASK-2025-1834', item: 'dogi:Cotton (Standard)', method: 'PayNow' }));
  const rq = await audited('refund request', 'refund.requested', () => FD.post('/admin/refunds', { paymentId: pay3.entity_id, reason: 'Wrong size' }));
  await audited('refund decision', 'refund.decided', () => BA.post(`/admin/refunds/${rq.entity_id}/decision`, { decision: 'approved' }));
  await audited('lock day', 'day.locked', () => FD.post('/admin/payments/day/lock', {}));
  const day = (await rowsOf('day.locked'))[0].entity_id;
  await audited('unlock day', 'day.unlocked', () => BA.del(`/admin/payments/day/lock/${day}`, {}));
  const eq = (await pg.query(`SELECT id, status FROM equipment_order ORDER BY id`)).rows;
  const req = eq.find(e => e.status === 'Requested');
  if (req) await audited('equipment ready', 'equipment.ready', () => FD.post(`/admin/equipment/${req.id}/ready`, {}));
  await audited('exception raise', 'exception.raised', () => FD.post('/admin/exceptions', { kind: 'access', memberNo: 'ASK-2025-1834', detail: 'Needs access' }));
  const ex = (await rowsOf('exception.raised'))[0];
  await audited('exception decide', 'exception.decided', () => BA.post(`/admin/exceptions/${ex.entity_id}/decision`, { decision: 'declined', reason: 'No' }));
  await audited('policy update', 'policy.updated', () => BA.patch('/admin/policies', { annual_dues: 51, cancel_hours: 5 }));
  await audited('policy package', 'policy.package_updated', () => BA.patch('/admin/policies/packages/a10', { price: 280 }));
  await audited('policy rule', 'policy.rule_updated', () => BA.patch('/admin/policies/auto-activation/paid', { enabled: false }));
  const tp = await BA.post('/admin/policies/templates', { name: 'Smoke tpl', text: 'Hi' });
  t.check('template created', tp.status === 201 && (await rowsOf('policy.template_created')).length === 1);
  await audited('template update', 'policy.template_updated', () => BA.patch(`/admin/policies/templates/${tp.json.id}`, { text: 'Hi again' }));
  await audited('template delete', 'policy.template_deleted', () => BA.del(`/admin/policies/templates/${tp.json.id}`, {}));
  await audited('intervention add', 'intervention.added', () => BA.post('/admin/insights/interventions', { name: 'Smoke', slot: 'Sat 10', before: 5, after: 9, decision: 'continue' }));
  const iv = (await rowsOf('intervention.added'))[0];
  await audited('intervention decide', 'intervention.decided', () => BA.patch(`/admin/insights/interventions/${iv.entity_id}`, { decision: 'stop' }));
  const tt = await audited('timetable create', 'timetable.changed', () => BA.post('/admin/timetable', { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 10 }));
  await audited('timetable update', 'timetable.changed', () => BA.patch(`/admin/timetable/${tt.entity_id}`, { dojoId: 'hq', weekday: 2, start: '16:00', mat: 'Mat B', type: 'Adults', instructorId: 'INS-0063', capacity: 12 }));
  await audited('timetable delete', 'timetable.changed', () => BA.del(`/admin/timetable/${tt.entity_id}`, {}));
  const cl = await audited('closure create', 'closure.created', () => BA.post('/admin/closures', { dojoId: 'hq', from: '2026-12-01', note: 'Smoke' }));
  await audited('closure delete', 'closure.deleted', () => BA.del(`/admin/closures/${cl.entity_id}`, {}));
  const les = (await pg.query(`SELECT lesson_id FROM class_session WHERE status = 'Scheduled' AND session_date > '2026-11-07' ORDER BY session_date LIMIT 1`)).rows[0];
  await audited('class cancel', 'class.cancelled', () => BA.post(`/admin/classes/${les.lesson_id}/cancel`, { note: 'Unwell' }));
  const imp = (await pg.query(`SELECT id FROM import_issue WHERE status = 'open' ORDER BY id LIMIT 1`)).rows[0];
  if (imp) await audited('import decide', 'import.decided', () => BA.patch(`/admin/imports/${imp.id}`, { status: 'dismissed' }));
  await audited('notification send', 'notification.sent', () => BA.post('/admin/notifications/send', { title: 'Smoke note', audience: { type: 'student', target: 'ASK-2025-1834' } }));

  // ---- a failed action leaves no row
  const b = await total();
  const bad = await BA.post('/admin/policies/templates', { name: 'Smoke tpl', text: 'x' }).then(async () => BA.post('/admin/policies/templates', { name: 'smoke TPL', text: 'x' }));
  t.check('duplicate template -> 409 and no extra row beyond the first create', bad.status === 409 && (await total()) === b + 1);
  const b2 = await total();
  t.expect('void a missing payment -> 404', await BA.post('/admin/payments/L-9999/void', { reason: 'x' }), 404);
  t.check('failed action wrote no audit row', (await total()) === b2);
  const b3 = await total();
  t.expect('front desk policy edit -> 403', await FD.patch('/admin/policies', { annual_dues: 60 }), 403);
  t.check('forbidden action wrote no audit row', (await total()) === b3);

  // ---- export
  const ex1 = await BA.get('/admin/audit/export.csv?group=policy');
  t.check('export: text/csv + attachment', ex1.status === 200 && /text\/csv/.test(ex1.headers.get('content-type')) && /attachment; filename="audit-log-2026-11-06\.csv"/.test(ex1.headers.get('content-disposition')) && /no-store/.test(ex1.headers.get('cache-control')), JSON.stringify([...ex1.headers]));
  t.check('export: header row', /^"Time \(SGT\)","Actor ID","Actor","Role","Action","Entity type","Entity ID","Summary","Details"/.test(ex1.text));
  const exported = (await rowsOf('audit.exported'))[0];
  t.check('audit.exported logged with count', !!exported && exported.details.count > 0 && exported.entity_type === 'audit', JSON.stringify(exported && exported.details));
  // formula-safe: a summary beginning with = must be neutralised
  await pg.query(`INSERT INTO audit_log (actor_user_id, actor_name, actor_role, action, summary) VALUES (NULL, '=cmd', 'admin', 'auth.login', '=1+1')`);
  const ex2 = await BA.get('/admin/audit/export.csv?q=' + encodeURIComponent('1+1'));
  t.check("export: formula-leading cells are prefixed with '", /"'=1\+1"/.test(ex2.text) && /"'=cmd"/.test(ex2.text), ex2.text.slice(0, 400));

  // ---- no secrets
  const all = (await pg.query(`SELECT summary, details::text d, action FROM audit_log`)).rows;
  t.check('no bcrypt hash / JWT / temp password in any audit row', !all.some(r => /\$2[aby]\$|eyJ[\w-]+\.[\w-]+\.|tempPassword/i.test(r.summary + r.d)));
  const apiText = JSON.stringify((await BA.get('/admin/audit?pageSize=100')).json);
  t.check('no secrets in the API response', !/\$2[aby]\$|eyJ[\w-]+\.[\w-]+\./.test(apiText));
} finally {
  await pg.end().catch(() => {});
  await app.stop();
}
t.done();
