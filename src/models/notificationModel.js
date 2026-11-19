'use strict';
/* notification_template, the sent_log and the "who would get it" counts. Nothing is sent: the log row is the whole feature. */
const { query } = require('../config/db');
const templates = db => query(`SELECT id, name, body FROM notification_template ORDER BY id`, [], db).then(r => r.rows);
const template = (id, db) => query(`SELECT id, name, body FROM notification_template WHERE id = $1`, [id], db).then(r => r.rows[0] || null);
const sentLog = (limit, db) => query(
  `SELECT l.id, l.sent_at, l.audience, l.title, l.template_id, st.full_name AS sent_by_name
     FROM sent_log l LEFT JOIN staff_profile st ON st.user_id = l.sent_by ORDER BY l.sent_at DESC, l.id DESC LIMIT $1`, [limit], db).then(r => r.rows);
const countIn = (sql, params, db) => query(sql, params, db).then(r => r.rows[0].n);
/* number of people for each audience. Every query counts active-membership students (or the people on one lesson). */
const recipients = {
  lesson: (lessonId, db) => countIn(`SELECT count(*)::int AS n FROM class_attendance WHERE lesson_id = $1 AND attendance_status IN ('Booked', 'Attended', 'No-Show')`, [lessonId], db),
  student: (userId, db) => countIn(`SELECT count(*)::int AS n FROM student_profile WHERE user_id = $1`, [userId], db),
  all: db => countIn(`SELECT count(*)::int AS n FROM student_profile`, [], db),
  dojo: (dojoId, db) => countIn(`SELECT count(*)::int AS n FROM student_profile WHERE dojo_id = $1`, [dojoId], db),
  grade: (rankId, db) => countIn(`SELECT count(*)::int AS n FROM student_profile WHERE rank_id = $1`, [rankId], db),
  lapsed: db => countIn(`SELECT count(*)::int AS n FROM membership WHERE account_status = 'Lapsed'`, [], db),
  unpaid: db => countIn(`SELECT count(DISTINCT user_id)::int AS n FROM payment WHERE status = 'Outstanding'`, [], db)
};
/* Telegram chat ids of the same audiences, for students who linked the bot */
const chatsIn = (where, params, db) => query(
  `SELECT sp.telegram_chat_id AS chat FROM student_profile sp WHERE sp.telegram_chat_id IS NOT NULL AND ${where}`, params, db).then(r => r.rows.map(x => x.chat));
const telegramChats = {
  lesson: (lessonId, db) => chatsIn(`sp.user_id IN (SELECT user_id FROM class_attendance WHERE lesson_id = $1 AND attendance_status IN ('Booked', 'Attended', 'No-Show'))`, [lessonId], db),
  student: (userId, db) => chatsIn(`sp.user_id = $1`, [userId], db),
  all: db => chatsIn(`TRUE`, [], db),
  dojo: (dojoId, db) => chatsIn(`sp.dojo_id = $1`, [dojoId], db),
  grade: (rankId, db) => chatsIn(`sp.rank_id = $1`, [rankId], db),
  lapsed: db => chatsIn(`sp.user_id IN (SELECT user_id FROM membership WHERE account_status = 'Lapsed')`, [], db),
  unpaid: db => chatsIn(`sp.user_id IN (SELECT user_id FROM payment WHERE status = 'Outstanding')`, [], db)
};
/* the approved wording the front desk can send (Business Admin, Policies page) */
const insertTemplate = (t, db) => query(`INSERT INTO notification_template (id, name, body) VALUES ($1, $2, $3)`, [t.id, t.name, t.body], db);
const updateTemplate = (id, t, db) => query(
  `UPDATE notification_template SET name = COALESCE($2, name), body = COALESCE($3, body) WHERE id = $1`, [id, t.name === undefined ? null : t.name, t.body === undefined ? null : t.body], db).then(r => r.rowCount > 0);
const deleteTemplate = (id, db) => query(`DELETE FROM notification_template WHERE id = $1`, [id], db).then(r => r.rowCount > 0);
const templateByName = (name, db) => query(`SELECT id FROM notification_template WHERE lower(name) = lower($1)`, [name], db).then(r => r.rows[0] || null);
module.exports = { templates, template, sentLog, recipients, telegramChats,insertTemplate, updateTemplate, deleteTemplate, templateByName };
