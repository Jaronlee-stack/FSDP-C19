'use strict';
/* Business Admin routes: overview, insights, revenue, reports, policies, timetable, closures, imports. Controllers only pass validated input to a service. */
const { asyncHandler } = require('../utils/errors');
const reportService = require('../services/reportService');
const policyService = require('../services/policyService');
const timetableService = require('../services/timetableService');
const closureService = require('../services/closureService');
const importService = require('../services/importService');
const venueImportService = require('../services/venueImportService');
const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
const created = fn => asyncHandler(async (req, res) => res.status(201).json(await fn(req)));
const u = req => req.user;
module.exports = {
  overview: h(req => reportService.overview(req.valid.query)),
  insights: h(req => reportService.insights(req.valid.query)),
  addIntervention: created(req => reportService.addIntervention(u(req), req.valid.body)),
  decideIntervention: h(req => reportService.decideIntervention(u(req), req.valid.params.id, req.valid.body)),
  revenue: h(req => reportService.revenue(req.valid.query)),
  reports: h(async req => {
    const q = req.valid.query;
    if (!q.kind) return reportService.reports(q);
    const { header, rows, range } = await reportService.reportRows(q.kind, q);
    return { kind: q.kind, from: range.from, to: range.to, columns: header, rows };
  }),
  reportCsv: asyncHandler(async (req, res) => {
    const { filename, csv } = await reportService.reportCsv(req.valid.params.kind, req.valid.query);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(csv);
  }),
  venueMapping: h(req => venueImportService.getMapping(req.valid.params.dojoId)),
  saveVenueMapping: h(req => venueImportService.saveMapping(u(req), req.valid.params.dojoId, req.valid.body)),
  importVenueRoster: h(req => venueImportService.importRoster(u(req), req.valid.params.dojoId, req.valid.body)),
  venueCsv: asyncHandler(async (req, res) => {
    const { filename, csv } = await reportService.venueCsv(req.valid.query);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(csv);
  }),
  policies: h(req => policyService.overview(req.valid.query)),
  policiesPatch: h(req => policyService.update(u(req), req.valid.body)),
  packagePatch: h(req => policyService.updatePackage(u(req), req.valid.params.id, req.valid.body)),
  rulePatch: h(req => policyService.updateRule(u(req), req.valid.params.id, req.valid.body)),
  templateCreate: created(req => policyService.createTemplate(u(req), req.valid.body)),
  templatePatch: h(req => policyService.updateTemplate(u(req), req.valid.params.id, req.valid.body)),
  templateDelete: h(req => policyService.deleteTemplate(u(req), req.valid.params.id)),
  timetable: h(req => timetableService.list(req.valid.query)),
  timetableCreate: created(req => timetableService.create(u(req), req.valid.body)),
  timetablePatch: h(req => timetableService.update(u(req), req.valid.params.id, req.valid.body)),
  timetableDelete: h(req => timetableService.remove(u(req), req.valid.params.id)),
  closures: h(() => closureService.list()),
  closurePreview: h(req => closureService.preview(req.valid.query)),
  closureCreate: created(req => closureService.create(u(req), req.valid.body)),
  closureDelete: h(req => closureService.remove(u(req), req.valid.params.id)),
  classCancel: h(req => closureService.cancelClass(u(req), req.valid.params.lessonId, req.valid.body)),
  imports: h(req => importService.list(req.valid.query)),
  importDecide: h(req => importService.decide(u(req), req.valid.params.id, req.valid.body))
};
