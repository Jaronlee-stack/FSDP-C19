'use strict';
/* AIKIDO SHINJU-KAI — admin-data-desk.js  (office portal, front desk: data loaders and actions)

   Every call here goes to /api/v1/admin/*. Nothing is kept in the browser: a page loads what it shows with ASK.load.*, writes with ASK.act.*, then loads again.
   The server decides who may do what (front desk or Business Admin), what a price is and whether a rule allows an action. Hiding a button elsewhere is only a courtesy.
   Some slices of DB (ledger, refunds, equipment, guests) are filled in place with the older field names so code that has not been converted yet keeps working. */

(function () {
const enc = encodeURIComponent;
const qs = o => { const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''); return p.length ? '?' + p.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&') : ''; };
const P = p => '/admin' + p;

/* ---------- shapes the pages used before the API existed ---------- */
const ledgerRow = l => ({ id: l.id, no: l.memberNo, name: l.name, item: l.item, kind: l.kind, amt: l.amount, method: l.method, date: ASK.ts(l.date), day: l.day, st: l.status, by: l.channel, inv: l.invoice, note: l.note || undefined, pkg: l.packageId });
const refundRow = r => ({ id: r.id, payId: r.paymentId, no: r.memberNo, name: r.name, item: r.item, amt: r.amount, reason: r.reason, by: r.by, at: ASK.ts(r.at), status: r.status, inv: r.invoice });
const equipmentRow = e => ({ id: e.id, no: e.memberNo, name: e.name, item: e.item, size: e.size || '', paid: e.paid, status: e.status, at: ASK.ts(e.requestedAt), by: e.collectedBy || '' });
const guestRow = g => ({ id: g.id, name: g.name, mobile: g.mobile, email: g.email, pass: g.pass, used: g.used, until: g.until ? ASK.d(g.until) : null });

/* ---------- loaders ---------- */
Object.assign(ASK.load, {
  deskToday: () => ASK.get(P('/today')),
  deskClasses: (from, to) => ASK.get(P('/rosters' + qs({ from, to }))),
  deskRoster: lessonId => ASK.get(P('/rosters/' + enc(lessonId))),
  async deskGuests() { const r = await ASK.get(P('/guests')); ASK.fill(DB.guests, r.guests.map(guestRow)); return r.guests; },
  deskMembers: params => ASK.get(P('/members' + qs(params))),
  deskMember: memberNo => ASK.get(P('/members/' + enc(memberNo))),
  async deskPayments(filters) {
    const r = await ASK.get(P('/payments' + qs(filters)));
    ASK.fill(DB.ledger, r.ledger.map(ledgerRow)); ASK.fill(DB.refunds, r.refunds.map(refundRow));
    return r;
  },
  async deskEquipment(q) { const r = await ASK.get(P('/equipment' + qs({ q }))); ASK.fill(DB.equipment, r.orders.map(equipmentRow)); return r.orders; },
  deskApplications: () => ASK.get(P('/applications')),
  deskApplication: id => ASK.get(P('/applications/' + enc(id))),
  deskFollowups: () => ASK.get(P('/followups')),
  deskNotifications: () => ASK.get(P('/notifications'))
});

/* the sidebar badges and the bell follow the server's counts */
ASK.refreshSummary = async () => {
  try { ASK.summary = await ASK.get(P('/summary'), { noRedirect: true }); } catch (_) { return; }
  if (typeof setCount === 'function' && ASK.summary) { setCount('applications', ASK.summary.applications); if (ASK.summary.importsOpen !== undefined) setCount('imports', ASK.summary.importsOpen); }
};
/* write, then refresh the counts (not awaited by the caller unless it needs them) */
const act = async (method, path, body) => { const r = await ASK.api(method, P(path), body); ASK.refreshSummary(); return r; };

/* ---------- actions ---------- */
Object.assign(ASK.act, {
  deskBook: (lessonId, body) => act('POST', `/rosters/${enc(lessonId)}/bookings`, body),
  deskCancelBooking: (lessonId, userId, body) => act('DELETE', `/rosters/${enc(lessonId)}/bookings/${enc(userId)}`, body || {}),
  deskWalkIn: (lessonId, body) => act('POST', `/rosters/${enc(lessonId)}/walk-ins`, body),
  deskWaitlistAdd: (lessonId, memberNo) => act('POST', `/rosters/${enc(lessonId)}/waitlist`, { memberNo }),
  deskWaitlistOffer: (lessonId, userId) => act('POST', `/rosters/${enc(lessonId)}/waitlist/${enc(userId)}/offer`, {}),
  deskAttendance: (lessonId, userId, body) => act('PUT', `/rosters/${enc(lessonId)}/attendance/${enc(userId)}`, body),
  deskSubmit: (lessonId, rows) => act('POST', `/rosters/${enc(lessonId)}/submit`, { rows }),
  deskTakePayment: (memberNo, item) => act('POST', '/payments', { memberNo, item, method: 'Stripe' }),
  deskCollect: id => act('POST', `/payments/${enc(id)}/collect`, {}),
  deskVoid: (id, body) => act('POST', `/payments/${enc(id)}/void`, body),
  deskMistake: (id, reason) => act('POST', `/payments/${enc(id)}/mistake`, { reason }),
  deskLockDay: () => act('POST', '/payments/day/lock', {}),
  deskRefund: (paymentId, reason) => act('POST', '/refunds', { paymentId, reason }),
  deskRefundDecision: (id, decision) => act('POST', `/refunds/${enc(id)}/decision`, { decision }),
  deskEquipmentReady: id => act('POST', `/equipment/${enc(id)}/ready`, {}),
  deskHandOver: (id, collectedBy) => act('POST', `/equipment/${enc(id)}/handover`, { collectedBy }),
  deskChecklist: (id, ruleId, done) => act('PATCH', `/applications/${enc(id)}/checklist`, { ruleId, done }),
  deskActivate: (id, rankId) => act('POST', `/applications/${enc(id)}/activate`, rankId ? { rankId } : {}),
  deskReject: (id, note) => act('POST', `/applications/${enc(id)}/reject`, { note }),
  deskRequestInfo: (id, text) => act('POST', `/applications/${enc(id)}/request-info`, { text }),
  deskRegister: body => act('POST', '/registrations', body),
  deskMc: (id, body) => act('POST', `/mc-requests/${enc(id)}/decision`, body),
  deskException: body => act('POST', '/exceptions', body),
  deskExceptionDecision: (id, decision, reason) => act('POST', `/exceptions/${enc(id)}/decision`, { decision, reason }),
  deskPatchMember: (memberNo, body) => act('PATCH', '/members/' + enc(memberNo), body),
  deskMessage: (memberNo, body) => act('POST', `/members/${enc(memberNo)}/messages`, { body }),
  deskLogContact: (memberNo, body) => act('POST', `/members/${enc(memberNo)}/contact-attempts`, body),
  deskFollowupAttempt: (id, body) => act('POST', `/followups/${enc(id)}/attempts`, body),
  deskFollowupCreate: body => act('POST', '/followups', body),
  deskFollowupUpdate: (id, body) => act('PATCH', '/followups/' + enc(id), body)
});
/* for the pages: turn one API row into the older field names */
ASK.map = Object.assign(ASK.map || {}, { ledgerRow, refundRow, equipmentRow, guestRow });
})();
