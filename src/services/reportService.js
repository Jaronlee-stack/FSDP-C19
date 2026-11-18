'use strict';
/* Business Admin figures: Overview, Insights, Revenue, Reports (and their CSV files). Every number is worked out from the database on each request:
   occupancy from the dated lessons and their bookings, revenue from payments, cohorts from the date a member joined and their attendance.
   "Occupancy" is seats taken (booked, attended or no-show) divided by seats offered, for lessons that were not cancelled. */
const { withTx } = require('../config/db');
const config = require('../config');
const clock = require('../utils/clock');
const { toCsv } = require('../utils/csv');
const { notFound, badRequest } = require('../utils/errors');
const reportModel = require('../models/reportModel');
const policyModel = require('../models/policyModel');
const referenceModel = require('../models/referenceModel');
const rules = require('./gradingRules');
const auditService = require('./auditService');

const TZ = config.APP_TZ;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round1 = n => Math.round(n * 10) / 10;
const monthStart = ymd => ymd.slice(0, 8) + '01';
const monthLabel = ym => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const hourOf = hhmm => Number(hhmm.slice(0, 2));

/* ---------- weekly classes and how full they were ---------- */
const slotRow = (s, ratings) => {
  const r = ratings.get(s.id);
  return {
    id: s.id, code: s.code, dojoId: s.dojo_id, dojoName: s.dojo_name, day: s.weekday, time: s.start_time, mat: s.mat, type: s.class_type, instructorId: s.instructor_id, ins: s.instructor_name, cap: s.capacity, kids: s.kids_only,
    sessions: s.sessions, booked: s.sessions ? round1(s.taken / s.sessions) : 0, occupancy: s.cap_total ? s.taken / s.cap_total : 0, rating: r ? round1(r.rating) : null, ratings: r ? r.n : 0,
    taken: s.taken, offered: s.cap_total
  };
};
async function slotsIn(from, to) {
  const [slots, ratings] = await Promise.all([reportModel.slotStats(from, to), reportModel.ratingsByTemplate(from, to)]);
  const byId = new Map(ratings.map(r => [r.template_id, r]));
  return slots.map(s => slotRow(s, byId));
}
/* occupancy per dojo from a list of slot rows */
function byDojo(slots) {
  const m = new Map();
  for (const s of slots) { const o = m.get(s.dojoId) || { id: s.dojoId, name: s.dojoName, classes: 0, taken: 0, offered: 0 }; o.classes += 1; o.taken += s.taken; o.offered += s.offered; m.set(s.dojoId, o); }
  return m;
}
const occOf = o => (o && o.offered ? o.taken / o.offered : null);
/* points of change in occupancy from one window to the other (null when either window has no lessons) */
const deltaPts = (cur, prev) => (cur === null || prev === null || prev === undefined ? null : Math.round((cur - prev) * 100));

/* ---------- Overview ---------- */
const PERIODS = { month: today => monthStart(today), 30: today => clock.addDays(today, -30), 90: today => clock.addDays(today, -90), 365: today => clock.addDays(today, -365) };
async function overview({ period }) {
  const today = clock.today(), from = PERIODS[period](today);
  const wFrom = clock.addDays(today, -27), pFrom = clock.addDays(today, -55), pTo = clock.addDays(today, -28);
  const [members, cur, prev, dojos, paid, owed, owedBy, waiting, cohorts, policies, ivRaw] = await Promise.all([
    reportModel.members(today), slotsIn(wFrom, today), slotsIn(pFrom, pTo), referenceModel.listDojos(), reportModel.paidIn(from, today, TZ),
    reportModel.outstanding(), reportModel.outstandingByDojo(), reportModel.waiting(), reportModel.cohorts(monthStart(clock.addMonths(today, -11))),
    policyModel.getAll(), policyModel.getOne('interventions')
  ]);
  const declineDays = policies.follow_decline_days || 14;
  const curBy = byDojo(cur), prevBy = byDojo(prev), owedMap = new Map(owedBy.map(o => [o.dojo_id, o.amount]));
  const centres = dojos.map(d => {
    const c = curBy.get(d.id);
    return c ? { id: d.id, name: d.name, short: d.short_name, classes: c.classes, occupancy: occOf(c) || 0, outstanding: owedMap.get(d.id) || 0, delta: deltaPts(occOf(c), occOf(prevBy.get(d.id))) } : null;
  }).filter(Boolean).sort((a, b) => b.occupancy - a.occupancy).slice(0, 6);
  const mature = cohortRows(cohorts, today).filter(c => c.kept !== null);
  const joined = mature.reduce((s, c) => s + c.joined, 0), kept = mature.reduce((s, c) => s + c.kept, 0);
  const retention = joined ? Math.round(kept / joined * 100) : null;
  const seen = m => clock.diffDays(m.last_seen || m.joined_on, today);
  const withData = cur.filter(s => s.sessions > 0);
  const ivs = parseList(ivRaw);
  return {
    period, from, today,
    stats: {
      activeMembers: members.filter(m => m.account_status === 'Active').length, totalMembers: members.length, newMembers: members.filter(m => m.joined_on >= from).length,
      retention, collected: paid.reduce((s, p) => s + p.amount, 0), outstanding: owed.amount, outstandingCount: owed.n
    },
    centres,
    waiting: { exceptions: waiting.exceptions, failedPayments: waiting.failed, imports: waiting.imports, promotions: waiting.promotions, followupOutcomes: waiting.followup_outcomes,
      declining: members.filter(m => m.account_status === 'Active' && seen(m) >= declineDays).length, declineDays },
    questions: {
      fullClasses: withData.filter(s => s.occupancy >= 0.85).length, lowClasses: withData.filter(s => s.occupancy < 0.5).length,
      leftAfter90: retention === null ? null : 100 - retention, intervention: ivs.length ? ivShape(ivs[0]) : null
    }
  };
}

/* ---------- interventions (kept as one JSON value in policy_setting under the key 'interventions') ---------- */
const parseList = text => { try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
const ivShape = x => ({ id: x.id, name: x.name, slot: x.slot, start: x.start, before: x.before, after: x.after, decision: x.decision, change: x.before ? Math.round((x.after - x.before) / x.before * 100) : 0 });
async function addIntervention(user, body) {
  return withTx(async tx => {
    const list = parseList(await policyModel.getOneForUpdate('interventions', tx));
    const n = list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1;
    const item = { id: `N-${String(n).padStart(2, '0')}`, name: body.name, slot: body.slot, start: clock.today(), before: body.before, after: body.after, decision: body.decision, by: user.id };
    list.unshift(item);
    await policyModel.putJson('interventions', JSON.stringify(list), 'Insights: changes tried at a centre (JSON list, Business Admin)', tx);
    await auditService.record(tx, user, { action: 'intervention.added', entityType: 'intervention', entityId: item.id, summary: `Recorded the intervention ${item.id}`, details: { slot: item.slot, before: item.before, after: item.after, decision: item.decision } });
    return { intervention: ivShape(item) };
  });
}
async function decideIntervention(user, id, { decision }) {
  return withTx(async tx => {
    const list = parseList(await policyModel.getOneForUpdate('interventions', tx));
    const item = list.find(x => x.id === id);
    if (!item) throw notFound('That intervention does not exist.', 'INTERVENTION_NOT_FOUND');
    const was = item.decision;
    item.decision = decision;
    await policyModel.putJson('interventions', JSON.stringify(list), 'Insights: changes tried at a centre (JSON list, Business Admin)', tx);
    await auditService.record(tx, user, { action: 'intervention.decided', entityType: 'intervention', entityId: id, summary: `Set intervention ${id} to ${decision}`, details: { before: was, after: decision } });
    return { intervention: ivShape(item) };
  });
}

/* ---------- Insights ---------- */
function windowFor(period, today) {
  const from = period === '4w' ? clock.addDays(today, -27) : period === '3m' ? clock.addDays(clock.addMonths(today, -3), 1) : clock.addDays(clock.addMonths(today, -12), 1);
  return { from, to: today };
}
function compareWindow(cmp, w) {
  if (cmp === 'none') return null;
  if (cmp === 'year') return { from: clock.addMonths(w.from, -12), to: clock.addMonths(w.to, -12) };
  const len = clock.diffDays(w.from, w.to) + 1;
  return { from: clock.addDays(w.from, -len), to: clock.addDays(w.from, -1) };
}
const slotOf = hhmm => (hourOf(hhmm) < 12 ? 'am' : hourOf(hhmm) < 17 ? 'pm' : 'eve');
const beltGroup = rankId => (['6k', '5k'].includes(rankId) ? 'beg' : ['4k', '3k'].includes(rankId) ? 'mid' : 'adv');
function cohortRows(rows, today) {
  return rows.map(r => {
    const [y, m] = r.ym.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate(), end = `${r.ym}-${String(last).padStart(2, '0')}`;
    return { month: r.ym, label: monthLabel(r.ym), joined: r.joined, kept: clock.addDays(end, 90) <= today ? r.kept : null };
  });
}
async function insights(q) {
  const today = clock.today(), w = windowFor(q.period, today), cw = compareWindow(q.cmp, w);
  const [slots, cmpSlots, members, cohorts, reasons, feedback, policies, ivRaw] = await Promise.all([
    slotsIn(w.from, w.to), cw ? slotsIn(cw.from, cw.to) : Promise.resolve([]), reportModel.members(today), reportModel.cohorts(monthStart(clock.addMonths(today, -11))),
    reportModel.notReturning(), reportModel.feedbackRows(w.from, w.to), policyModel.getAll(), policyModel.getOne('interventions')
  ]);
  const wanted = s => (q.centre === 'all' || s.dojoId === q.centre) && (q.type === 'all' || s.type === q.type) && (q.slot === 'all' || slotOf(s.time) === q.slot)
    && (q.age === 'all' || (q.age === 'kids') === !!s.kids);
  const shown = slots.filter(wanted);
  const cmpShown = cmpSlots.filter(wanted);
  const mems = members.filter(m => (q.centre === 'all' || m.dojo_id === q.centre) && (q.belt === 'all' || beltGroup(m.rank_id) === q.belt) && (q.age === 'all' || (q.age === 'kids') === (m.age_group === 'Child')));
  const cur = byDojo(shown), prev = byDojo(cmpShown), memCount = new Map();
  mems.forEach(m => memCount.set(m.dojo_id, (memCount.get(m.dojo_id) || 0) + 1));
  const centres = [...cur.values()].map(c => ({ id: c.id, name: c.name, classes: c.classes, occupancy: occOf(c) || 0, members: memCount.get(c.id) || 0, delta: cw ? deltaPts(occOf(c), occOf(prev.get(c.id))) : null }))
    .sort((a, b) => b.occupancy - a.occupancy);
  const declineDays = policies.follow_decline_days || 14;
  const seen = m => clock.diffDays(m.last_seen || m.joined_on, today);
  const risk = {
    lapsed: mems.filter(m => m.account_status === 'Lapsed').length,
    notSeen: mems.filter(m => seen(m) >= declineDays).length,
    expiring: mems.filter(m => m.membership_expiry && clock.diffDays(today, m.membership_expiry) >= 0 && clock.diffDays(today, m.membership_expiry) <= 14).length,
    declineDays
  };
  const keep = new Set(shown.map(s => s.id));
  const typeAgg = new Map(), insAgg = new Map();
  for (const f of feedback) {
    if (!f.template_id || !keep.has(f.template_id)) continue;
    const t = typeAgg.get(f.class_type) || []; t.push(f.rating); typeAgg.set(f.class_type, t);
    const i = insAgg.get(f.instructor_name) || { ratings: [], tags: new Map() }; i.ratings.push(f.rating);
    (f.tags || []).forEach(tag => i.tags.set(tag, (i.tags.get(tag) || 0) + 1)); insAgg.set(f.instructor_name, i);
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const experience = {
    byType: [...typeAgg].map(([type, r]) => ({ type, avg: round1(avg(r)), n: r.length })).sort((a, b) => b.avg - a.avg),
    byInstructor: [...insAgg].map(([ins, i]) => ({ ins, n: i.ratings.length, avg: round1(avg(i.ratings)), tag: ([...i.tags].sort((a, b) => b[1] - a[1])[0] || ['—'])[0] })).sort((a, b) => b.avg - a.avg)
  };
  return {
    period: q.period, cmp: q.cmp, from: w.from, to: w.to, compareFrom: cw ? cw.from : null, compareTo: cw ? cw.to : null,
    types: [...new Set(slots.map(s => s.type))].sort(), slots: shown, centres, risk, cohorts: cohortRows(cohorts, today), experience,
    reasons: reasons.map(r => ({ name: r.full_name, note: r.note || '', at: r.attempted_at })), interventions: parseList(ivRaw).map(ivShape)
  };
}

/* ---------- Revenue ---------- */
async function revenue({ from, to }) {
  const today = clock.today(), start = from || monthStart(today), end = to || today;
  if (end < start) throw badRequest('The last day is before the first day.', 'INVALID_RANGE');
  if (clock.diffDays(start, end) > 366) throw badRequest('Choose a range of at most one year.', 'INVALID_RANGE');
  const [paid, status, owed, failed, refunds] = await Promise.all([
    reportModel.paidIn(start, end, TZ), reportModel.byStatus(start, end, TZ), reportModel.outstanding(), reportModel.failedList(TZ), reportModel.refundsIn(start, end, TZ)
  ]);
  const groups = new Map(), days = new Map();
  for (const p of paid) {
    const g = groups.get(p.grp) || { group: p.grp, count: 0, amount: 0 }; g.count += 1; g.amount += p.amount; groups.set(p.grp, g);
    days.set(p.day, (days.get(p.day) || 0) + p.amount);
  }
  const cents = n => Math.round(n * 100) / 100;
  return {
    from: start, to: end, total: cents(paid.reduce((s, p) => s + p.amount, 0)), count: paid.length,
    items: [...groups.values()].map(g => ({ ...g, amount: cents(g.amount) })).sort((a, b) => b.amount - a.amount),
    byDay: [...days].map(([day, amount]) => ({ day, amount: cents(amount) })).sort((a, b) => a.day.localeCompare(b.day)),
    byStatus: Object.fromEntries(status.map(s => [s.status, { count: s.n, amount: s.amount }])),
    outstanding: { count: owed.n, amount: owed.amount },
    failed: { count: failed.length, amount: cents(failed.reduce((s, f) => s + f.amount, 0)), rows: failed.map(f => ({ id: f.id, memberNo: f.member_no, name: f.full_name, item: f.item, amount: f.amount, date: f.created_at, channel: f.channel })) },
    refunds: { approved: { count: refunds.approved_n, amount: refunds.approved_amount }, pending: { count: refunds.pending_n, amount: refunds.pending_amount } }
  };
}

/* ---------- Reports ---------- */
const KINDS = ['attendance', 'progression', 'payments', 'followups'];
const HEAD = {
  attendance: ['Date', 'Class', 'Time', 'Centre', 'Instructor', 'Booked', 'Capacity', 'Present'],
  progression: ['Name', 'Member no.', 'Grade', 'Centre', 'Sessions', 'Needed', 'Status'],
  payments: ['Member', 'Member no.', 'Item', 'Date', 'Amount', 'Method', 'Status', 'Invoice'],
  followups: ['Member', 'Member no.', 'Kind', 'Date', 'Method', 'Outcome', 'Note', 'By']
};
function rangeOf({ from, to }) {
  const today = clock.today(), end = to || today, start = from || clock.addMonths(end, -6);
  if (end < start) throw badRequest('The last day is before the first day.', 'INVALID_RANGE');
  if (clock.diffDays(start, end) > 366) throw badRequest('Choose a range of at most one year.', 'INVALID_RANGE');
  return { from: start, to: end, today };
}
/* [header, ...rows] for one report */
async function reportRows(kind, q) {
  const r = rangeOf(q), dojo = q.centre && q.centre !== 'all' ? q.centre : null;
  if (dojo && !(await referenceModel.listDojos()).some(d => d.id === dojo)) throw notFound('That centre does not exist.', 'INVALID_DOJO');
  let rows;
  if (kind === 'attendance') {
    rows = (await reportModel.attendanceRows(r.from, r.to, dojo)).map(s => [s.day, s.class_type, s.start_time, s.dojo_name, s.instructor_name, s.booked, s.capacity,
      s.status === 'Cancelled' ? 'Cancelled' : s.status === 'Ended' || s.day < r.today ? s.present : '']);
  } else if (kind === 'progression') {
    rows = (await reportModel.members(r.today)).filter(m => !dojo || m.dojo_id === dojo).map(m => {
      const need = rules.NEED_SESSIONS[m.rank_id], done = Math.floor(Number(m.accumulated_hours));
      return [m.full_name, m.member_no, m.rank_name, m.dojo_name, done, need || '', need ? (done >= need ? 'Enough sessions' : 'In progress') : 'Top grade'];
    });
  } else if (kind === 'payments') {
    rows = (await reportModel.paymentRows(r.from, r.to, TZ, dojo)).map(p => [p.full_name, p.member_no, p.item, p.day, p.amount, p.method, p.status, p.invoice_no]);
  } else {
    rows = (await reportModel.followupRows(r.from, r.to, TZ, dojo)).map(a => [a.full_name, a.member_no, a.kind, a.day, a.method, a.outcome, a.note || '', a.owner_name || '']);
  }
  return { header: HEAD[kind], rows, range: r };
}
async function reports(q) {
  const out = {};
  const r = rangeOf(q);
  for (const k of KINDS) out[k] = (await reportRows(k, q)).rows.length;
  return { from: r.from, to: r.to, centre: q.centre || 'all', counts: out };
}
async function reportCsv(kind, q) {
  const { header, rows, range } = await reportRows(kind, q);
  const [y, m] = range.today.split('-');
  return { filename: `${kind}-${MON[Number(m) - 1].toLowerCase()}-${y}.csv`, csv: toCsv([header, ...rows]), rows: rows.length };
}
module.exports = { overview, insights, revenue, reports, reportCsv, reportRows, addIntervention, decideIntervention, KINDS };
