'use strict';
/* admin_inbox_item: questions Ben escalates to staff. */
const { query } = require('../config/db');

const COLS = `i.id, i.question, i.reason, i.checked_notes, i.channel, i.chat_id, i.status, i.reply_choice, i.reply, i.knowledge_note,
              i.created_at, i.answered_at, i.delivery, st.full_name AS answered_by_name, sp.full_name AS asker_name, sp.member_no`;
const FROM = `FROM admin_inbox_item i LEFT JOIN staff_profile st ON st.user_id = i.answered_by
              LEFT JOIN student_profile sp ON sp.user_id = i.user_id`;

const list = (status, db) => query(
  `SELECT ${COLS} ${FROM} WHERE ($1::text IS NULL OR i.status = $1)
   ORDER BY (i.status = 'open') DESC, COALESCE(i.answered_at, i.created_at) DESC, i.id DESC LIMIT 200`, [status || null], db).then(r => r.rows);

const get = (id, db, lock = false) => query(`SELECT ${COLS} ${FROM} WHERE i.id = $1${lock ? ' FOR UPDATE OF i' : ''}`, [id], db).then(r => r.rows[0] || null);

const insert = (x, db) => query(
  `INSERT INTO admin_inbox_item (id, question, reason, checked_notes, channel, chat_id, user_id, status, created_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)`,
  [x.id, x.question, x.reason, x.checkedNotes, x.channel, x.chatId || null, x.userId || null, x.at], db);

const answer = (id, a, db) => query(
  `UPDATE admin_inbox_item SET status = $2, reply_choice = $3, reply = $4, knowledge_note = $5, answered_by = $6, answered_at = $7, delivery = $8
   WHERE id = $1 AND status = 'open'`,
  [id, a.status, a.choice, a.reply || null, a.knowledgeNote || null, a.by, a.at, a.delivery || null], db).then(r => r.rowCount > 0);

const setDelivery = (id, delivery, db) => query(`UPDATE admin_inbox_item SET delivery = $2 WHERE id = $1`, [id, delivery], db);

const openCount = db => query(`SELECT count(*)::int AS n FROM admin_inbox_item WHERE status = 'open'`, [], db).then(r => r.rows[0].n);

module.exports = { list, get, insert, answer, setDelivery, openCount };
