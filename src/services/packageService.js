'use strict';
/* Lesson packages: what a student holds, buying one, and extension requests (MC / Compassion Guaranteed).
   The price always comes from package_def, never from the request. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden, badRequest } = require('../utils/errors');
const studentModel = require('../models/studentModel');
const packageModel = require('../models/packageModel');
const paymentModel = require('../models/paymentModel');
const mcModel = require('../models/mcModel');
const policyModel = require('../models/policyModel');
const referenceService = require('./referenceService');
const referenceModel = require('../models/referenceModel');
const { nextId } = require('../models/ids');

const expiryFor = (def, from) => (def.valid_months ? clock.addMonths(from, def.valid_months) : clock.addDays(from, def.valid_days));

/* a bought pack in the shape the pages use */
const packShape = p => ({ id: p.id, name: p.name, total: p.lessons_total, left: p.lessons_left, bought: p.purchased_at, expires: p.expires_at, status: p.status });

/* lesson packs + the Unlimited plan out of a list of Active packs */
function splitActive(packs) {
  const lessons = packs.filter(p => !p.unlimited).map(packShape);
  const u = packs.find(p => p.unlimited);
  return { passes: lessons, unlimited: u ? { id: u.id, name: u.name, since: u.purchased_at, until: u.expires_at } : null };
}

const mcShape = r => ({
  id: r.id, passId: r.student_package_id, passName: r.package_name, kind: r.kind === 'MC' ? 'mc' : 'compassion', days: r.days_requested,
  date: r.requested_at, status: r.status === 'declined' ? 'rejected' : r.status, file: r.document_ref, newExp: r.status === 'approved' ? r.expires_at : null
});

async function overview(user) {
  return withTx(async tx => {
    const today = clock.today();
    await packageModel.sweep(user.id, today, tx);
    const profile = await studentModel.getProfile(user.id, tx);
    const [active, mc, policies, defs] = await Promise.all([
      packageModel.listActive(user.id, tx), mcModel.listForUser(user.id, tx), policyModel.getAll(tx), referenceModel.listActivePackages(tx)
    ]);
    const audience = profile.age_group === 'Child' ? 'kids' : 'adult';
    return {
      defs: defs.filter(d => d.audience === audience).map(referenceService.packageShape),
      ...splitActive(active), maxPackages: policies.max_packages, mcRequests: mc.map(mcShape)
    };
  });
}

async function buy(user, { packageId, method }) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    const today = clock.today(), now = clock.now();
    const profile = await studentModel.getProfile(user.id, tx);
    const def = await packageModel.getDef(packageId, tx);
    if (!def || !def.is_active) throw notFound('That package does not exist.', 'PACKAGE_NOT_FOUND');
    const audience = profile.age_group === 'Child' ? 'kids' : 'adult';
    if (def.audience !== audience) throw forbidden(`That package is for ${def.audience === 'kids' ? 'children' : 'adults'}.`, 'NOT_ELIGIBLE');
    await packageModel.sweep(user.id, today, tx);
    const active = await packageModel.listActive(user.id, tx);
    const policies = await policyModel.getAll(tx);
    if (def.lessons === null && active.some(p => p.unlimited)) throw conflict('Your Unlimited plan is already active.', 'ALREADY_ACTIVE');
    if (active.length >= policies.max_packages) throw conflict(`You already hold ${policies.max_packages} packages. Buy another once one runs out or expires.`, 'PACKAGE_LIMIT');
    const packId = await nextId(tx, 'student_package', 'id', 'SP-', 3);
    await packageModel.insert({ id: packId, userId: user.id, packageId: def.id, lessonsTotal: def.lessons, purchasedAt: today, expiresAt: expiryFor(def, today) }, tx);
    const payId = await nextId(tx, 'payment', 'id', 'L-', 4);
    const invoiceNo = await nextId(tx, 'payment', 'invoice_no', 'INV-', 7);
    await paymentModel.insertPaid({ id: payId, invoiceNo, userId: user.id, item: def.lessons === null ? 'Unlimited · 2 weeks' : def.name, kind: 'Package', amount: def.price, method, packageId: packId, at: now }, tx);
    const created = await packageModel.getOwn(packId, user.id, tx);
    const payment = await paymentModel.getOwn(payId, user.id, tx);
    return { package: packShape(created), unlimited: created.unlimited, payment: { id: payment.id, invoiceNo: payment.invoice_no, item: payment.item, amount: payment.amount, method: payment.method, status: payment.status, date: payment.paid_at } };
  });
}

async function requestExtension(user, packId, { kind, days, documentRef }) {
  return withTx(async tx => {
    await studentModel.lock(user.id, tx);
    const today = clock.today();
    await packageModel.sweep(user.id, today, tx);
    const pack = await packageModel.getOwn(packId, user.id, tx, true);
    if (!pack) throw notFound('That package is not yours.', 'PACKAGE_NOT_FOUND');
    if (pack.status !== 'Active') throw conflict('Only an active package can be extended.', 'PACKAGE_NOT_ACTIVE');
    if (pack.unlimited) throw conflict('Unlimited plans renew every 2 weeks and do not need extending.', 'NOT_EXTENDABLE');
    const policies = await policyModel.getAll(tx);
    if (kind === 'Compassion') {
      if (!pack.compassion_eligible) throw forbidden('Compassion Guaranteed is only for the Children 1-month pass.', 'NOT_ELIGIBLE');
      if (days > policies.compassion_days) throw badRequest(`Compassion Guaranteed is up to ${policies.compassion_days} days.`, 'VALIDATION_ERROR');
    } else if (!documentRef) throw badRequest('Upload your medical certificate.', 'VALIDATION_ERROR');
    if (await mcModel.pendingForPackage(pack.id, tx)) throw conflict('You already have a request waiting for this package.', 'ALREADY_PENDING');
    const id = await nextId(tx, 'mc_request', 'id', 'MC-', 2);
    await mcModel.insert({ id, userId: user.id, packageId: pack.id, kind, days, documentRef: kind === 'MC' ? documentRef : null, at: clock.now() }, tx);
    const rows = await mcModel.listForUser(user.id, tx);
    return mcShape(rows.find(r => r.id === id));
  });
}

async function withdrawExtension(user, id) {
  const ok = await withTx(tx => mcModel.deletePending(id, user.id, tx));
  if (!ok) throw notFound('No waiting request with that id.', 'REQUEST_NOT_FOUND');
  return { ok: true };
}

module.exports = { overview, buy, requestExtension, withdrawExtension, packShape, splitActive, mcShape, expiryFor };
