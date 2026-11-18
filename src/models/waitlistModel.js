'use strict';
/* class_waitlist: students waiting for a place in a full class, first come first served. */
const { query } = require('../config/db');
const list = (lessonId, db) => query(
  `SELECT w.user_id, w.created_at, sp.full_name, sp.member_no FROM class_waitlist w JOIN student_profile sp ON sp.user_id = w.user_id
    WHERE w.lesson_id = $1 ORDER BY w.created_at, w.user_id`, [lessonId], db).then(r => r.rows);
const has = (lessonId, userId, db) => query(`SELECT 1 FROM class_waitlist WHERE lesson_id = $1 AND user_id = $2`, [lessonId, userId], db).then(r => r.rowCount > 0);
const add = (lessonId, userId, at, db) => query(
  `INSERT INTO class_waitlist (lesson_id, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [lessonId, userId, at], db).then(r => r.rowCount > 0);
const remove = (lessonId, userId, db) => query(`DELETE FROM class_waitlist WHERE lesson_id = $1 AND user_id = $2`, [lessonId, userId], db).then(r => r.rowCount > 0);
module.exports = { list, has, add, remove };
