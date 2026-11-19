'use strict';
/* audit_log. Append-only: this model only inserts and reads (a database trigger refuses UPDATE, DELETE and TRUNCATE). */
const { query } = require('../config/db');
const config = require('../config');

const COLS = `id, occurred_at, actor_user_id, actor_name, actor_role, actor_admin_type, action, entity_type, entity_id, summary, details, ip, user_agent`;

const insert = (r, db) => query(
  `INSERT INTO audit_log (actor_user_id, actor_name, actor_role, actor_admin_type, action, entity_type, entity_id, summary, details, ip, user_agent)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
  [r.actorId, r.actorName, r.actorRole, r.actorAdminType, r.action, r.entityType, r.entityId, r.summary, JSON.stringify(r.details || {}), r.ip, r.userAgent], db);

const like = s => '%' + String(s).replace(/[\\%_]/g, c => '\\' + c) + '%';

/* WHERE clause + bound values for the filters. Every value is a bound parameter. */
function where(f) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (f.from) { p.push(f.from); p.push(config.APP_TZ); w.push(`occurred_at >= ($${p.length - 1}::date::timestamp AT TIME ZONE $${p.length})`); }
  if (f.to) { p.push(f.to); p.push(config.APP_TZ); w.push(`occurred_at < (($${p.length - 1}::date + 1)::timestamp AT TIME ZONE $${p.length})`); }
  if (f.actorId) add('actor_user_id = ?', f.actorId);
  if (f.group) add(`action LIKE ? || '.%'`, f.group);
  if (f.action) add('action = ?', f.action);
  if (f.entityType) add('entity_type = ?', f.entityType);
  if (f.entityId) add('entity_id = ?', f.entityId);
  if (f.q) { p.push(like(f.q)); const n = '$' + p.length; w.push(`(summary ILIKE ${n} OR action ILIKE ${n} OR actor_name ILIKE ${n} OR entity_id ILIKE ${n})`); }
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

/* one page of rows, newest first, with the total number of matches */
async function search(f, { limit, offset }, db) {
  const { sql, params } = where(f);
  const rows = await query(
    `SELECT ${COLS}, count(*) OVER()::int AS total FROM audit_log ${sql} ORDER BY occurred_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset], db).then(r => r.rows);
  if (rows.length) return { rows, total: rows[0].total };
  const total = await query(`SELECT count(*)::int AS n FROM audit_log ${sql}`, params, db).then(r => r.rows[0].n);
  return { rows: [], total };
}

const searchForExport = (f, limit, db) => {
  const { sql, params } = where(f);
  return query(`SELECT ${COLS} FROM audit_log ${sql} ORDER BY occurred_at DESC, id DESC LIMIT $${params.length + 1}`, [...params, limit], db).then(r => r.rows);
};

/* values for the filter drop-downs */
async function facets(db) {
  const [actors, groups, entities] = await Promise.all([
    query(`SELECT DISTINCT actor_user_id AS id, actor_name AS name FROM audit_log WHERE actor_user_id IS NOT NULL ORDER BY name, id`, [], db).then(r => r.rows),
    query(`SELECT DISTINCT split_part(action, '.', 1) AS g FROM audit_log ORDER BY g`, [], db).then(r => r.rows.map(x => x.g)),
    query(`SELECT DISTINCT entity_type AS t FROM audit_log WHERE entity_type IS NOT NULL ORDER BY t`, [], db).then(r => r.rows.map(x => x.t))
  ]);
  return { actors, groups, entityTypes: entities };
}

module.exports = { insert, search, searchForExport, facets };
