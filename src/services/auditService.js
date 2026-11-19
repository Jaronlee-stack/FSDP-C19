'use strict';
/* Audit trail. record() is called INSIDE the transaction of the action it describes (pass the tx client), so the action and its log row
   commit or roll back together. recordSafe() is for events with no transaction to protect (failed sign-ins): it never throws.
   Details hold ids and changed field names; personal data and secrets are never stored (see sanitize). */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { toCsv } = require('../utils/csv');
const { forbidden } = require('../utils/errors');
const auditModel = require('../models/auditModel');
const requestContext = require('../middleware/requestContext');

/* the groups an action name may start with (action = group.verb) */
const GROUPS = ['auth', 'staff', 'member', 'payment', 'refund', 'exception', 'registration', 'attendance', 'booking', 'closure', 'class', 'policy',
  'timetable', 'inbox', 'grading', 'mc', 'day', 'followup', 'notification', 'equipment', 'import', 'intervention', 'audit', 'telegram'];

/* the actions the system writes (group.verb). FEAT-002 fills in the rest as it instruments the services. */
const ACTIONS = [
  'auth.login', 'auth.login_failed', 'auth.password_changed', 'auth.password_change_failed',
  'staff.created', 'staff.role_changed', 'staff.deactivated', 'staff.reactivated', 'staff.password_reset',
  'registration.submitted', 'registration.activated', 'registration.rejected', 'registration.info_requested', 'registration.checklist_changed',
  'member.updated', 'member.belt_changed', 'member.message_sent',
  'followup.created', 'followup.updated', 'followup.attempt_logged', 'followup.contact_logged',
  'payment.collected', 'payment.voided', 'payment.adjusted', 'payment.mistake_reported', 'refund.requested', 'refund.decided', 'day.locked', 'day.unlocked',
  'equipment.ready', 'equipment.handed_over', 'exception.raised', 'exception.decided', 'inbox.escalated', 'inbox.answered', 'mc.decision',
  'booking.overridden', 'booking.cancelled_by_staff', 'attendance.corrected', 'attendance.submitted',
  'closure.created', 'closure.deleted', 'class.cancelled',
  'policy.updated', 'policy.package_updated', 'policy.rule_updated', 'policy.template_created', 'policy.template_updated', 'policy.template_deleted',
  'timetable.changed', 'import.decided', 'intervention.added', 'intervention.decided', 'notification.sent',
  'grading.result_submitted', 'grading.application_decided', 'grading.promotion_decided',
  'audit.exported', 'telegram.linked', 'telegram.unlinked'
];

const SECRET_KEY = /pass|hash|token|secret|jwt|authorization|cookie|card|cvv|otp/i;
const BCRYPT = /^\$2[aby]\$/;
const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;
const MAX_DEPTH = 3, MAX_ARRAY = 20, MAX_STRING = 300;

/* a copy of `value` that is safe to store: secret-looking keys dropped, hashes and tokens replaced, depth/length capped */
function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (BCRYPT.test(value) || JWT_SHAPE.test(value)) return '[removed]';
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map(v => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!SECRET_KEY.test(k)) out[k] = sanitize(v, depth + 1);
    return out;
  }
  return null;
}

/* actor: the session (req.user) or null for system / anonymous events. db: a tx client, or undefined for the pool. */
async function record(db, actor, { action, entityType = null, entityId = null, summary, details = {} }) {
  const ctx = requestContext.current() || {};
  await auditModel.insert({
    actorId: actor ? actor.id : null, actorName: actor ? actor.name || null : null, actorRole: actor ? actor.role || null : null,
    actorAdminType: actor ? actor.adminType || null : null,
    action, entityType, entityId: entityId === null || entityId === undefined ? null : String(entityId),
    summary: String(summary || action).slice(0, 500), details: sanitize(details) || {},
    ip: ctx.ip ? String(ctx.ip).slice(0, 64) : null, userAgent: ctx.userAgent ? String(ctx.userAgent).slice(0, 255) : null
  }, db);
}

/* same, but a failure is logged without the payload and swallowed */
async function recordSafe(db, actor, event) {
  try { await record(db, actor, event); } catch (e) { console.error('[audit] write failed'); }
}

/* ---------- reading (Business Admin only; also checked here, not only on the route) ---------- */
const assertBA = (user, what) => {
  if (!user || user.adminType !== 'business') throw forbidden(`Only a Business Admin can ${what}.`, 'BUSINESS_ADMIN_ONLY');
};
const EXPORT_MAX = 10000;

const shapeRow = r => ({
  id: r.id, at: r.occurred_at, actor: { id: r.actor_user_id, name: r.actor_name, role: r.actor_role, adminType: r.actor_admin_type },
  action: r.action, group: String(r.action).split('.')[0], entityType: r.entity_type, entityId: r.entity_id, summary: r.summary, details: r.details || {}, ip: r.ip
});
const filtersOf = q => ({ from: q.from, to: q.to, actorId: q.actorId, group: q.group, action: q.action, entityType: q.entityType, entityId: q.entityId, q: q.q });

async function list(user, query = {}) {
  assertBA(user, 'read the audit log');
  const page = query.page || 1, pageSize = query.pageSize || 25;
  const [res, facets] = await Promise.all([
    auditModel.search(filtersOf(query), { limit: pageSize, offset: (page - 1) * pageSize }),
    auditModel.facets()
  ]);
  return { rows: res.rows.map(shapeRow), total: res.total, page, pageSize, pages: Math.max(1, Math.ceil(res.total / pageSize)), facets };
}

async function exportCsv(user, query = {}) {
  assertBA(user, 'export the audit log');
  const today = clock.today();
  const f = filtersOf(query);
  const rows = await auditModel.searchForExport(f, EXPORT_MAX);
  const head = ['Time (SGT)', 'Actor ID', 'Actor', 'Role', 'Action', 'Entity type', 'Entity ID', 'Summary', 'Details'];
  const role = r => (r.actor_role === 'admin' && r.actor_admin_type ? `admin (${r.actor_admin_type})` : r.actor_role || '');
  const csv = toCsv([head].concat(rows.map(r => [
    `${clock.ymd(r.occurred_at)} ${clock.hhmm(r.occurred_at)}`, r.actor_user_id || '', r.actor_name || '', role(r), r.action, r.entity_type || '', r.entity_id || '', r.summary, JSON.stringify(r.details || {})
  ])));
  const used = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));
  await withTx(tx => record(tx, user, { action: 'audit.exported', entityType: 'audit', summary: `Exported ${rows.length} audit log row${rows.length === 1 ? '' : 's'}`, details: { filters: used, count: rows.length } }));
  return { filename: `audit-log-${today}.csv`, csv };
}

module.exports = { record, recordSafe, sanitize, list, exportCsv, ACTIONS, GROUPS };
