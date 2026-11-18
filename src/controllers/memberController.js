'use strict';
/* Office member routes: list, record, edits, messages, contact log, CSV export (Business Admin). */
const { asyncHandler } = require('../utils/errors');
const memberService = require('../services/memberService');
const followupService = require('../services/followupService');

const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
const u = req => req.user;

module.exports = {
  list: h(req => memberService.list(u(req), req.valid.query)),
  record: h(req => memberService.record(u(req), req.valid.params.memberNo)),
  patch: h(req => memberService.patch(u(req), req.valid.params.memberNo, req.valid.body)),
  message: h(req => memberService.message(u(req), req.valid.params.memberNo, req.valid.body)),
  contact: h(req => followupService.logContact(u(req), req.valid.params.memberNo, req.valid.body)),
  exportCsv: asyncHandler(async (req, res) => {
    const { filename, csv } = await memberService.exportCsv(u(req));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(csv);
  })
};
