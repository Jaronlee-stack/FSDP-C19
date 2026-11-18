'use strict';
/* Exceptions: what the front desk cannot decide is sent to a Business Admin, who approves or declines it.
   An exception sent up for a package extension is linked to that request and settles it. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict } = require('../utils/errors');
const exceptionModel = require('../models/exceptionModel');
const memberModel = require('../models/memberModel');
const mcModel = require('../models/mcModel');
const { nextId } = require('../models/ids');
const mcService = require('./mcService');
const auditService = require('./auditService');

const shape = x => ({
  id: x.id, kind: x.kind, who: x.subject_name, memberNo: x.member_no || null, text: x.detail, status: x.status, by: x.requested_by_name, at: x.requested_at,
  decidedBy: x.decided_by_name || null, decidedAt: x.decided_at, reason: x.decision_note
});
const list = async () => (await exceptionModel.list()).map(shape);

async function create(user, { kind, subjectName, memberNo, detail, mcId }) {
  return withTx(async tx => {
    let userId = null, subject = subjectName;
    if (memberNo) {
      const st = await memberModel.findByMemberNo(memberNo, clock.today(), tx);
      if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
      userId = st.user_id; subject = subject || st.full_name;
    }
    let mc = null;
    if (mcId) {
      mc = await mcModel.getAdmin(mcId, tx, true);
      if (!mc) throw notFound('That request was not found.', 'REQUEST_NOT_FOUND');
      if (mc.status !== 'pending') throw conflict('That request was already decided.', 'ALREADY_DECIDED');
      if (kind !== 'extension') throw conflict('Only an extension exception can be linked to a request.', 'CONFLICT');
      const earlier = mc.exception_id ? await exceptionModel.get(mc.exception_id, tx) : null;
      if (earlier && earlier.status === 'pending') throw conflict('This request is already with a Business Admin.', 'ALREADY_REFERRED');
      userId = userId || mc.user_id; subject = subject || mc.full_name;
    }
    const id = await nextId(tx, 'exception_request', 'id', 'X-', 2);
    await exceptionModel.insert({ id, kind, subjectName: subject, userId, detail, requestedBy: user.id, at: clock.now() }, tx);
    if (mc) await mcModel.linkException(mc.id, id, tx);
    await auditService.record(tx, user, { action: 'exception.raised', entityType: 'exception', entityId: id, summary: `Raised a ${kind} exception ${id} for ${subject}`, details: { kind, memberNo: memberNo || null, mcId: mcId || null } });
    return { exception: shape(await exceptionModel.get(id, tx)) };
  });
}

/* Business Admin only (the route enforces it) */
async function decide(user, id, { decision, reason }) {
  return withTx(async tx => {
    const x = await exceptionModel.get(id, tx, true);
    if (!x) throw notFound('That exception was not found.', 'EXCEPTION_NOT_FOUND');
    if (x.status !== 'pending') throw conflict('This exception was already decided.', 'ALREADY_DECIDED');
    let mcId = null;
    if (x.kind === 'extension') {
      const link = await mcModel.byException(id, tx);
      if (link) { const m = await mcModel.getAdmin(link.id, tx, true); await mcService.apply(tx, user, m, { decision, reason }); mcId = m.id; }
    }
    await exceptionModel.decide(id, decision, user.id, clock.now(), reason, tx);
    await auditService.record(tx, user, { action: 'exception.decided', entityType: 'exception', entityId: id, summary: `${decision === 'approved' ? 'Approved' : 'Declined'} ${x.kind} exception ${id}`, details: { kind: x.kind, decision, mcId, reasonLength: reason.length } });
    return { exception: shape(await exceptionModel.get(id, tx)) };
  });
}
module.exports = { create, decide, list, shape };
