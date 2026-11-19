'use strict';
/* Registrations at the desk: the waiting list with its checklist, activation (every enabled rule must pass), rejecting, asking for more information,
   and registering a student at the desk. The member signs in with the password chosen at registration. Only an older application with no stored
   password gets a temporary one, returned once to the staff member. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden, badRequest } = require('../utils/errors');
const applicationModel = require('../models/applicationModel');
const exceptionModel = require('../models/exceptionModel');
const memberModel = require('../models/memberModel');
const registrationService = require('./registrationService');
const mcService = require('./mcService');
const exceptionService = require('./exceptionService');
const auditService = require('./auditService');

const isBA = user => user.adminType === 'business';
const CARRY = /(\d+\s*(?:st|nd|rd|th)?\s+(?:Kyu|Dan))/i;

/* things only a Business Admin may settle */
function reviewsOf(a, flagged) {
  const r = [];
  if (a.previous_member) r.push('Returning member: check the 2-year rule');
  if (/aikido/i.test(a.prior_experience || '')) r.push('Grade carry-over');
  if (flagged) r.push('Flagged for review');
  return r;
}
const carryOf = a => { const m = /aikido/i.test(a.prior_experience || '') ? CARRY.exec(a.prior_experience || '') : null; return m ? m[1].replace(/\s+/g, ' ') : null; };
const shape = (a, checks, flagged) => {
  const dogi = (a.dogi_choice || '').split(', size ');
  return {
    id: a.id, name: a.full_name, dojoId: a.dojo_id, dojoName: a.dojo_name, group: a.applicant_group, age: a.age, gender: a.gender, nationality: a.nationality, phone: a.phone,
    email: a.email, emergencyContact: a.emergency_contact, experience: a.prior_experience, previousMember: !!a.previous_member, medical: a.medical_declaration,
    dogi: a.dogi_choice, dogiType: dogi[0] || null, dogiSize: dogi[1] || null, packageId: a.package_id, packageName: a.package_name, paid: a.amount_paid, signer: a.signer,
    submittedAt: a.submitted_at, status: a.status, note: a.review_note,
    checklist: checks.map(c => ({ id: c.rule_id, label: c.label, done: c.done, enabled: c.enabled })),
    reviews: reviewsOf(a, flagged), flagged, carryGrade: carryOf(a), infoRequested: a.status === 'Needs info' ? { at: a.reviewed_at, text: a.review_note } : null
  };
};
async function flaggedNames(db) {
  const x = await exceptionModel.list(db);
  return new Set(x.filter(e => e.status === 'pending' && e.kind === 'registration').map(e => String(e.subject_name).toLowerCase()));
}

async function list(user) {
  const [rows, mc, flagged] = await Promise.all([applicationModel.listOpen(), mcService.list(), flaggedNames()]);
  const checks = rows.length ? await applicationModel.checklistFor(rows.map(r => r.id)) : [];
  const out = { apps: rows.map(a => shape(a, checks.filter(c => c.application_id === a.id), flagged.has(a.full_name.toLowerCase()))), mcRequests: mc };
  if (isBA(user)) out.exceptions = await exceptionService.list();
  return out;
}
async function detail(id) {
  const a = await applicationModel.getDetail(id);
  if (!a) throw notFound('That registration was not found.', 'APPLICATION_NOT_FOUND');
  const [checks, flagged] = await Promise.all([applicationModel.checklistFor([id]), flaggedNames()]);
  return { app: shape(a, checks, flagged.has(a.full_name.toLowerCase())) };
}
async function setChecklist(user, id, { ruleId, done }) {
  return withTx(async tx => {
    const a = await applicationModel.getForActivation(id, tx);
    if (!a) throw notFound('That registration was not found.', 'APPLICATION_NOT_FOUND');
    if (a.status === 'Approved' || a.status === 'Rejected') throw conflict('This registration is closed.', 'APPLICATION_CLOSED');
    if (!(await applicationModel.setChecklist(id, ruleId, done, tx))) throw notFound('That check does not apply to this registration.', 'RULE_NOT_FOUND');
    await auditService.record(tx, user, { action: 'registration.checklist_changed', entityType: 'registration_application', entityId: id, summary: `Marked check "${ruleId}" ${done ? 'done' : 'not done'} on ${id}`, details: { ruleId, done } });
    const checks = await applicationModel.checklistFor([id], tx);
    return { checklist: checks.map(c => ({ id: c.rule_id, label: c.label, done: c.done, enabled: c.enabled })) };
  });
}
/* the rules must all pass (the service re-checks them) and anything that needs a Business Admin waits for one */
async function activate(user, id, { rankId }) {
  return withTx(async tx => {
    const a = await applicationModel.getForActivation(id, tx);
    if (!a) throw notFound('That registration was not found.', 'APPLICATION_NOT_FOUND');
    if (rankId && !isBA(user)) throw forbidden('Only a Business Admin can set a starting grade.', 'BUSINESS_ADMIN_ONLY');
    if (rankId && !(await memberModel.rankExists(rankId, tx))) throw badRequest('That grade does not exist.', 'INVALID_RANK');
    const flagged = (await flaggedNames(tx)).has(a.full_name.toLowerCase());
    if (!isBA(user) && reviewsOf(a, flagged).length) throw conflict('A Business Admin has to review this registration first.', 'NEEDS_BUSINESS_ADMIN');
    const out = await registrationService.activateApplication(tx, id, user.id, { rankId, actor: user });   // audited inside activate()
    /* tempPassword only exists for an older application that has no password of its own; the member must change it at first sign-in */
    return out.tempPassword ? { memberNo: out.memberNo, tempPassword: out.tempPassword } : { memberNo: out.memberNo };
  });
}
async function reject(user, id, { note }) {
  return withTx(async tx => {
    const a = await applicationModel.getForActivation(id, tx);
    if (!a) throw notFound('That registration was not found.', 'APPLICATION_NOT_FOUND');
    if (a.status === 'Approved' || a.status === 'Rejected') throw conflict('This registration is closed.', 'APPLICATION_CLOSED');
    await applicationModel.markStatus(id, 'Rejected', user.id, clock.now(), note, tx);
    await auditService.record(tx, user, { action: 'registration.rejected', entityType: 'registration_application', entityId: id, summary: `Rejected application ${id}`, details: { applicationId: id, noteLength: note.length } });
    return { status: 'Rejected' };
  });
}
async function requestInfo(user, id, { text }) {
  return withTx(async tx => {
    const a = await applicationModel.getForActivation(id, tx);
    if (!a) throw notFound('That registration was not found.', 'APPLICATION_NOT_FOUND');
    if (a.status === 'Approved' || a.status === 'Rejected') throw conflict('This registration is closed.', 'APPLICATION_CLOSED');
    await applicationModel.markStatus(id, 'Needs info', user.id, clock.now(), text, tx);
    await auditService.record(tx, user, { action: 'registration.info_requested', entityType: 'registration_application', entityId: id, summary: `Asked for more information on application ${id}`, details: { applicationId: id, textLength: text.length } });
    return { status: 'Needs info' };
  });
}
/* a student registered at the desk. A carried-over grade always waits for a Business Admin. */
async function registerAtDesk(user, input) {
  const { carryGrade, ...rest } = input;
  const hold = !!carryGrade;
  const payload = { ...rest, priorExperience: carryGrade ? `Aikido, ${carryGrade}` : rest.priorExperience };
  const out = await registrationService.register(payload, { reviewerId: user.id, hold, actor: user });
  return out;
}
module.exports = { list, detail, setChecklist, activate, reject, requestInfo, registerAtDesk, shape };
