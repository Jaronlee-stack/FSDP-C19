'use strict';
/* Import issues (Business Admin): spreadsheet rows that need a decision. A row is matched to a member (fixed) or dismissed, once. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const importModel = require('../models/importModel');
const memberModel = require('../models/memberModel');
const auditService = require('./auditService');

const shape = i => ({
  id: i.id, file: i.file_name, row: i.row_no, issue: i.issue_type, name: i.person_name || '', detail: i.detail, status: i.status,
  matchedNo: i.matched_no || null, matchedName: i.matched_name || null
});

async function list({ status }) {
  const [issues, counts] = await Promise.all([importModel.list(status || null), importModel.counts()]);
  return { issues: issues.map(shape), counts };
}

async function decide(user, id, { status, memberNo }) {
  return withTx(async tx => {
    const cur = await importModel.get(id, tx, true);
    if (!cur) throw notFound('That import row does not exist.', 'IMPORT_NOT_FOUND');
    if (cur.status !== 'open') throw conflict('That row was already decided.', 'ALREADY_DECIDED');
    let userId = null;
    if (memberNo) {
      if (status !== 'fixed') throw badRequest('Only a fixed row can be matched to a member.', 'VALIDATION_ERROR');
      const m = await memberModel.findByMemberNo(memberNo, clock.today(), tx);
      if (!m) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
      userId = m.user_id;
    }
    await importModel.decide(id, status, userId, tx);
    await auditService.record(tx, user, { action: 'import.decided', entityType: 'import', entityId: id, summary: `Marked import row ${id} as ${status}`, details: { status, issue: cur.issue_type, matchedMemberNo: memberNo || null } });
    return { issue: shape(await importModel.get(id, tx)), counts: await importModel.counts(tx) };
  });
}
module.exports = { list, decide };
