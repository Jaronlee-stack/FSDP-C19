'use strict';
/* venue_import_mapping, the venue's weekly class codes, member lookup for roster rows, class_enrollment and the import issues a roster file raises. */
const { query } = require('../config/db');

const getMapping = (dojoId, db) => query(
  `SELECT dojo_id, member_no_col, name_col, class_col FROM venue_import_mapping WHERE dojo_id = $1`, [dojoId], db).then(r => r.rows[0] || null);

const saveMapping = (dojoId, m, userId, db) => query(
  `INSERT INTO venue_import_mapping (dojo_id, member_no_col, name_col, class_col, updated_at, updated_by)
   VALUES ($1, $2, $3, $4, now(), $5)
   ON CONFLICT (dojo_id) DO UPDATE SET member_no_col = EXCLUDED.member_no_col, name_col = EXCLUDED.name_col,
     class_col = EXCLUDED.class_col, updated_at = now(), updated_by = EXCLUDED.updated_by`,
  [dojoId, m.memberNoColumn, m.nameColumn, m.classColumn, userId], db);

/* a weekly class of this venue by its code (BEDOK-TUE7-8424); HQ and other venues' classes are not found */
const classIdByCode = (dojoId, code, db) => query(
  `SELECT id FROM class_template WHERE dojo_id = $1 AND upper(code) = upper($2)`, [dojoId, code], db).then(r => r.rows[0]?.id || null);

const studentByMemberNo = (memberNo, db) => query(
  `SELECT user_id, member_no, full_name FROM student_profile WHERE member_no = $1`, [memberNo], db).then(r => r.rows[0] || null);

/* returns true when the enrolment is new */
const enrol = (userId, templateId, db) => query(
  `INSERT INTO class_enrollment (user_id, template_id) VALUES ($1, $2) ON CONFLICT (user_id, template_id) DO NOTHING`, [userId, templateId], db).then(r => r.rowCount > 0);

const addIssue = (i, db) => query(
  `INSERT INTO import_issue (id, file_name, row_no, issue_type, person_name, detail, status, matched_user_id)
   VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
  [i.id, i.fileName, i.rowNo, i.issueType, i.personName || null, i.detail, i.matchedUserId || null], db);

module.exports = { getMapping, saveMapping, classIdByCode, studentByMemberNo, enrol, addIssue };
