'use strict';
/* Ben's follow-up contacts over Telegram: who has a linked chat, what Ben has already sent and whether a reply is awaited. */
const { query } = require('../config/db');

const linkedByChat = (chatId, db) => query(
  `SELECT user_id, full_name FROM student_profile WHERE telegram_chat_id = $1`, [String(chatId)], db).then(r => r.rows[0] || null);

const chatsFor = (userIds, db) => query(
  `SELECT user_id, telegram_chat_id AS chat FROM student_profile WHERE user_id = ANY($1::text[]) AND telegram_chat_id IS NOT NULL`, [userIds], db)
  .then(r => new Map(r.rows.map(x => [x.user_id, x.chat])));

/* a student who has replied STOP is never messaged by Ben again */
const optedOut = (userId, db) => query(
  `SELECT 1 FROM followup_attempt a JOIN followup f ON f.id = a.followup_id WHERE f.user_id = $1 AND a.outcome = 'Opted out' LIMIT 1`, [userId], db)
  .then(r => r.rowCount > 0);

const messagedSince = (userId, since, db) => query(
  `SELECT 1 FROM followup_attempt a JOIN followup f ON f.id = a.followup_id
    WHERE f.user_id = $1 AND a.outcome = 'Ben message sent' AND a.attempted_at >= $2 LIMIT 1`, [userId, since], db).then(r => r.rowCount > 0);

/* the most recent Ben message on an open follow-up that has not been answered yet (14 days at most) */
const awaitingReply = (userId, db) => query(
  `SELECT f.id AS followup_id, f.kind, a.attempted_at
     FROM followup f JOIN followup_attempt a ON a.followup_id = f.id
    WHERE f.user_id = $1 AND f.status = 'open' AND a.outcome = 'Ben message sent' AND a.attempted_at > now() - interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM followup_attempt r WHERE r.followup_id = f.id AND r.attempted_at > a.attempted_at
                        AND r.outcome IN ('Replied: coming back', 'Replied: passed on', 'Opted out'))
    ORDER BY a.attempted_at DESC LIMIT 1`, [userId], db).then(r => r.rows[0] || null);

module.exports = { linkedByChat, chatsFor, optedOut, messagedSince, awaitingReply };
