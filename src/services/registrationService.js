'use strict';
/* Membership registration (public join form) and account activation.
   The fee is worked out here from policy_setting + package_def + the discount rules: the client total is never trusted.
   An application is created with one checklist row per auto_activation_rule. When every ENABLED rule is done the account is created
   at once (auto-activation). Otherwise the front desk finishes it and calls activate(). */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const password = require('../utils/password');
const userModel = require('../models/userModel');
const studentModel = require('../models/studentModel');
const packageModel = require('../models/packageModel');
const paymentModel = require('../models/paymentModel');
const equipmentModel = require('../models/equipmentModel');
const applicationModel = require('../models/applicationModel');
const policyModel = require('../models/policyModel');
const sentLogModel = require('../models/sentLogModel');
const referenceModel = require('../models/referenceModel');
const { nextId } = require('../models/ids');
const packageService = require('./packageService');
const auditService = require('./auditService');

/* dogi prices are fixed by the shop; the client only picks the type */
const DOGI_PRICE = { 'Cotton (Standard)': 30, 'Heavyweight Cotton': 45, 'Competition Grade': 60 };
const KIDS_MAX_AGE = 12;

/* discount percent for this applicant (the best one that applies) */
function discountPct(age, policies) {
  const out = [];
  if (age >= policies.discount_senior_age) out.push(policies.discount_senior_pct);
  if (age >= policies.discount_student_from_age && age <= policies.discount_student_to_age) out.push(policies.discount_student_pct);
  return out.length ? Math.max(...out) : 0;
}

/* the money lines of a registration. The discount applies to the lesson package. */
function quote({ age, def, dogi }, policies) {
  const pct = discountPct(age, policies);
  const pkg = Math.round(def.price * (100 - pct)) / 100;
  const lines = [
    { kind: 'Registration', item: 'Registration', amount: policies.registration_fee },
    { kind: 'Annual dues', item: `Annual dues ${clock.today().slice(0, 4)}`, amount: policies.annual_dues },
    { kind: 'Dogi', item: `Dogi · ${dogi.type}`, amount: DOGI_PRICE[dogi.type] },
    { kind: 'Package', item: def.lessons === null ? 'Unlimited · 2 weeks' : def.name, amount: pkg }
  ];
  return { lines, total: Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100, discountPct: pct };
}

/* one done/not done value per rule, from what the applicant submitted */
function evaluate(a) {
  return {
    details: !!(a.fullName && a.dojoId && a.phone && a.email && a.emergencyContact && a.gender && a.age),
    consent: !!(a.signer && a.signatureProvided),
    paid: a.amountPaid >= a.total,
    medical: a.medicalAnswered === true,
    guardian: a.group === 'Child' ? !!(a.signer && a.signer.trim().toLowerCase() !== a.fullName.trim().toLowerCase()) : true
  };
}

async function freeMemberNo(tx) {
  const year = clock.today().slice(0, 4);
  for (let i = 0; i < 30; i++) {
    const no = `ASK-${year}-${String(1000 + Math.floor(Math.random() * 9000))}`;
    if (!(await studentModel.memberNoTaken(no, tx))) return no;
  }
  throw conflict('Could not allocate a member number. Please try again.', 'MEMBER_NO_BUSY');
}

/* Creates the account and everything bought at registration. `tx` is an open transaction.
   The member signs in with the password chosen at registration (app.passwordHash, a bcrypt hash). Only an application with no stored hash
   (older data) falls back to a temporary password: it is returned once as tempPassword (to staff) and the member must change it at first sign-in.
   Returns { userId, memberNo, tempPassword? }. `actor` is the staff session for the audit row (null for automatic activation). */
async function activate(tx, app, quoteLines, { reviewerId = null, note = 'All checks passed.', actor = null } = {}) {
  const today = clock.today(), now = clock.now();
  const userId = await nextId(tx, 'users', 'id', 'S-', 3);
  const memberNo = await freeMemberNo(tx);
  const fallback = !app.passwordHash;
  const temp = fallback ? password.randomPassword() : null;
  await userModel.insertUser({
    id: userId, role: 'student', email: app.email, passwordHash: fallback ? await password.hash(temp) : app.passwordHash, createdAt: now, mustChangePassword: fallback
  }, tx);
  const child = app.group === 'Child';
  const dob = app.dob || clock.addMonths(today, -12 * app.age - 6);
  await studentModel.insertStudent({
    userId, memberNo, fullName: app.fullName, dob, joinedOn: today, gender: app.gender, ageGroup: app.group, contactNo: app.phone, dojoId: app.dojoId, rankId: app.rankId || '6k',
    guardianName: child ? app.signer.replace(/\s*\(parent\/guardian\)\s*$/i, '') : null, guardianContact: child ? app.phone : null,
    emergencyContact: app.emergencyContact, medicalNotes: app.medical || null
  }, tx);
  await studentModel.insertMembership(userId, clock.addMonths(today, 12), 'Active', today, tx);
  const def = await packageModel.getDef(app.packageId, tx);
  let packId = null;
  if (def) {
    packId = await nextId(tx, 'student_package', 'id', 'SP-', 3);
    await packageModel.insert({ id: packId, userId, packageId: def.id, lessonsTotal: def.lessons, purchasedAt: today, expiresAt: packageService.expiryFor(def, today) }, tx);
  }
  for (const l of quoteLines) {
    const id = await nextId(tx, 'payment', 'id', 'L-', 4);
    const invoiceNo = await nextId(tx, 'payment', 'invoice_no', 'INV-', 7);
    await paymentModel.insertPaid({ id, invoiceNo, userId, item: l.item, kind: l.kind, amount: l.amount, method: 'Stripe', channel: 'online', packageId: l.kind === 'Package' ? packId : null, at: now }, tx);
  }
  if (app.dogiType) {
    const eid = await nextId(tx, 'equipment_order', 'id', 'E-', 2);
    await equipmentModel.insert({ id: eid, userId, item: 'Dogi', size: app.dogiSize || null, paid: true, at: now }, tx);
  }
  await applicationModel.markApproved(app.id, userId, now, note, tx);
  const logId = await nextId(tx, 'sent_log', 'id', 'SL-', 2);
  await sentLogModel.insert({ id: logId, at: now, sentBy: reviewerId, audience: app.email, title: 'Welcome to Shinju-Kai' }, tx);
  await auditService.record(tx, actor, {
    action: 'registration.activated', entityType: 'registration_application', entityId: app.id,
    summary: `Activated membership ${memberNo} from application ${app.id}`, details: { applicationId: app.id, memberNo, userId, automatic: !actor, issuedTemporary: fallback }
  });
  return fallback ? { userId, memberNo, tempPassword: temp } : { userId, memberNo };
}

/* POST /public/registrations */
async function register(input, { reviewerId = null, hold = false, actor = null } = {}) {
  const passwordHash = await password.hash(input.password);   // hashed before the transaction; the plain password is never stored or returned
  return withTx(async tx => {
    const today = clock.today(), now = clock.now();
    const policies = await policyModel.getAll(tx);
    const dojos = await referenceModel.listDojos(tx);
    const dojo = dojos.find(d => d.id === input.dojoId);
    if (!dojo || dojo.status !== 'Open') throw badRequest('Choose one of our open dojos.', 'INVALID_DOJO');
    const group = input.age <= KIDS_MAX_AGE ? 'Child' : 'Adult';
    const def = await packageModel.getDef(input.packageId, tx);
    if (!def || !def.is_active || def.audience !== (group === 'Child' ? 'kids' : 'adult')) throw badRequest('That package is not available for this applicant.', 'INVALID_PACKAGE');
    if (await userModel.findByEmail(input.email, tx)) throw conflict('An account with this email already exists. Sign in or use a different email.', 'EMAIL_IN_USE');
    const q = quote({ age: input.age, def, dogi: { type: input.dogi.type } }, policies);
    const id = await nextId(tx, 'registration_application', 'id', 'APP-', 2);
    const app = {
      id, fullName: input.name, dojoId: input.dojoId, group, age: input.age, gender: input.gender, nationality: input.nationality || null, phone: input.phone, email: input.email,
      emergencyContact: input.emergencyContact, priorExperience: input.priorExperience || null, previousMember: !!input.previousMember, medical: input.medical || null,
      medicalAnswered: true, dogiChoice: `${input.dogi.type}, size ${input.dogi.size}`, dogiType: input.dogi.type, dogiSize: input.dogi.size, packageId: def.id,
      signer: input.signer, signatureProvided: input.signatureProvided, dob: input.dob || null, total: q.total, amountPaid: q.total, at: now, passwordHash
    };
    await applicationModel.insert(app, tx);
    await auditService.record(tx, actor, {
      action: 'registration.submitted', entityType: 'registration_application', entityId: id,
      summary: actor ? `Registered a new member at the desk (application ${id})` : `Online registration submitted (application ${id})`,
      details: { applicationId: id, dojoId: input.dojoId, packageId: def.id, atDesk: !!actor }
    });
    const rules = await applicationModel.listRules(tx);
    const done = evaluate(app);
    const rows = rules.filter(r => r.id !== 'guardian' || group === 'Child');
    for (const r of rows) await applicationModel.insertChecklist(id, r.id, !!done[r.id], tx);
    const passes = !hold && rows.filter(r => r.enabled).every(r => done[r.id]);   // hold: a Business Admin has to look first (carried-over grade)
    let memberNo = null;
    if (passes) {
      const out = await activate(tx, app, q.lines, { reviewerId, note: reviewerId ? 'Registered at the desk.' : 'All checks passed.', actor });
      memberNo = out.memberNo;
    }
    return { applicationId: id, memberNo, status: passes ? 'Approved' : 'Submitted', activated: passes, total: q.total, joinedOn: today, lines: q.lines };
  });
}

/* Activate a waiting application (front desk, FEAT-004). Re-checks every enabled rule. */
async function activateApplication(tx, applicationId, reviewerId, { rankId = null, actor = null } = {}) {
  const row = await applicationModel.getForActivation(applicationId, tx);
  if (!row) throw notFound('Application not found.', 'APPLICATION_NOT_FOUND');
  if (row.status === 'Approved') throw conflict('This application is already activated.', 'ALREADY_ACTIVATED');
  if (row.status === 'Rejected') throw conflict('This application was rejected.', 'APPLICATION_REJECTED');
  const rules = await applicationModel.listChecklist(applicationId, tx);
  if (!rules.every(x => !x.enabled || x.done)) throw conflict('Not every check is done yet.', 'RULES_NOT_MET');
  const policies = await policyModel.getAll(tx);
  const def = await packageModel.getDef(row.package_id, tx);
  const dogiType = (row.dogi_choice || '').split(', size ')[0], dogiSize = (row.dogi_choice || '').split(', size ')[1] || null;
  const app = {
    id: row.id, fullName: row.full_name, dojoId: row.dojo_id, group: row.applicant_group, age: row.age, gender: row.gender, phone: row.phone, email: row.email,
    emergencyContact: row.emergency_contact, medical: row.medical_declaration, dogiType: DOGI_PRICE[dogiType] !== undefined ? dogiType : null, dogiSize, packageId: row.package_id,
    signer: row.signer, dob: null, rankId, passwordHash: row.password_hash || null
  };
  if (await userModel.findByEmail(app.email, tx)) throw conflict('An account with this email already exists.', 'EMAIL_IN_USE');
  const lines = def && app.dogiType ? quote({ age: row.age, def, dogi: { type: app.dogiType } }, policies).lines : [];
  return activate(tx, app, lines, { reviewerId, note: 'Activated by staff.', actor });
}

module.exports = { register, activate, activateApplication, quote, evaluate, discountPct, DOGI_PRICE };
