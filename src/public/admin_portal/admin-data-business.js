'use strict';
/* AIKIDO SHINJU-KAI — admin-data-business.js  (office portal, Business Admin: data loaders and actions)

   Every call here goes to /api/v1/admin/* and every route it reaches is for Business Admins only: the server answers 403 BUSINESS_ADMIN_ONLY
   to the front desk. Nothing is kept in the browser: a page loads what it shows with ASK.load.ba*, writes with ASK.act.ba*, then loads again.
   Loaded after admin-data-desk.js (it uses ASK.refreshSummary). */

(function () {
const enc = encodeURIComponent;
const qs = o => { const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''); return p.length ? '?' + p.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&') : ''; };
const P = p => '/admin' + p;
/* write, then refresh the sidebar counts (they follow imports, promotions, ...) */
const act = async (method, path, body) => { const r = await ASK.api(method, P(path), body); if (ASK.refreshSummary) ASK.refreshSummary(); return r; };

Object.assign(ASK.load, {
  baOverview: period => ASK.get(P('/overview' + qs({ period }))),
  baInsights: q => ASK.get(P('/insights' + qs(q))),
  baRevenue: q => ASK.get(P('/revenue' + qs(q))),
  baReports: q => ASK.get(P('/reports' + qs(q))),
  baPolicies: q => ASK.get(P('/policies' + qs(q))),
  baTimetable: dojo => ASK.get(P('/timetable' + qs({ dojo }))),
  baClosures: () => ASK.get(P('/closures')),
  baClosurePreview: q => ASK.get(P('/closures/preview' + qs(q))),
  baImports: status => ASK.get(P('/imports' + qs({ status }))),
  baGrading: () => ASK.get(P('/grading')),
  baStaff: () => ASK.get(P('/staff')),
  baAudit: q => ASK.get(P('/audit' + qs(q))),
  notifyAudience: (type, target) => ASK.get(P('/notifications/audience' + qs({ type, target })))
});

Object.assign(ASK.act, {
  baIntervention: body => act('POST', '/insights/interventions', body),
  baInterventionDecision: (id, decision) => act('PATCH', '/insights/interventions/' + enc(id), { decision }),
  baPolicies: body => act('PATCH', '/policies', body),
  baPackage: (id, body) => act('PATCH', '/policies/packages/' + enc(id), body),
  baRule: (id, enabled) => act('PATCH', '/policies/auto-activation/' + enc(id), { enabled }),
  baTemplateCreate: body => act('POST', '/policies/templates', body),
  baTemplateUpdate: (id, body) => act('PATCH', '/policies/templates/' + enc(id), body),
  baTimetableCreate: body => act('POST', '/timetable', body),
  baTimetableUpdate: (id, body) => act('PATCH', '/timetable/' + enc(id), body),
  baTimetableDelete: id => act('DELETE', '/timetable/' + enc(id), {}),
  baClosureCreate: body => act('POST', '/closures', body),
  baClosureDelete: id => act('DELETE', '/closures/' + enc(id), {}),
  baClassCancel: (lessonId, note) => act('POST', `/classes/${enc(lessonId)}/cancel`, note ? { note } : {}),
  baImportDecide: (id, body) => act('PATCH', '/imports/' + enc(id), body),
  baGradingApp: (id, body) => act('POST', `/grading/applications/${enc(id)}/decision`, body),
  baPromotion: (sessionId, userId, decision) => act('POST', `/grading/candidates/${enc(sessionId)}/${enc(userId)}/promotion`, { decision }),
  baStaffCreate: body => act('POST', '/staff', body),
  baStaffUpdate: (id, body) => act('PATCH', '/staff/' + enc(id), body),
  baStaffReset: id => act('POST', `/staff/${enc(id)}/reset-password`, {}),
  notifySend: body => act('POST', '/notifications/send', body)
});
Object.assign(ASK.load, {
  baVenueMapping: dojo => ASK.get(P(`/venues/${enc(dojo)}/import-mapping`))
});
Object.assign(ASK.act, {
  baVenueMappingSave: (dojo, body) => act('PUT', `/venues/${enc(dojo)}/import-mapping`, body),
  baRosterImport: (dojo, body) => act('POST', `/venues/${enc(dojo)}/roster-import`, body)
});
/* a CSV file the server builds (named by the server) */
ASK.baVenueCsv = q => ASK.csv(P('/venues/attendance.csv' + qs(q)), 'venue-attendance.csv');
ASK.baCsv = (kind, params) => ASK.csv(P(`/reports/${enc(kind)}.csv` + qs(params)), `${kind}.csv`);
ASK.baAuditCsv = q => ASK.csv(P('/audit/export.csv' + qs(q)), 'audit-log.csv');
})();
