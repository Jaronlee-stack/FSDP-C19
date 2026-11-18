'use strict';
/* sent_log: every mock notification is recorded here (no email or SMS is sent by this project). */
const { query } = require('../config/db');

const insert = (l, db) => query(
  `INSERT INTO sent_log (id, sent_at, sent_by, audience, title, template_id) VALUES ($1, $2, $3, $4, $5, $6)`,
  [l.id, l.at, l.sentBy || null, l.audience, l.title, l.templateId || null], db);

module.exports = { insert };
