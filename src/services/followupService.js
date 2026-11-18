'use strict';
/* Follow-ups: students worth a call (declining attendance, renewals coming up, newcomers who have not returned), who owns the call and what came of it.
   The lists come from the data (attendance, packages, dues); a follow-up row appears once somebody is assigned or a contact is logged.
   The front desk logs contacts; a Business Admin creates lists and assigns owners. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict } = require('../utils/errors');
const followupModel = require('../models/followupModel');
const memberModel = require('../models/memberModel');
const staffModel = require('../models/staffModel');
const policyModel = require('../models/policyModel');
const { nextId } = require('../models/ids');
const auditService = require('./auditService');

const KINDS = ['newcomer', 'declining', 'renewal'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = ymd => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const money = n => `S$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const triggers = async db => { const p = await policyModel.getAll(db); return { declineDays: p.follow_decline_days || 14, renewalDays: p.follow_renewal_days || 30 }; };

/* days since the last visit, or since joining when the student never came */
const seenDays = (m, today) => (m.last_seen ? clock.diffDays(m.last_seen, today) : null);
function reasonOf(kind, m, today) {
  if (kind === 'declining') return m.last_seen ? `No visit for ${plural(seenDays(m, today), 'day')}` : 'Has not visited yet';
  if (kind === 'newcomer') return `Joined ${fmtShort(m.joined_on)}, ${m.last_seen ? `not seen for ${plural(seenDays(m, today), 'day')}` : 'has not visited yet'}`;
  return m.owed > 0 ? `Dues ${money(m.owed)} unpaid` : m.pkg_exp ? `Package ends ${fmtShort(m.pkg_exp)}` : 'Renewal due';
}

async function overview() {
  const today = clock.today(), t = await triggers();
  const [rows, staff] = await Promise.all([followupModel.list(), staffModel.listActive()]);
  const attempts = rows.length ? await followupModel.attempts(rows.map(r => r.id)) : [];
  const byFu = id => attempts.filter(a => a.followup_id === id).map(a => ({ at: a.attempted_at, method: a.method, outcome: a.outcome, note: a.note }));
  const fuShape = f => ({ id: f.id, ownerId: f.owner_id, ownerName: f.owner_name, due: f.due_date, status: f.status, attempts: byFu(f.id) });
  const items = [];
  for (const kind of KINDS) {
    const cands = await followupModel.candidates(kind, today, kind === 'renewal' ? t.renewalDays : t.declineDays);
    const existing = rows.filter(f => f.kind === kind && f.status === 'open');
    const seen = new Set();
    for (const c of cands) {
      seen.add(c.user_id);
      const f = existing.find(x => x.user_id === c.user_id);
      items.push({ kind, userId: c.user_id, memberNo: c.member_no, name: c.full_name, phone: c.contact_no, lastSeen: c.last_seen, seenDays: seenDays(c, today), reason: reasonOf(kind, c, today), followup: f ? fuShape(f) : null });
    }
    const extra = existing.filter(f => !seen.has(f.user_id));
    const stats = extra.length ? await memberModel.statsByIds(extra.map(f => f.user_id), today) : [];
    for (const f of extra) {
      const m = stats.find(s => s.user_id === f.user_id);
      if (m) items.push({ kind, userId: m.user_id, memberNo: m.member_no, name: m.full_name, phone: m.contact_no, lastSeen: m.last_seen, seenDays: seenDays(m, today), reason: reasonOf(kind, m, today), followup: fuShape(f) });
    }
  }
  const outcomes = rows.filter(f => byFu(f.id).length).map(f => { const a = byFu(f.id); const last = a[a.length - 1]; return { followupId: f.id, memberNo: f.member_no, name: f.full_name, kind: f.kind, attempts: a.length, last }; });
  return { today, triggers: t, staff: staff.map(s => ({ id: s.user_id, name: s.full_name, type: s.admin_type })), items, outcomes };
}

async function assertOwner(ownerId, tx) {
  if (!ownerId) return;
  const s = await staffModel.find(ownerId, tx);
  if (!s || s.status !== 'active') throw notFound('That staff member is not available.', 'STAFF_NOT_FOUND');
}
/* Business Admin: one student, or (without memberNo) every student on a list who has no follow-up yet */
async function create(user, { memberNo, kind, ownerId, dueDate }) {
  return withTx(async tx => {
    const today = clock.today();
    await assertOwner(ownerId, tx);
    let targets;
    if (memberNo) {
      const st = await memberModel.findByMemberNo(memberNo, today, tx);
      if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
      if (await followupModel.findOpen(st.user_id, kind, tx)) throw conflict('This student already has an open follow-up of that kind.', 'FOLLOWUP_EXISTS');
      targets = [st.user_id];
    } else {
      const t = await triggers(tx);
      const cands = await followupModel.candidates(kind, today, kind === 'renewal' ? t.renewalDays : t.declineDays, tx);
      targets = [];
      for (const c of cands) if (!(await followupModel.findOpen(c.user_id, kind, tx))) targets.push(c.user_id);
    }
    const ids = [];
    for (const userId of targets) {
      const id = await nextId(tx, 'followup', 'id', 'F-', 2);
      await followupModel.insert({ id, userId, kind, ownerId: ownerId || null, dueDate }, tx);
      ids.push(id);
    }
    await auditService.record(tx, user, { action: 'followup.created', entityType: 'followup', entityId: ids.length === 1 ? ids[0] : null, summary: `Created ${ids.length} ${kind} follow-up${ids.length === 1 ? '' : 's'}`,
      details: { kind, count: ids.length, ids: ids.slice(0, 20), ownerId: ownerId || null, dueDate, memberNo: memberNo || null } });
    return { created: ids.length, ids };
  });
}
async function update(user, id, body) {
  return withTx(async tx => {
    const f = await followupModel.get(id, tx, true);
    if (!f) throw notFound('That follow-up was not found.', 'FOLLOWUP_NOT_FOUND');
    if (body.ownerId) await assertOwner(body.ownerId, tx);
    await followupModel.update(id, body, tx);
    await auditService.record(tx, user, { action: 'followup.updated', entityType: 'followup', entityId: id, summary: `Updated follow-up ${id}`,
      details: { fields: Object.keys(body).filter(k => body[k] !== undefined), status: body.status ? { before: f.status, after: body.status } : undefined, ownerId: body.ownerId !== undefined ? { before: f.owner_id, after: body.ownerId } : undefined } });
    return { followup: { id, ownerId: body.ownerId === undefined ? f.owner_id : body.ownerId, due: body.dueDate || f.due_date, status: body.status || f.status } };
  });
}
async function addAttempt(user, id, { method, outcome, note, nextDate }) {
  return withTx(async tx => {
    const f = await followupModel.get(id, tx, true);
    if (!f) throw notFound('That follow-up was not found.', 'FOLLOWUP_NOT_FOUND');
    const aid = await nextId(tx, 'followup_attempt', 'id', 'FA-', 2);
    await followupModel.insertAttempt({ id: aid, followupId: id, at: clock.now(), method, outcome, note }, tx);
    if (nextDate) await followupModel.update(id, { dueDate: nextDate }, tx);
    await auditService.record(tx, user, { action: 'followup.attempt_logged', entityType: 'followup', entityId: id, summary: `Logged a ${method} attempt on follow-up ${id}`, details: { attemptId: aid, method, kind: f.kind } });
    return { attemptId: aid };
  });
}
/* the student record's "Log contact": uses the student's open follow-up, or starts one owned by the person logging it */
async function logContact(user, memberNo, { kind, method, outcome, note, nextDate }) {
  return withTx(async tx => {
    const today = clock.today();
    const st = await memberModel.findByMemberNo(memberNo, today, tx);
    if (!st) throw notFound('No student has that member number.', 'MEMBER_NOT_FOUND');
    let f = await followupModel.findOpen(st.user_id, kind || null, tx);
    let id = f && f.id;
    if (!id) {
      id = await nextId(tx, 'followup', 'id', 'F-', 2);
      await followupModel.insert({ id, userId: st.user_id, kind: kind || 'declining', ownerId: user.id, dueDate: nextDate || clock.addDays(today, 3) }, tx);
    }
    const aid = await nextId(tx, 'followup_attempt', 'id', 'FA-', 2);
    await followupModel.insertAttempt({ id: aid, followupId: id, at: clock.now(), method, outcome, note }, tx);
    if (nextDate) await followupModel.update(id, { dueDate: nextDate }, tx);
    await auditService.record(tx, user, { action: 'followup.contact_logged', entityType: 'member', entityId: memberNo, summary: `Logged a ${method} contact with ${st.full_name} (${memberNo})`,
      details: { followupId: id, attemptId: aid, method, kind: kind || null, newFollowup: !f } });
    return { followupId: id, attemptId: aid };
  });
}
module.exports = { overview, create, update, addAttempt, logContact, KINDS };
