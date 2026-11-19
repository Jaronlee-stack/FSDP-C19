'use strict';
/* Policies (Business Admin): prices, booking rules, auto-activation rules, notification templates and follow-up triggers.
   Every change is written at once; a payment already taken keeps the price it was taken at. The key names are the policy_setting keys. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const policyModel = require('../models/policyModel');
const packageModel = require('../models/packageModel');
const applicationModel = require('../models/applicationModel');
const notificationModel = require('../models/notificationModel');
const reportModel = require('../models/reportModel');
const { nextId } = require('../models/ids');
const auditService = require('./auditService');

/* the settings the page may change (the validator checks the type and range; this list is the whitelist the model is allowed to write) */
const EDITABLE = new Set([
  'registration_fee', 'annual_dues', 'discount_senior_age', 'discount_senior_pct', 'discount_student_from_age', 'discount_student_to_age', 'discount_student_pct',
  'booking_ahead_months', 'booking_min_days', 'cancel_hours', 'max_packages', 'follow_decline_days', 'follow_renewal_days', 'compassion_days', 'grading_late_fee'
]);

const pkgShape = p => ({ id: p.id, name: p.name, audience: p.audience, amt: p.price, unit: p.billing_unit, lessons: p.lessons, active: p.is_active });

/* Everything the Policies page shows. `declineDays` (optional) asks how many active members a different trigger would put on the declining list. */
async function overview({ declineDays } = {}) {
  const today = clock.today();
  const [p, defs, rules, templates, upcoming, waiting, members] = await Promise.all([
    policyModel.getAll(), packageModel.listAllDefs(), applicationModel.listRules(), notificationModel.templates(),
    reportModel.upcomingBookings(today), reportModel.waitingApplications(), declineDays ? reportModel.members(today) : Promise.resolve(null)
  ]);
  const days = declineDays || p.follow_decline_days || 14;
  return {
    registration: p.registration_fee, annualDues: p.annual_dues,
    discounts: { senior: { age: p.discount_senior_age, pct: p.discount_senior_pct }, student: { from: p.discount_student_from_age, to: p.discount_student_to_age, pct: p.discount_student_pct } },
    booking: { aheadMonths: p.booking_ahead_months, minDays: p.booking_min_days, cancelHours: p.cancel_hours, maxPackages: p.max_packages },
    followTriggers: { declineDays: p.follow_decline_days, renewalDays: p.follow_renewal_days },
    compassionDays: p.compassion_days, lateFee: p.grading_late_fee,
    packages: defs.map(pkgShape),
    autoActivation: rules.map(r => ({ id: r.id, text: r.label, on: r.enabled })),
    methods: String(p.payment_methods || 'Stripe').split(',').map(s => s.trim()).filter(Boolean),
    templates: templates.map(t => ({ id: t.id, name: t.name, text: t.body })),
    impact: {
      upcomingBookings: upcoming, waitingApplications: waiting,
      declineDays: days, decliningNow: members ? members.filter(m => m.account_status === 'Active' && clock.diffDays(m.last_seen || m.joined_on, today) >= days).length : null
    }
  };
}

/* change one or more settings. Returns the new overview. */
async function update(user, settings) {
  await withTx(async tx => {
    const cur = await policyModel.getAll(tx);
    const next = { ...cur, ...settings };
    if (next.discount_student_from_age > next.discount_student_to_age) throw badRequest('The student discount age range is the wrong way round.', 'VALIDATION_ERROR');
    const changes = {};
    for (const [key, value] of Object.entries(settings)) {
      if (!EDITABLE.has(key)) throw badRequest('That setting cannot be changed here.', 'SETTING_NOT_EDITABLE');
      if (!(await policyModel.setValue(key, value, tx))) throw notFound('That setting does not exist.', 'SETTING_NOT_FOUND');
      changes[key] = { before: cur[key] === undefined ? null : cur[key], after: value };
    }
    await auditService.record(tx, user, { action: 'policy.updated', entityType: 'policy', entityId: Object.keys(changes).length === 1 ? Object.keys(changes)[0] : null,
      summary: `Changed ${Object.keys(changes).join(', ')}`, details: { changes } });
  });
  return overview();
}

async function updatePackage(user, id, body) {
  return withTx(async tx => {
    const before = (await packageModel.listAllDefs(tx)).find(p => p.id === id);
    if (!(await packageModel.updateDef(id, body, tx))) throw notFound('That package does not exist.', 'PACKAGE_NOT_FOUND');
    const out = (await packageModel.listAllDefs(tx)).map(pkgShape).find(p => p.id === id);
    await auditService.record(tx, user, { action: 'policy.package_updated', entityType: 'policy', entityId: id, summary: `Updated package ${out.name}`,
      details: { price: body.price !== undefined ? { before: before ? before.price : null, after: body.price } : undefined, active: body.isActive !== undefined ? { before: before ? before.is_active : null, after: body.isActive } : undefined } });
    return out;
  });
}

async function updateRule(user, id, { enabled }) {
  return withTx(async tx => {
    if (!(await applicationModel.setRuleEnabled(id, enabled, tx))) throw notFound('That rule does not exist.', 'RULE_NOT_FOUND');
    const rule = (await applicationModel.listRules(tx)).find(r => r.id === id);
    await auditService.record(tx, user, { action: 'policy.rule_updated', entityType: 'policy', entityId: id, summary: `${enabled ? 'Turned on' : 'Turned off'} auto-activation rule ${id}`, details: { enabled } });
    return { id: rule.id, text: rule.label, on: rule.enabled };
  });
}

async function createTemplate(user, { name, text }) {
  return withTx(async tx => {
    if (await notificationModel.templateByName(name, tx)) throw conflict('A template with that name already exists.', 'TEMPLATE_NAME_TAKEN');
    const id = await nextId(tx, 'notification_template', 'id', 'T-');
    await notificationModel.insertTemplate({ id, name, body: text }, tx);
    await auditService.record(tx, user, { action: 'policy.template_created', entityType: 'policy', entityId: id, summary: `Created the notification template "${name}"`, details: { name } });
    return { id, name, text };
  });
}
async function updateTemplate(user, id, { name, text }) {
  return withTx(async tx => {
    const cur = await notificationModel.template(id, tx);
    if (!cur) throw notFound('That template does not exist.', 'TEMPLATE_NOT_FOUND');
    if (name !== undefined) { const other = await notificationModel.templateByName(name, tx); if (other && other.id !== id) throw conflict('A template with that name already exists.', 'TEMPLATE_NAME_TAKEN'); }
    await notificationModel.updateTemplate(id, { name, body: text }, tx);
    const t = await notificationModel.template(id, tx);
    await auditService.record(tx, user, { action: 'policy.template_updated', entityType: 'policy', entityId: id, summary: `Updated the notification template "${t.name}"`, details: { fields: [name !== undefined ? 'name' : null, text !== undefined ? 'text' : null].filter(Boolean) } });
    return { id: t.id, name: t.name, text: t.body };
  });
}
async function deleteTemplate(user, id) {
  return withTx(async tx => {
    const cur = await notificationModel.template(id, tx);
    if (!(await notificationModel.deleteTemplate(id, tx))) throw notFound('That template does not exist.', 'TEMPLATE_NOT_FOUND');
    await auditService.record(tx, user, { action: 'policy.template_deleted', entityType: 'policy', entityId: id, summary: `Deleted the notification template "${cur ? cur.name : id}"`, details: {} });
    return { deleted: true };
  });
}
module.exports = { overview, update, updatePackage, updateRule, createTemplate, updateTemplate, deleteTemplate, EDITABLE };
