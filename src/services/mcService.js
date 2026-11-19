'use strict';
/* Package extension requests (medical certificate or Compassion Guaranteed), decided at the desk.
   The front desk may decide a request of up to 14 days that has its certificate (Compassion needs none); anything else goes to a Business Admin.
   Approving moves the package end date and/or returns the lesson that was missed. An Unlimited plan only records the absence as excused. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const mcModel = require('../models/mcModel');
const packageModel = require('../models/packageModel');
const exceptionModel = require('../models/exceptionModel');
const auditService = require('./auditService');

const FD_LIMIT_DAYS = 14;
const isBA = user => user.adminType === 'business';
const withinFrontDesk = m => m.days_requested <= FD_LIMIT_DAYS && (m.kind === 'Compassion' || !!m.document_ref);

const shape = m => ({
  id: m.id, userId: m.user_id, memberNo: m.member_no, name: m.full_name, passId: m.student_package_id, passName: m.package_name, unlimited: !!m.unlimited,
  kind: m.kind === 'MC' ? 'mc' : 'compassion', days: m.days_requested, file: m.document_ref, status: m.status === 'declined' ? 'rejected' : m.status,
  date: m.requested_at, expires: m.expires_at, decidedAt: m.decided_at, decidedBy: m.decided_by_name || null, reason: m.decision_note,
  referred: m.status === 'pending' && !!m.exception_id, within: withinFrontDesk(m), daysGranted: m.days_granted,
  excused: m.status === 'approved' && !!m.unlimited, extended: m.status === 'approved' && !m.unlimited && (m.days_granted || 0) > 0
});

/* the rules, inside a transaction. Also used when a Business Admin approves the exception a request was sent up with. */
async function apply(tx, user, m, { decision, days, returnLesson, extend, reason }) {
  if (m.status !== 'pending') throw conflict('This request was already decided.', 'ALREADY_DECIDED');
  if (!isBA(user) && !withinFrontDesk(m)) throw conflict('A Business Admin has to decide this request.', 'NEEDS_BUSINESS_ADMIN');
  const now = clock.now(), today = clock.today();
  if (decision === 'declined') { await mcModel.decide(m.id, 'declined', null, user.id, now, reason, tx); return; }
  const pack = await packageModel.getById(m.student_package_id, tx, true);
  if (!pack || pack.status !== 'Active') throw conflict('The package is no longer active.', 'PACKAGE_NOT_ACTIVE');
  const grant = days === undefined || days === null ? m.days_requested : days;
  if (grant < 1 || grant > m.days_requested) throw badRequest(`Choose between 1 and ${m.days_requested} days.`, 'VALIDATION_ERROR');
  if (pack.unlimited) { await mcModel.decide(m.id, 'approved', 0, user.id, now, reason, tx); return; }   // excused: nothing to return or extend
  const ret = m.kind === 'Compassion' ? false : returnLesson === undefined ? true : returnLesson;
  const ext = extend === undefined ? true : extend;
  if (!ret && !ext) throw badRequest('Return the lesson or extend the expiry, or decline the request.', 'NOTHING_TO_APPLY');
  if (ext) await packageModel.extendExpiry(pack.id, clock.addDays(pack.expires_at, grant), tx);
  if (ret) await packageModel.returnLesson(pack.id, today, tx);
  await mcModel.decide(m.id, 'approved', ext ? grant : 0, user.id, now, reason, tx);
}

async function decide(user, id, body) {
  return withTx(async tx => {
    const m = await mcModel.getAdmin(id, tx, true);
    if (!m) throw notFound('That request was not found.', 'REQUEST_NOT_FOUND');
    await apply(tx, user, m, body);
    // a request sent up to a Business Admin as an exception is settled together with it
    if (m.exception_id) {
      const x = await exceptionModel.get(m.exception_id, tx, true);
      if (x && x.status === 'pending') await exceptionModel.decide(x.id, body.decision, user.id, clock.now(), body.reason || 'Decided on the Extensions tab', tx);
    }
    const after = await mcModel.getAdmin(id, tx);
    await auditService.record(tx, user, { action: 'mc.decision', entityType: 'mc_request', entityId: id, summary: `${body.decision === 'approved' ? 'Approved' : 'Declined'} extension request ${id} for ${m.full_name} (${m.member_no})`,
      details: { decision: body.decision, kind: m.kind, daysRequested: m.days_requested, daysGranted: after.days_granted, memberNo: m.member_no } });
    return { request: shape(after) };
  });
}
const list = async () => (await mcModel.listAdmin()).map(shape);
module.exports = { decide, apply, list, shape, withinFrontDesk, FD_LIMIT_DAYS };
