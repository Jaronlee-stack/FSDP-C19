'use strict';
/* Admin view of students: the members list (search, filters, whitelist sort), the figures a desk needs on each member, and the member record.
   Never selects password_hash. Every value that comes from a person is a bound parameter; the search uses ILIKE with the wildcards escaped. */
const { query } = require('../config/db');

/* one row per student with the figures the desk shows. $1 = today ('YYYY-MM-DD'). */
const STATS_SQL = `
  SELECT sp.user_id, sp.member_no, sp.full_name, sp.dob, sp.joined_on, sp.gender, sp.age_group, sp.contact_no, sp.dojo_id, sp.rank_id, sp.source,
         sp.total_accumulated_hours, sp.accumulated_hours, sp.guardian_name, sp.discount_type, sp.emergency_contact, sp.guardian_contact, sp.medical_notes,
         u.email, br.name AS rank_name, br.sort_order AS rank_order, d.name AS dojo_name, d.short_name AS dojo_short,
         m.account_status, m.membership_expiry, m.last_renewed_at,
         (SELECT max(s.session_date) FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
           WHERE a.user_id = sp.user_id AND a.attendance_status = 'Attended') AS last_seen,
         COALESCE((SELECT sum(p.amount) FROM payment p WHERE p.user_id = sp.user_id AND p.status = 'Outstanding'), 0)::float AS owed,
         COALESCE((SELECT sum(x.lessons_left) FROM student_package x WHERE x.user_id = sp.user_id AND x.status = 'Active' AND x.expires_at >= $1::date AND x.lessons_left IS NOT NULL), 0)::int AS pkg_left,
         (SELECT min(x.expires_at) FROM student_package x WHERE x.user_id = sp.user_id AND x.status = 'Active' AND x.expires_at >= $1::date) AS pkg_exp,
         (SELECT max(x.expires_at) FROM student_package x WHERE x.user_id = sp.user_id AND x.status = 'Active' AND x.expires_at >= $1::date AND x.lessons_total IS NULL) AS unl_until
    FROM student_profile sp
    JOIN users u ON u.id = sp.user_id
    JOIN belt_rank br ON br.id = sp.rank_id
    JOIN dojo d ON d.id = sp.dojo_id
    LEFT JOIN membership m ON m.user_id = sp.user_id`;

const SORTS = {
  name: 't.full_name, t.member_no', no: 't.member_no', joined: 't.joined_on DESC, t.full_name', rank: 't.rank_order DESC, t.full_name',
  seen: 't.last_seen DESC NULLS LAST, t.full_name', hours: 't.total_accumulated_hours DESC, t.full_name'
};
/* the quick filters of the Members page */
const FILTERS = {
  all: 'TRUE', active: `t.account_status = 'Active'`, lapsed: `t.account_status = 'Lapsed'`,
  expiring: `(t.account_status = 'Active' AND t.pkg_exp IS NOT NULL AND (t.pkg_left > 0 OR t.unl_until IS NOT NULL) AND t.pkg_exp <= ($1::date + 14))`,
  owing: 't.owed > 0', new: `(t.joined_on >= ($1::date - 90))`
};
const escLike = s => s.replace(/[\\%_]/g, '\\$&');

async function list({ today, q, status, dojo, rank, source, filter = 'all', sort = 'name', page = 1, pageSize = 100 }, db) {
  const params = [today], where = [FILTERS[filter] || 'TRUE'];
  const bind = v => { params.push(v); return `$${params.length}`; };
  if (q) {
    const p = bind('%' + escLike(q) + '%');
    where.push(`(t.full_name ILIKE ${p} ESCAPE '\\' OR t.member_no ILIKE ${p} ESCAPE '\\' OR t.contact_no ILIKE ${p} ESCAPE '\\' OR t.email ILIKE ${p} ESCAPE '\\' OR COALESCE(t.guardian_name, '') ILIKE ${p} ESCAPE '\\')`);
  }
  if (status) where.push(`t.account_status = ${bind(status)}`);
  if (dojo) where.push(`t.dojo_id = ${bind(dojo)}`);
  if (rank) where.push(`t.rank_id = ${bind(rank)}`);
  if (source) where.push(`t.source = ${bind(source)}`);
  const limit = bind(pageSize), offset = bind((page - 1) * pageSize);
  const r = await query(
    `SELECT t.*, count(*) OVER ()::int AS total FROM (${STATS_SQL}) t WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sort] || SORTS.name} LIMIT ${limit} OFFSET ${offset}`, params, db);
  return { rows: r.rows, total: r.rows.length ? r.rows[0].total : 0 };
}
/* how many members each quick filter matches (the pills ignore the search box) */
async function filterCounts(today, db) {
  const r = await query(
    `SELECT ${Object.entries(FILTERS).map(([k, w]) => `count(*) FILTER (WHERE ${w})::int AS "${k}"`).join(', ')} FROM (${STATS_SQL}) t`, [today], db);
  return r.rows[0];
}
const findByMemberNo = (memberNo, today, db) => query(
  `SELECT t.* FROM (${STATS_SQL}) t WHERE upper(t.member_no) = upper($2)`, [today, memberNo], db).then(r => r.rows[0] || null);
/* the stats of several people at once (roster access checks) */
const statsByIds = (ids, today, db) => query(
  `SELECT t.* FROM (${STATS_SQL}) t WHERE t.user_id = ANY($2::text[])`, [today, ids], db).then(r => r.rows);
const countAll = db => query(`SELECT count(*)::int AS n FROM student_profile`, [], db).then(r => r.rows[0].n);

/* ---------- pieces of the member record ---------- */
const packages = (userId, db) => query(
  `SELECT sp.id, sp.package_id, pd.name, sp.lessons_total, sp.lessons_left, sp.purchased_at, sp.expires_at, sp.status, pd.lessons IS NULL AS unlimited
     FROM student_package sp JOIN package_def pd ON pd.id = sp.package_id WHERE sp.user_id = $1 ORDER BY sp.purchased_at DESC, sp.id DESC`, [userId], db).then(r => r.rows);
const payments = (userId, tz, db) => query(
  `SELECT id, invoice_no, item, kind, amount, method, status, channel, created_at, paid_at, note, to_char(COALESCE(paid_at, created_at) AT TIME ZONE $2, 'YYYY-MM-DD') AS day
     FROM payment WHERE user_id = $1 ORDER BY COALESCE(paid_at, created_at) DESC, id DESC`, [userId, tz], db).then(r => r.rows);
const refunds = (userId, db) => query(
  `SELECT r.id, r.payment_id, r.amount, r.reason, r.status, r.requested_at, r.decided_at, st.full_name AS requested_by_name, p.item
     FROM refund_request r JOIN payment p ON p.id = r.payment_id LEFT JOIN staff_profile st ON st.user_id = r.requested_by
    WHERE r.user_id = $1 ORDER BY r.requested_at DESC, r.id DESC`, [userId], db).then(r => r.rows);
/* the last classes (any status except Cancelled) and the bookings still to come */
const classHistory = (userId, limit, db) => query(
  `SELECT a.lesson_id, a.attendance_status, a.booked_via, a.remarks, s.session_date, to_char(s.start_time, 'HH24:MI') AS start_time, s.class_type, s.status AS session_status
     FROM class_attendance a JOIN class_session s ON s.lesson_id = a.lesson_id
    WHERE a.user_id = $1 AND a.attendance_status <> 'Cancelled'
    ORDER BY s.session_date DESC, s.start_time DESC LIMIT $2`, [userId, limit], db).then(r => r.rows);
const mcRequests = (userId, db) => query(
  `SELECT m.id, m.kind, m.days_requested, m.days_granted, m.document_ref, m.status, m.requested_at
     FROM mc_request m WHERE m.user_id = $1 ORDER BY m.requested_at DESC, m.id DESC`, [userId], db).then(r => r.rows);
const equipment = (userId, db) => query(
  `SELECT id, item, size, paid, status, requested_at, handed_over_at, handed_over_to FROM equipment_order WHERE user_id = $1 ORDER BY requested_at DESC, id DESC`, [userId], db).then(r => r.rows);

/* ---------- edits ---------- */
const CONTACT = { phone: 'contact_no', emergencyContact: 'emergency_contact', guardianName: 'guardian_name', guardianContact: 'guardian_contact', medicalNotes: 'medical_notes' };
async function updateContact(userId, fields, db) {
  const sets = [], params = [userId];
  for (const [k, col] of Object.entries(CONTACT)) {
    if (fields[k] === undefined) continue;
    params.push(fields[k]);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length) await query(`UPDATE student_profile SET ${sets.join(', ')} WHERE user_id = $1`, params, db);
}
const setRank = (userId, rankId, db) => query(`UPDATE student_profile SET rank_id = $2 WHERE user_id = $1`, [userId, rankId], db);
const setDojo = (userId, dojoId, db) => query(`UPDATE student_profile SET dojo_id = $2 WHERE user_id = $1`, [userId, dojoId], db);
const setAccountStatus = (userId, status, db) => query(`UPDATE membership SET account_status = $2 WHERE user_id = $1`, [userId, status], db);
/* annual dues paid: the membership runs a year from today (or from its current end when that is later) */
const renewMembership = (userId, expiry, today, db) => query(
  `UPDATE membership SET membership_expiry = $2, account_status = 'Active', last_renewed_at = $3 WHERE user_id = $1`, [userId, expiry, today], db);
const nextRankName = (rankId, db) => query(
  `SELECT name FROM belt_rank WHERE sort_order = (SELECT sort_order + 1 FROM belt_rank WHERE id = $1)`, [rankId], db).then(r => (r.rows[0] ? r.rows[0].name : null));
const rankExists = (id, db) => query(`SELECT 1 FROM belt_rank WHERE id = $1`, [id], db).then(r => r.rowCount > 0);
const dojoExists = (id, db) => query(`SELECT 1 FROM dojo WHERE id = $1`, [id], db).then(r => r.rowCount > 0);

/* ---------- everything the CSV export needs (Business Admin) ---------- */
const exportRows = (today, db) => query(
  `SELECT t.member_no, t.full_name, t.rank_name, t.dojo_name, t.account_status, t.source, t.joined_on, t.contact_no, t.email, t.last_seen, t.pkg_left, t.pkg_exp, t.unl_until
     FROM (${STATS_SQL}) t ORDER BY t.full_name, t.member_no`, [today], db).then(r => r.rows);

module.exports = { STATS_SQL, list, filterCounts, findByMemberNo, statsByIds, countAll, packages, payments, refunds, classHistory, mcRequests, equipment,
  updateContact, setRank, setDojo, setAccountStatus, renewMembership, nextRankName, rankExists, dojoExists, exportRows };
