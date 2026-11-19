'use strict';
/* student_profile + membership. Never selects password_hash. */
const { query } = require('../config/db');

const PROFILE_SQL = `
  SELECT sp.user_id, sp.member_no, sp.full_name, sp.dob, sp.joined_on, sp.gender, sp.age_group, sp.contact_no, sp.dojo_id, sp.rank_id, sp.source,
         sp.last_grading_date, sp.last_passed_grading_date, sp.total_accumulated_hours, sp.accumulated_hours, sp.weapon_hours,
         sp.guardian_name, sp.guardian_contact, sp.emergency_contact, sp.medical_notes,
         u.email, br.name AS rank_name, br.sort_order AS rank_order,
         m.membership_expiry, m.account_status, m.last_renewed_at
    FROM student_profile sp
    JOIN users u ON u.id = sp.user_id
    JOIN belt_rank br ON br.id = sp.rank_id
    LEFT JOIN membership m ON m.user_id = sp.user_id`;

const getProfile = (userId, db) => query(`${PROFILE_SQL} WHERE sp.user_id = $1`, [userId], db).then(r => r.rows[0] || null);
const findByMemberNo = (memberNo, db) => query(`${PROFILE_SQL} WHERE upper(sp.member_no) = upper($1)`, [memberNo], db).then(r => r.rows[0] || null);
/* serialises the writes of one student (bookings, packages, grading) */
const lock = (userId, db) => query(`SELECT user_id FROM student_profile WHERE user_id = $1 FOR UPDATE`, [userId], db).then(r => r.rows[0] || null);

/* a promotion: the new rank, the date of the passed grading, and the hours counted toward the next grade start again
   (the career total stays; weapon <= accumulated <= total holds because both counters are zero) */
const promote = (userId, rankId, passedOn, db) => query(
  `UPDATE student_profile SET rank_id = $2, last_passed_grading_date = $3::date, accumulated_hours = 0, weapon_hours = 0 WHERE user_id = $1`, [userId, rankId, passedOn], db);
const nextRank = (rankId, db) => query(
  `SELECT id, name, sort_order, belt_color, grading_fee FROM belt_rank
    WHERE sort_order = (SELECT sort_order + 1 FROM belt_rank WHERE id = $1)`, [rankId], db).then(r => r.rows[0] || null);

/* only these columns can be changed from the profile page */
const EDITABLE = {
  contactNo: 'contact_no', emergencyContact: 'emergency_contact', medicalNotes: 'medical_notes',
  guardianName: 'guardian_name', guardianContact: 'guardian_contact'
};
async function updateProfile(userId, fields, db) {
  const sets = [], params = [userId];
  for (const [k, col] of Object.entries(EDITABLE)) {
    if (fields[k] === undefined) continue;
    params.push(fields[k]);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length) await query(`UPDATE student_profile SET ${sets.join(', ')} WHERE user_id = $1`, params, db);
}

/* a unique member number: ASK-<year>-<4 digits> */
const memberNoTaken = (memberNo, db) => query(`SELECT 1 FROM student_profile WHERE member_no = $1`, [memberNo], db).then(r => r.rowCount > 0);

const insertStudent = (s, db) => query(
  `INSERT INTO student_profile (user_id, member_no, full_name, dob, joined_on, gender, age_group, contact_no, dojo_id, rank_id, source,
      discount_type, guardian_name, guardian_contact, emergency_contact, medical_notes)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ASK', 'none', $11, $12, $13, $14)`,
  [s.userId, s.memberNo, s.fullName, s.dob, s.joinedOn, s.gender, s.ageGroup, s.contactNo, s.dojoId, s.rankId, s.guardianName, s.guardianContact, s.emergencyContact, s.medicalNotes], db);
const insertMembership = (userId, expiry, status, renewedAt, db) => query(
  `INSERT INTO membership (user_id, membership_expiry, account_status, last_renewed_at) VALUES ($1, $2, $3, $4)`, [userId, expiry, status, renewedAt], db);

/* credit class hours: total and accumulated always move together, weapon hours only for Weapons classes (keeps weapon <= accumulated <= total).
   Returns false when the person has no student_profile (a guest). */
const addHours = (userId, hours, weapon, db) => query(
  `UPDATE student_profile SET total_accumulated_hours = total_accumulated_hours + $2, accumulated_hours = accumulated_hours + $2,
          weapon_hours = weapon_hours + CASE WHEN $3::boolean THEN $2 ELSE 0 END WHERE user_id = $1`, [userId, hours, weapon], db).then(r => r.rowCount > 0);
const hoursOf = (userId, db) => query(
  `SELECT total_accumulated_hours, accumulated_hours, weapon_hours FROM student_profile WHERE user_id = $1`, [userId], db).then(r => r.rows[0] || null);
const setLastGradingDate = (userId, day, db) => query(`UPDATE student_profile SET last_grading_date = $2 WHERE user_id = $1`, [userId, day], db);
module.exports = { getProfile, findByMemberNo, lock, nextRank, updateProfile, memberNoTaken, insertStudent, insertMembership, addHours, hoursOf, setLastGradingDate, promote };
