'use strict';
/* The desk ledger: take a payment (mock Stripe), collect an outstanding one, void or adjust (Business Admin), report a mistake,
   refund requests, the daily lock and equipment orders. Prices are always worked out here from policy_setting / package_def / belt_rank:
   an amount sent by the page is never read. */
const config = require('../config');
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, forbidden, badRequest } = require('../utils/errors');
const paymentModel = require('../models/paymentModel');
const refundModel = require('../models/refundModel');
const exceptionModel = require('../models/exceptionModel');
const equipmentModel = require('../models/equipmentModel');
const memberModel = require('../models/memberModel');
const studentModel = require('../models/studentModel');
const packageModel = require('../models/packageModel');
const attendanceModel = require('../models/attendanceModel');
const policyModel = require('../models/policyModel');
const { nextId } = require('../models/ids');
const packageService = require('./packageService');
const { DOGI_PRICE, discountPct } = require('./registrationService');
const { ageOn } = require('./accountService');
const auditService = require('./auditService');

const TZ = config.APP_TZ;
const LOCK_PREFIX = 'ledger_lock_';
const isBA = user => user.adminType === 'business';
const round2 = n => Math.round(n * 100) / 100;
const money = n => `S$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const ledgerShape = r => ({
  id: r.id, invoice: r.invoice_no, userId: r.user_id, memberNo: r.member_no, name: r.full_name, item: r.item, kind: r.kind, amount: r.amount, method: r.method,
  status: r.status, channel: r.channel, by: r.channel, date: r.paid_at || r.created_at, day: r.day, note: r.note, packageId: r.student_package_id
});
const refundShape = r => ({
  id: r.id, paymentId: r.payment_id, memberNo: r.member_no, name: r.full_name, item: r.item, invoice: r.invoice_no, amount: r.amount, reason: r.reason, status: r.status,
  by: r.requested_by_name, at: r.requested_at, decidedBy: r.decided_by_name || null, decidedAt: r.decided_at
});

/* ---------- day lock ---------- */
async function lockOf(day, db) {
  const raw = await policyModel.getOne(LOCK_PREFIX + day, db);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return { by: null, at: null, total: 0, count: 0 }; }
}
const assertDayOpen = async (day, db) => { if (await lockOf(day, db)) throw conflict('Today\'s payments were submitted and locked. Ask a Business Admin to unlock the day.', 'DAY_LOCKED'); };
async function lockDay(user, { date }) {
  return withTx(async tx => {
    const today = clock.today(), day = date || today;
    if (day > today) throw badRequest('Only today or an earlier day can be locked.', 'INVALID_DATE');
    if (await lockOf(day, tx)) throw conflict('That day is already locked.', 'ALREADY_LOCKED');
    const rows = await paymentModel.deskPaidOn(day, TZ, tx);
    const info = { by: user.id, name: user.name, at: clock.now().toISOString(), total: round2(rows.reduce((s, r) => s + r.amount, 0)), count: rows.length };
    await policyModel.setText(LOCK_PREFIX + day, JSON.stringify(info), `Desk payments for ${day} were submitted and locked`, tx);
    await auditService.record(tx, user, { action: 'day.locked', entityType: 'day', entityId: day, summary: `Locked the desk payments for ${day}`, details: { date: day, total: info.total, count: info.count } });
    return { date: day, lock: info };
  });
}
async function unlockDay(user, day) {
  return withTx(async tx => {
    if (!(await policyModel.remove(LOCK_PREFIX + day, tx))) throw notFound('That day is not locked.', 'NOT_LOCKED');
    await auditService.record(tx, user, { action: 'day.unlocked', entityType: 'day', entityId: day, summary: `Unlocked the desk payments for ${day}`, details: { date: day } });
    return { date: day, lock: null };
  });
}

/* ---------- reading ---------- */
async function overview(user, filters) {
  const today = clock.today();
  const [rows, refunds, stats, summaryRows, lock] = await Promise.all([
    paymentModel.listLedger({ tz: TZ, ...filters, includeFailed: isBA(user) }),
    refundModel.list(), paymentModel.stats(today, TZ), paymentModel.deskPaidOn(today, TZ), lockOf(today)
  ]);
  const total = round2(summaryRows.reduce((s, r) => s + r.amount, 0));
  return {
    today, ledger: rows.map(ledgerShape), refunds: refunds.map(refundShape),
    stats: { collectedToday: stats.collected_today, outstandingTotal: stats.outstanding_total, outstandingCount: stats.outstanding_count, processingCount: stats.processing_count, failedCount: isBA(user) ? stats.failed_count : null },
    summary: { date: today, rows: summaryRows.map(ledgerShape), count: summaryRows.length, total, lock }
  };
}

/* ---------- take a payment ---------- */
async function priceFor(item, st, policies, tx) {
  if (item === 'reg') return { kind: 'Registration', name: 'Registration', base: policies.registration_fee, disc: true };
  if (item === 'dues') return { kind: 'Annual dues', name: `Annual dues ${clock.today().slice(0, 4)}`, base: policies.annual_dues, disc: true };
  if (item === 'grading') {
    const next = await studentModel.nextRank(st.rank_id, tx);
    if (!next) throw conflict('This student already holds the top rank.', 'TOP_RANK');
    return { kind: 'Grading fee', name: `Grading fee · ${next.name}`, base: next.grading_fee, disc: false };
  }
  if (item.startsWith('dogi:')) {
    const type = item.slice(5);
    if (DOGI_PRICE[type] === undefined) throw badRequest('Choose a dogi type from the list.', 'INVALID_ITEM');
    return { kind: 'Dogi', name: `Dogi · ${type}`, base: DOGI_PRICE[type], disc: false, dogi: true };
  }
  if (item.startsWith('pkg:')) {
    const def = await packageModel.getDef(item.slice(4), tx);
    if (!def || !def.is_active) throw notFound('That package does not exist.', 'PACKAGE_NOT_FOUND');
    if (def.audience !== (st.age_group === 'Child' ? 'kids' : 'adult')) throw forbidden(`That package is for ${def.audience === 'kids' ? 'children' : 'adults'}.`, 'NOT_ELIGIBLE');
    return { kind: 'Package', name: def.lessons === null ? 'Unlimited · 2 weeks' : def.name, base: def.price, disc: true, def };
  }
  throw badRequest('Choose what the student is paying for.', 'INVALID_ITEM');
}
async function takePayment(user, { memberNo, item, method = 'Stripe' }) {
  return withTx(async tx => {
    const today = clock.today(), now = clock.now();
    await assertDayOpen(today, tx);
    const st = await memberModel.findByMemberNo(memberNo, today, tx);
    if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
    await studentModel.lock(st.user_id, tx);
    const policies = await policyModel.getAll(tx);
    const p = await priceFor(item, st, policies, tx);
    const age = ageOn(st.dob, today);
    const pct = p.disc ? Math.max(discountPct(age, policies), st.discount_type === 'nsf' ? policies.discount_student_pct : 0) : 0;
    const amount = round2(p.base * (100 - pct) / 100);
    if (item === 'dues') {
      const owed = (await memberModel.payments(st.user_id, TZ, tx)).find(x => x.status === 'Outstanding' && x.kind === 'Annual dues');
      if (owed) throw conflict('This student already has annual dues waiting. Collect that payment instead.', 'USE_COLLECT');
    }
    let packId = null;
    if (p.def) {
      await packageModel.sweep(st.user_id, today, tx);
      const active = await packageModel.listActive(st.user_id, tx);
      if (p.def.lessons === null && active.some(x => x.unlimited)) throw conflict('Their Unlimited plan is already active.', 'ALREADY_ACTIVE');
      if (active.length >= policies.max_packages) throw conflict(`They already hold ${policies.max_packages} packages.`, 'PACKAGE_LIMIT');
      packId = await nextId(tx, 'student_package', 'id', 'SP-', 3);
      await packageModel.insert({ id: packId, userId: st.user_id, packageId: p.def.id, lessonsTotal: p.def.lessons, purchasedAt: today, expiresAt: packageService.expiryFor(p.def, today) }, tx);
    }
    const id = await nextId(tx, 'payment', 'id', 'L-', 4), invoiceNo = await nextId(tx, 'payment', 'invoice_no', 'INV-', 7);
    const note = pct ? `${pct}% discount` : null;
    await paymentModel.insert({ id, invoiceNo, userId: st.user_id, item: p.name, kind: p.kind, amount, method, status: 'Paid', channel: 'desk', packageId: packId, at: now, note }, tx);
    if (item === 'dues') await memberModel.renewMembership(st.user_id, clock.addMonths(st.membership_expiry && st.membership_expiry > today ? st.membership_expiry : today, 12), today, tx);
    if (p.dogi) { const eid = await nextId(tx, 'equipment_order', 'id', 'E-', 2); await equipmentModel.insert({ id: eid, userId: st.user_id, item: 'Dogi', size: null, paid: true, at: now }, tx); }
    await auditService.record(tx, user, { action: 'payment.collected', entityType: 'payment', entityId: id, summary: `Took ${money(amount)} for ${p.name} from ${st.full_name} (${memberNo})`,
      details: { invoice: invoiceNo, memberNo, item: p.name, amount, method, discountPct: pct } });
    return { payment: ledgerShape(await paymentModel.getLedgerRow(id, TZ, tx)), basePrice: p.base, discountPct: pct };
  });
}

/* an Outstanding row is paid at the desk */
async function collect(user, id) {
  return withTx(async tx => {
    const today = clock.today(), now = clock.now();
    await assertDayOpen(today, tx);
    const row = await paymentModel.getLedgerRow(id, TZ, tx, true);
    if (!row) throw notFound('That payment was not found.', 'PAYMENT_NOT_FOUND');
    if (row.status !== 'Outstanding') throw conflict('Only an outstanding payment can be collected.', 'NOT_OUTSTANDING');
    await paymentModel.markPaid(id, 'Stripe', 'desk', now, tx);
    if (row.kind === 'Annual dues') {
      const st = await memberModel.findByMemberNo(row.member_no, today, tx);
      await memberModel.renewMembership(row.user_id, clock.addMonths(st.membership_expiry && st.membership_expiry > today ? st.membership_expiry : today, 12), today, tx);
    }
    await auditService.record(tx, user, { action: 'payment.collected', entityType: 'payment', entityId: id, summary: `Collected ${money(row.amount)} for ${row.item} from ${row.full_name} (${row.member_no})`,
      details: { invoice: row.invoice_no, memberNo: row.member_no, item: row.item, amount: row.amount, method: 'Stripe', outstanding: true } });
    return { payment: ledgerShape(await paymentModel.getLedgerRow(id, TZ, tx)) };
  });
}

/* a refunded or voided package cannot be used any more: its upcoming bookings are cancelled and the package stops counting toward the limit */
async function releasePackage(packageId, tx) {
  if (!packageId) return;
  const today = clock.today();
  for (const b of await attendanceModel.upcomingBookedOnPackage(packageId, today, clock.hhmm(), tx)) {
    await attendanceModel.cancel(b.lesson_id, b.user_id, 'Cancelled: the package was refunded or voided', tx);
  }
  await packageModel.retire(packageId, tx);
}

/* Business Admin: void a payment, or correct its amount */
async function voidOrAdjust(user, id, { reason, adjustTo }) {
  return withTx(async tx => {
    const row = await paymentModel.getLedgerRow(id, TZ, tx, true);
    if (!row) throw notFound('That payment was not found.', 'PAYMENT_NOT_FOUND');
    if (!['Paid', 'Processing', 'Failed', 'Outstanding'].includes(row.status)) throw conflict('This payment can no longer be changed.', 'NOT_CHANGEABLE');
    if (adjustTo !== undefined && adjustTo !== null) {
      await paymentModel.setAmount(id, round2(adjustTo), `Adjusted from ${money(row.amount)}: ${reason}`, tx);
    } else {
      await paymentModel.setStatus(id, 'Voided', `Voided: ${reason}`, tx);
      if (row.status === 'Paid') await releasePackage(row.student_package_id, tx);
    }
    const adjusted = adjustTo !== undefined && adjustTo !== null;
    await auditService.record(tx, user, { action: adjusted ? 'payment.adjusted' : 'payment.voided', entityType: 'payment', entityId: id,
      summary: adjusted ? `Adjusted ${row.invoice_no} from ${money(row.amount)} to ${money(round2(adjustTo))}` : `Voided ${row.invoice_no} (${money(row.amount)})`,
      details: { invoice: row.invoice_no, memberNo: row.member_no, before: row.amount, after: adjusted ? round2(adjustTo) : null, statusBefore: row.status, reasonLength: reason.length } });
    return { payment: ledgerShape(await paymentModel.getLedgerRow(id, TZ, tx)) };
  });
}

/* the front desk cannot change a payment: it tells a Business Admin */
async function reportMistake(user, id, { reason }) {
  return withTx(async tx => {
    const row = await paymentModel.getLedgerRow(id, TZ, tx);
    if (!row) throw notFound('That payment was not found.', 'PAYMENT_NOT_FOUND');
    const xid = await nextId(tx, 'exception_request', 'id', 'X-', 2);
    await exceptionModel.insert({ id: xid, kind: 'mistake', subjectName: row.full_name, userId: row.user_id, detail: `${row.item} ${money(row.amount)} (${row.invoice_no}): ${reason}`, requestedBy: user.id, at: clock.now() }, tx);
    await auditService.record(tx, user, { action: 'payment.mistake_reported', entityType: 'payment', entityId: id, summary: `Reported a mistake on ${row.invoice_no}`, details: { invoice: row.invoice_no, exceptionId: xid, reasonLength: reason.length } });
    return { exceptionId: xid };
  });
}

/* ---------- refunds ---------- */
async function requestRefund(user, { paymentId, reason }) {
  return withTx(async tx => {
    const row = await paymentModel.getLedgerRow(paymentId, TZ, tx, true);
    if (!row) throw notFound('That payment was not found.', 'PAYMENT_NOT_FOUND');
    if (row.status !== 'Paid') throw conflict('Only a paid payment can be refunded.', 'NOT_PAID');
    if (row.amount <= 0) throw conflict('There is nothing to refund on this payment.', 'NOT_PAID');
    if (await refundModel.pendingForPayment(paymentId, tx)) throw conflict('A refund request for this payment is already waiting.', 'REFUND_PENDING');
    const id = await nextId(tx, 'refund_request', 'id', 'R-', 2);
    await refundModel.insert({ id, paymentId, userId: row.user_id, amount: row.amount, reason, requestedBy: user.id, at: clock.now() }, tx);
    await auditService.record(tx, user, { action: 'refund.requested', entityType: 'refund', entityId: id, summary: `Requested a refund of ${money(row.amount)} on ${row.invoice_no}`, details: { paymentId, invoice: row.invoice_no, amount: row.amount, reasonLength: reason.length } });
    return { refund: refundShape(await refundModel.get(id, tx)) };
  });
}
async function decideRefund(user, id, { decision }) {
  return withTx(async tx => {
    const r = await refundModel.get(id, tx, true);
    if (!r) throw notFound('That refund request was not found.', 'REFUND_NOT_FOUND');
    if (r.status !== 'pending') throw conflict('This refund request was already decided.', 'ALREADY_DECIDED');
    if (decision === 'approved') {
      const pay = await paymentModel.getLedgerRow(r.payment_id, TZ, tx, true);
      if (pay.status !== 'Paid') throw conflict('The payment is no longer paid, so it cannot be refunded.', 'NOT_PAID');
      await paymentModel.setStatus(pay.id, 'Refunded', pay.note, tx);
      await releasePackage(pay.student_package_id, tx);
    }
    await refundModel.decide(id, decision, user.id, clock.now(), tx);
    await auditService.record(tx, user, { action: 'refund.decided', entityType: 'refund', entityId: id, summary: `${decision === 'approved' ? 'Approved' : 'Declined'} refund ${id}`, details: { paymentId: r.payment_id, decision, amount: r.amount } });
    return { refund: refundShape(await refundModel.get(id, tx)) };
  });
}

/* ---------- equipment ---------- */
const equipmentShape = e => ({
  id: e.id, userId: e.user_id, memberNo: e.member_no, name: e.full_name, item: e.item, size: e.size, paid: e.paid, status: e.status,
  requestedAt: e.requested_at, handedOverAt: e.handed_over_at, collectedBy: e.handed_over_to
});
const listEquipment = async (q) => ({ orders: (await equipmentModel.list(q || null)).map(equipmentShape) });
async function markReady(user, id) {
  return withTx(async tx => {
    const e = await equipmentModel.get(id, tx, true);
    if (!e) throw notFound('That order was not found.', 'ORDER_NOT_FOUND');
    if (e.status !== 'Requested') throw conflict('This order is not waiting to be prepared.', 'NOT_REQUESTED');
    await equipmentModel.setReady(id, tx);
    await auditService.record(tx, user, { action: 'equipment.ready', entityType: 'equipment', entityId: id, summary: `Marked equipment order ${id} ready at HQ`, details: { item: e.item, userId: e.user_id } });
    return { order: equipmentShape(await equipmentModel.get(id, tx)) };
  });
}
async function handOver(user, id, { collectedBy }) {
  return withTx(async tx => {
    const e = await equipmentModel.get(id, tx, true);
    if (!e) throw notFound('That order was not found.', 'ORDER_NOT_FOUND');
    if (e.status === 'Handed over') throw conflict('This order was already handed over.', 'ALREADY_HANDED_OVER');
    if (e.status !== 'Ready at HQ') throw conflict('Mark the order ready at HQ first.', 'NOT_READY');
    if (!e.paid) throw conflict('This order is still unpaid. Collect payment first.', 'UNPAID');
    await equipmentModel.handOver(id, collectedBy, clock.now(), tx);
    await auditService.record(tx, user, { action: 'equipment.handed_over', entityType: 'equipment', entityId: id, summary: `Handed over equipment order ${id}`, details: { item: e.item, userId: e.user_id, collectorNamed: true } });
    return { order: equipmentShape(await equipmentModel.get(id, tx)) };
  });
}

module.exports = { overview, takePayment, collect, voidOrAdjust, reportMistake, requestRefund, decideRefund, lockDay, unlockDay, lockOf, listEquipment, markReady, handOver, ledgerShape, refundShape, equipmentShape, releasePackage };
