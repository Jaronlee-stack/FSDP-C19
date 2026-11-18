'use strict';
/* followup + followup_attempt, and the "who should we contact" candidate lists. $1 is always today. */
const { query } = require('../config/db');
const { STATS_SQL } = require('./memberModel');

const COLS = `f.id, f.user_id, sp.member_no, sp.full_name, sp.contact_no, f.kind, f.owner_id, o.full_name AS owner_name, f.due_date, f.status`;
const FROM = `FROM followup f JOIN student_profile sp ON sp.user_id = f.user_id LEFT JOIN staff_profile o ON o.user_id = f.owner_id`;
const list = db => query(`SELECT ${COLS} ${FROM} ORDER BY f.due_date, f.id`, [], db).then(r => r.rows);
const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE f.id = $1${lock ? ' FOR UPDATE OF f' : ''}`, [id], db).then(r => r.rows[0] || null);
const findOpen = (userId, kind, db) => query(
  `SELECT id, kind, owner_id FROM followup WHERE user_id = $1 AND status = 'open' ${kind ? 'AND kind = $2' : ''} ORDER BY due_date, id LIMIT 1`, kind ? [userId, kind] : [userId], db).then(r => r.rows[0] || null);
const attempts = (ids, db) => query(
  `SELECT id, followup_id, attempted_at, method, outcome, note FROM followup_attempt WHERE followup_id = ANY($1::text[]) ORDER BY attempted_at, id`, [ids], db).then(r => r.rows);
const insert = (f, db) => query(
  `INSERT INTO followup (id, user_id, kind, owner_id, due_date, status) VALUES ($1, $2, $3, $4, $5, 'open')`, [f.id, f.userId, f.kind, f.ownerId || null, f.dueDate], db);
async function update(id, f, db) {
  const sets = [], params = [id];
  const col = { ownerId: 'owner_id', dueDate: 'due_date', status: 'status' };
  for (const [k, c] of Object.entries(col)) { if (f[k] === undefined) continue; params.push(f[k]); sets.push(`${c} = $${params.length}`); }
  if (sets.length) await query(`UPDATE followup SET ${sets.join(', ')} WHERE id = $1`, params, db);
}
const insertAttempt = (a, db) => query(
  `INSERT INTO followup_attempt (id, followup_id, attempted_at, method, outcome, note) VALUES ($1, $2, $3, $4, $5, $6)`, [a.id, a.followupId, a.at, a.method, a.outcome, a.note || null], db);
/* open follow-ups due today or earlier (the Today page) */
const dueCount = (today, db) => query(`SELECT count(*)::int AS n FROM followup WHERE status = 'open' AND due_date <= $1::date`, [today], db).then(r => r.rows[0].n);
/* open follow-ups nobody has contacted yet (the bell) */
const untouchedCount = db => query(
  `SELECT count(*)::int AS n FROM followup f WHERE f.status = 'open' AND NOT EXISTS (SELECT 1 FROM followup_attempt a WHERE a.followup_id = f.id)`, [], db).then(r => r.rows[0].n);

/* the members worth a call, by list. $2 = decline days or renewal days. */
const CANDIDATES = {
  declining: `t.account_status = 'Active' AND COALESCE(($1::date - t.last_seen), ($1::date - t.joined_on)) >= $2`,
  renewal: `t.account_status = 'Active' AND ((t.pkg_exp IS NOT NULL AND t.pkg_exp <= ($1::date + $2::int)) OR t.owed > 0)`,
  newcomer: `t.account_status = 'Active' AND t.joined_on >= ($1::date - 90) AND COALESCE(($1::date - t.last_seen), ($1::date - t.joined_on)) >= 7`
};
const candidates = (kind, today, days, db) => {
  const where = CANDIDATES[kind];
  if (!where) return Promise.resolve([]);
  const params = kind === 'newcomer' ? [today] : [today, days];
  return query(`SELECT t.user_id, t.member_no, t.full_name, t.contact_no, t.joined_on, t.last_seen, t.owed, t.pkg_exp
                  FROM (${STATS_SQL}) t WHERE ${kind === 'newcomer' ? CANDIDATES.newcomer : where} ORDER BY t.full_name`, params, db).then(r => r.rows);
};
module.exports = { list, get, findOpen, attempts, insert, update, insertAttempt, dueCount, untouchedCount, candidates };
