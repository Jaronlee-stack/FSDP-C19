'use strict';
/* Audit log (Business Admin): searchable list and CSV export. */
const { asyncHandler } = require('../utils/errors');
const auditService = require('../services/auditService');

module.exports = {
  list: asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await auditService.list(req.user, req.valid.query));
  }),
  exportCsv: asyncHandler(async (req, res) => {
    const { filename, csv } = await auditService.exportCsv(req.user, req.valid.query);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(csv);
  })
};
