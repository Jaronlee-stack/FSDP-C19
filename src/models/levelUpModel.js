'use strict';
/* Level-ups a student has already tapped on the home page. The pending ones are worked out from attendance and promotions;
   this table only remembers which of them were acknowledged. Progress numbers never read it. */
const { query } = require('../config/db');

const acknowledged = (userId, db) => query(
  `SELECT kind, ref_id FROM level_up_ack WHERE user_id = $1`, [userId], db).then(r => r.rows);

/* does this level-up exist for this student? (a class they attended, a promotion HQ approved for them) */
const exists = (userId, kind, refId, db) => (kind === 'session'
  ? query(`SELECT 1 FROM class_attendance WHERE user_id = $1 AND lesson_id = $2 AND attendance_status = 'Attended'`, [userId, refId], db)
  : query(`SELECT 1 FROM grading_candidate WHERE user_id = $1 AND session_id = $2 AND promotion_status = 'Promoted'`, [userId, refId], db)
).then(r => r.rowCount > 0);

const acknowledge = (userId, kind, refId, db) => query(
  `INSERT INTO level_up_ack (user_id, kind, ref_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, kind, ref_id) DO NOTHING`, [userId, kind, refId], db);

module.exports = { acknowledged, exists, acknowledge };
