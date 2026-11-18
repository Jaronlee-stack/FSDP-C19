'use strict';
/* policy_setting read access (booking rules, fees). Values come back typed. */
const { query } = require('../config/db');
async function getAll(db) {
  const r = await query(`SELECT setting_key, value_text, value_type FROM policy_setting`, [], db);
  const out = {};
  for (const x of r.rows) {
    out[x.setting_key] = x.value_type === 'int' ? parseInt(x.value_text, 10) : x.value_type === 'numeric' ? parseFloat(x.value_text) : x.value_type === 'bool' ? x.value_text === 'true' : x.value_text;
  }
  return out;
}
/* a single setting as stored (the daily ledger lock keeps its details here) */
const getOne = (key, db) => query(`SELECT value_text FROM policy_setting WHERE setting_key = $1`, [key], db).then(r => (r.rows[0] ? r.rows[0].value_text : null));
const setText = (key, text, description, db) => query(
  `INSERT INTO policy_setting (setting_key, value_text, value_type, description) VALUES ($1, $2, 'text', $3)
   ON CONFLICT (setting_key) DO UPDATE SET value_text = EXCLUDED.value_text`, [key, text, description], db);
const remove = (key, db) => query(`DELETE FROM policy_setting WHERE setting_key = $1`, [key], db).then(r => rowCount(r));
const rowCount = r => r.rowCount > 0;
/* a single setting, locked for the rest of the transaction (read, change, write back) */
const getOneForUpdate = (key, db) => query(`SELECT value_text FROM policy_setting WHERE setting_key = $1 FOR UPDATE`, [key], db).then(r => (r.rows[0] ? r.rows[0].value_text : null));
/* change the value of a setting that already exists. The caller has checked the key against a whitelist and the value against its type. */
const setValue = (key, valueText, db) => query(`UPDATE policy_setting SET value_text = $2 WHERE setting_key = $1`, [key, String(valueText)], db).then(rowCount);
/* a stored JSON list (the interventions): created on first save */
const putJson = (key, text, description, db) => query(
  `INSERT INTO policy_setting (setting_key, value_text, value_type, description) VALUES ($1, $2, 'text', $3)
   ON CONFLICT (setting_key) DO UPDATE SET value_text = EXCLUDED.value_text`, [key, text, description], db);
module.exports = { getAll, getOne, getOneForUpdate, setText, setValue, putJson, remove };
