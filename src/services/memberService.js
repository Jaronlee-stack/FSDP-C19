'use strict';
/* Members for the office: the list with filters, the member record, contact edits (both admin types), rank / status / dojo changes and the CSV export
   (Business Admin only: also checked here, not only on the route). Never returns password_hash. */
const config = require('../config');
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { toCsv } = require('../utils/csv');
const { notFound, forbidden, conflict, badRequest } = require('../utils/errors');
const memberModel = require('../models/memberModel');
const userModel = require('../models/userModel');
const followupModel = require('../models/followupModel');
const sentLogModel = require('../models/sentLogModel');
const { nextId } = require('../models/ids');
const deskService = require('./deskService');
const mcService = require('./mcService');
const gradingRules = require('./gradingRules');
const auditService = require('./auditService');

const isBA = user => user.adminType === 'business';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = ymd => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;

function memberShape(m, today) {
  const seen = m.last_seen ? clock.diffDays(m.last_seen, today) : null;
  const expiring = m.account_status === 'Active' && !!m.pkg_exp && (m.pkg_left > 0 || !!m.unl_until) && clock.diffDays(today, m.pkg_exp) >= 0 && clock.diffDays(today, m.pkg_exp) <= 14;
  return {
    userId: m.user_id, memberNo: m.member_no, name: m.full_name, rankId: m.rank_id, rank: m.rank_name, dojoId: m.dojo_id, dojo: m.dojo_name, hours: m.total_accumulated_hours,
    status: m.account_status, joinedOn: m.joined_on, source: m.source, kind: m.age_group === 'Child' ? 'child' : 'adult', gender: m.gender, dob: m.dob, phone: m.contact_no, email: m.email,
    guardian: m.guardian_name, lastSeen: m.last_seen, seenDays: seen, left: m.pkg_left, expires: m.pkg_exp, unlimitedUntil: m.unl_until, owed: m.owed, expiring,
    membershipExpiry: m.membership_expiry, nsf: m.discount_type === 'nsf'
  };
}

async function list(user, f) {
  const today = clock.today();
  if (f.filter === 'guests') {
    const q = (f.q || '').toLowerCase();
    const all = await deskService.listGuests();
    const guests = all.filter(g => !q || [g.name, g.mobile, g.email].some(v => v && String(v).toLowerCase().includes(q)));
    const counts = await memberModel.filterCounts(today);
    return { guests, rows: [], total: guests.length, counts: { ...counts, guests: all.length }, totals: { all: counts.all, active: counts.active, guests: all.length } };
  }
  const [res, counts, guests] = await Promise.all([memberModel.list({ today, ...f }), memberModel.filterCounts(today), deskService.listGuests()]);
  return { rows: res.rows.map(m => memberShape(m, today)), total: res.total, counts: { ...counts, guests: guests.length }, totals: { all: counts.all, active: counts.active, guests: guests.length } };
}

async function record(user, memberNo) {
  const today = clock.today();
  const m = await memberModel.findByMemberNo(memberNo, today);
  if (!m) throw notFound('No member has that number.', 'MEMBER_NOT_FOUND');
  const [packs, pays, refunds, hist, mcs, equip, fus, mcAll] = await Promise.all([
    memberModel.packages(m.user_id), memberModel.payments(m.user_id, config.APP_TZ), memberModel.refunds(m.user_id), memberModel.classHistory(m.user_id, 60),
    memberModel.mcRequests(m.user_id), memberModel.equipment(m.user_id), followupModel.list(), mcService.list()
  ]);
  const mine = fus.filter(f => f.user_id === m.user_id);
  const attempts = mine.length ? await followupModel.attempts(mine.map(f => f.id)) : [];
  const ledger = pays.filter(p => isBA(user) || p.status !== 'Failed').map(p => ({
    id: p.id, invoice: p.invoice_no, item: p.item, kind: p.kind, amount: p.amount, method: p.method, status: p.status, channel: p.channel, date: p.paid_at || p.created_at, day: p.day, note: p.note
  }));
  const need = gradingRules.NEED_SESSIONS[m.rank_id] || null;
  return {
    member: { ...memberShape(m, today), emergencyContact: m.emergency_contact, guardianContact: m.guardian_contact, medical: m.medical_notes, lastRenewedAt: m.last_renewed_at, hoursTotal: m.total_accumulated_hours },
    progress: { sessions: Math.floor(m.accumulated_hours), needSessions: need, nextRank: (await memberModel.nextRankName(m.rank_id)) },
    packages: packs.map(p => ({ id: p.id, name: p.name, total: p.lessons_total, left: p.lessons_left, bought: p.purchased_at, expires: p.expires_at, status: p.status, unlimited: p.unlimited })),
    payments: ledger,
    refunds: refunds.map(r => ({ id: r.id, paymentId: r.payment_id, amount: r.amount, reason: r.reason, status: r.status, item: r.item, by: r.requested_by_name, at: r.requested_at })),
    classes: hist.map(h => ({ lessonId: h.lesson_id, date: h.session_date, time: h.start_time, type: h.class_type, how: { online: 'Online', desk: 'Desk', 'walk-in': 'Walk-in', waitlist: 'Waitlist offer' }[h.booked_via] || 'Online', status: { Booked: 'booked', Attended: 'present', 'No-Show': 'noshow' }[h.attendance_status] || 'booked' })),
    mcs: mcs.map(c => ({ id: c.id, kind: c.kind, days: c.days_requested, file: c.document_ref, status: c.status === 'declined' ? 'rejected' : c.status, at: c.requested_at })),
    extensions: mcAll.filter(r => r.userId === m.user_id),
    equipment: equip.map(e => ({ id: e.id, item: e.item, size: e.size, paid: e.paid, status: e.status, at: e.requested_at, collectedBy: e.handed_over_to })),
    followups: mine.map(f => ({ id: f.id, kind: f.kind, due: f.due_date, status: f.status, ownerName: f.owner_name, attempts: attempts.filter(a => a.followup_id === f.id).map(a => ({ at: a.attempted_at, method: a.method, outcome: a.outcome, note: a.note })) })),
    paymentStats: { owed: m.owed }
  };
}

async function patch(user, memberNo, body) {
  return withTx(async tx => {
    const today = clock.today();
    const m = await memberModel.findByMemberNo(memberNo, today, tx);
    if (!m) throw notFound('No member has that number.', 'MEMBER_NOT_FOUND');
    const touchesBA = body.rankId !== undefined || body.accountStatus !== undefined || body.dojoId !== undefined;
    if (touchesBA && !isBA(user)) throw forbidden('Only a Business Admin can change a belt, membership status or dojo.', 'BUSINESS_ADMIN_ONLY');
    if (body.email !== undefined && body.email.toLowerCase() !== String(m.email).toLowerCase()) {
      const other = await userModel.findByEmail(body.email, tx);
      if (other && other.id !== m.user_id) throw conflict('That email is used by another account.', 'EMAIL_IN_USE');
      await userModel.updateEmail(m.user_id, body.email, tx);
    }
    await memberModel.updateContact(m.user_id, body, tx);
    if (body.rankId !== undefined) {
      if (!(await memberModel.rankExists(body.rankId, tx))) throw badRequest('That grade does not exist.', 'INVALID_RANK');
      await memberModel.setRank(m.user_id, body.rankId, tx);
    }
    if (body.dojoId !== undefined) {
      if (!(await memberModel.dojoExists(body.dojoId, tx))) throw badRequest('That dojo does not exist.', 'INVALID_DOJO');
      await memberModel.setDojo(m.user_id, body.dojoId, tx);
    }
    if (body.accountStatus !== undefined) await memberModel.setAccountStatus(m.user_id, body.accountStatus, tx);
    /* audit: field names only for personal data; before/after only for the non-personal fields */
    const fields = Object.keys(body).filter(k => k !== 'reason' && body[k] !== undefined);
    const others = fields.filter(k => k !== 'rankId');
    if (body.rankId !== undefined) {
      await auditService.record(tx, user, { action: 'member.belt_changed', entityType: 'member', entityId: memberNo, summary: `Changed the belt of ${m.full_name} (${memberNo}) from ${m.rank_id} to ${body.rankId}`,
        details: { userId: m.user_id, before: m.rank_id, after: body.rankId, reason: body.reason || null } });
    }
    if (others.length) {
      const details = { userId: m.user_id, fields: others, reason: body.reason || null };
      if (body.accountStatus !== undefined) details.status = { before: m.account_status, after: body.accountStatus };
      if (body.dojoId !== undefined) details.dojo = { before: m.dojo_id, after: body.dojoId };
      await auditService.record(tx, user, { action: 'member.updated', entityType: 'member', entityId: memberNo, summary: `Updated ${m.full_name} (${memberNo}): ${others.join(', ')}`, details });
    }
    return { member: memberShape(await memberModel.findByMemberNo(memberNo, today, tx), today) };
  });
}

/* a message shown in the student's notifications: only the sent_log row is written (no email or SMS is sent) */
async function message(user, memberNo, { body }) {
  return withTx(async tx => {
    const m = await memberModel.findByMemberNo(memberNo, clock.today(), tx);
    if (!m) throw notFound('No member has that number.', 'MEMBER_NOT_FOUND');
    const id = await nextId(tx, 'sent_log', 'id', 'SL-', 2);
    await sentLogModel.insert({ id, at: clock.now(), sentBy: user.id, audience: m.full_name, title: body.slice(0, 60) }, tx);
    await auditService.record(tx, user, { action: 'member.message_sent', entityType: 'member', entityId: memberNo, summary: `Sent a message to ${m.full_name} (${memberNo})`, details: { sentLogId: id, titleLength: Math.min(body.length, 60) } });
    return { id };
  });
}

const packageText = m => (m.unl_until ? `Unlimited · until ${fmtShort(m.unl_until)}` : m.pkg_left > 0 ? `${m.pkg_left} lessons left${m.pkg_exp ? ' · to ' + fmtShort(m.pkg_exp) : ''}` : 'No active package');
async function exportCsv(user) {
  if (!isBA(user)) throw forbidden('Only a Business Admin can export members.', 'BUSINESS_ADMIN_ONLY');
  const today = clock.today();
  const rows = await memberModel.exportRows(today);
  const head = ['Name', 'Member no.', 'Belt', 'Centre', 'Package', 'Membership', 'Source', 'Joined', 'Mobile', 'Email', 'Last seen'];
  const csv = toCsv([head].concat(rows.map(m => [m.full_name, m.member_no, m.rank_name, m.dojo_name, packageText(m), m.account_status, m.source, m.joined_on, m.contact_no, m.email, m.last_seen || ''])));
  return { filename: `members-${today}.csv`, csv };
}
module.exports = { list, record, patch, message, exportCsv, memberShape };
