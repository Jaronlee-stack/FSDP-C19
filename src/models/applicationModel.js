'use strict';
/* registration_application, application_checklist, auto_activation_rule. */
const { query } = require('../config/db');

const listRules = db => query(`SELECT id, label, enabled FROM auto_activation_rule ORDER BY id`, [], db).then(r => r.rows);
/* switch a rule on or off (Business Admin, Policies page) */
const setRuleEnabled = (id, enabled, db) => query(`UPDATE auto_activation_rule SET enabled = $2 WHERE id = $1`, [id, enabled], db).then(r => r.rowCount > 0);

const insert = (a, db) => query(
  `INSERT INTO registration_application (id, full_name, dojo_id, applicant_group, age, gender, nationality, phone, email, emergency_contact,
      prior_experience, previous_member, medical_declaration, dogi_choice, package_id, amount_paid, signer, submitted_at, status, password_hash)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'Submitted', $19)`,
  [a.id, a.fullName, a.dojoId, a.group, a.age, a.gender, a.nationality, a.phone, a.email, a.emergencyContact, a.priorExperience, a.previousMember,
    a.medical, a.dogiChoice, a.packageId, a.amountPaid, a.signer, a.at, a.passwordHash || null], db);

const insertChecklist = (applicationId, ruleId, done, db) => query(
  `INSERT INTO application_checklist (application_id, rule_id, done) VALUES ($1, $2, $3)`, [applicationId, ruleId, done], db);

/* the application approved and linked to the new student */
const markApproved = (id, userId, at, note, db) => query(
  `UPDATE registration_application SET status = 'Approved', user_id = $2, reviewed_at = $3, review_note = $4, password_hash = NULL WHERE id = $1`, [id, userId, at, note], db);

/* a waiting application, locked for activation */
const getForActivation = (id, db) => query(`SELECT * FROM registration_application WHERE id = $1 FOR UPDATE`, [id], db).then(r => r.rows[0] || null);
const listChecklist = (id, db) => query(
  `SELECT c.rule_id, c.done, r.enabled FROM application_checklist c JOIN auto_activation_rule r ON r.id = c.rule_id WHERE c.application_id = $1`, [id], db).then(r => r.rows);

/* ---------- front desk ---------- */
/* applications that still need work (not Approved, not Rejected) */
const LIST_COLS = `a.id, a.full_name, a.dojo_id, d.name AS dojo_name, a.applicant_group, a.age, a.gender, a.nationality, a.phone, a.email, a.emergency_contact,
                   a.prior_experience, a.previous_member, a.medical_declaration, a.dogi_choice, a.package_id, pd.name AS package_name, a.amount_paid, a.signer,
                   a.submitted_at, a.status, a.review_note, a.reviewed_at`;
const LIST_FROM = `FROM registration_application a JOIN dojo d ON d.id = a.dojo_id LEFT JOIN package_def pd ON pd.id = a.package_id`;
const listOpen = db => query(
  `SELECT ${LIST_COLS} ${LIST_FROM} WHERE a.status IN ('Submitted', 'Under review', 'Needs info') ORDER BY a.submitted_at DESC, a.id DESC`, [], db).then(r => r.rows);
const getDetail = (id, db) => query(`SELECT ${LIST_COLS} ${LIST_FROM} WHERE a.id = $1`, [id], db).then(r => r.rows[0] || null);
const checklistFor = (ids, db) => query(
  `SELECT c.application_id, c.rule_id, c.done, r.label, r.enabled FROM application_checklist c JOIN auto_activation_rule r ON r.id = c.rule_id
    WHERE c.application_id = ANY($1::text[]) ORDER BY c.application_id, r.id`, [ids], db).then(r => r.rows);
const setChecklist = (id, ruleId, done, db) => query(
  `UPDATE application_checklist SET done = $3 WHERE application_id = $1 AND rule_id = $2`, [id, ruleId, done], db).then(r => r.rowCount > 0);
const markStatus = (id, status, by, at, note, db) => query(
  `UPDATE registration_application SET status = $2::varchar, reviewed_by = $3, reviewed_at = $4, review_note = $5,
          password_hash = CASE WHEN $2::varchar IN ('Approved', 'Rejected') THEN NULL ELSE password_hash END WHERE id = $1`, [id, status, by, at, note], db);
const openCount = db => query(`SELECT count(*)::int AS n FROM registration_application WHERE status IN ('Submitted', 'Under review', 'Needs info')`, [], db).then(r => r.rows[0].n);
module.exports = { listRules, insert, insertChecklist, markApproved, getForActivation, listChecklist, listOpen, getDetail, checklistFor, setChecklist, markStatus, openCount, setRuleEnabled };
