'use strict';
/* Business Admin only (403 BUSINESS_ADMIN_ONLY for the front desk): overview, insights, revenue, reports, policies, timetable, closures, imports.
   The guard is on every route, not on the router, so a path that is not listed here is still a plain 404. */
const router = require('express').Router();
const ctrl = require('../../controllers/businessController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');
const ba = requireAdminType('business');
router.get('/overview', ba, validate({ query: v.overviewQuery }), ctrl.overview);
router.get('/insights', ba, validate({ query: v.insightsQuery }), ctrl.insights);
router.post('/insights/interventions', ba, validate({ body: v.interventionBody }), ctrl.addIntervention);
router.patch('/insights/interventions/:id', ba, validate({ params: v.idParam, body: v.interventionPatch }), ctrl.decideIntervention);
router.get('/revenue', ba, validate({ query: v.revenueQuery }), ctrl.revenue);
router.get('/reports', ba, validate({ query: v.reportsQuery }), ctrl.reports);
router.get('/venues/attendance.csv', ba, validate({ query: v.reportCsvQuery }), ctrl.venueCsv);
router.get('/venues/:dojoId/import-mapping', ba, validate({ params: v.venueParam }), ctrl.venueMapping);
router.put('/venues/:dojoId/import-mapping', ba, validate({ params: v.venueParam, body: v.venueMappingBody }), ctrl.saveVenueMapping);
router.post('/venues/:dojoId/roster-import', ba, validate({ params: v.venueParam, body: v.rosterImportBody }), ctrl.importVenueRoster);
router.get('/reports/:kind.csv', ba, validate({ params: v.reportParam, query: v.reportCsvQuery }), ctrl.reportCsv);
router.get('/policies', ba, validate({ query: v.policiesQuery }), ctrl.policies);
router.patch('/policies', ba, validate({ body: v.policiesPatch }), ctrl.policiesPatch);
router.patch('/policies/packages/:id', ba, validate({ params: v.idParam, body: v.packagePatch }), ctrl.packagePatch);
router.patch('/policies/auto-activation/:id', ba, validate({ params: v.idParam, body: v.rulePatch }), ctrl.rulePatch);
router.post('/policies/templates', ba, validate({ body: v.templateBody }), ctrl.templateCreate);
router.patch('/policies/templates/:id', ba, validate({ params: v.idParam, body: v.templatePatch }), ctrl.templatePatch);
router.delete('/policies/templates/:id', ba, validate({ params: v.idParam }), ctrl.templateDelete);
router.get('/timetable', ba, validate({ query: v.timetableQuery }), ctrl.timetable);
router.post('/timetable', ba, validate({ body: v.timetableBody }), ctrl.timetableCreate);
router.patch('/timetable/:id', ba, validate({ params: v.idParam, body: v.timetableBody }), ctrl.timetablePatch);
router.delete('/timetable/:id', ba, validate({ params: v.idParam }), ctrl.timetableDelete);
router.get('/closures', ba, ctrl.closures);
router.get('/closures/preview', ba, validate({ query: v.closurePreviewQuery }), ctrl.closurePreview);   // before /closures/:id
router.post('/closures', ba, validate({ body: v.closureBody }), ctrl.closureCreate);
router.delete('/closures/:id', ba, validate({ params: v.idParam }), ctrl.closureDelete);
router.post('/classes/:lessonId/cancel', ba, validate({ params: v.lessonParam, body: v.classCancel }), ctrl.classCancel);
router.get('/imports', ba, validate({ query: v.importsQuery }), ctrl.imports);
router.patch('/imports/:id', ba, validate({ params: v.idParam, body: v.importDecision }), ctrl.importDecide);
module.exports = router;
