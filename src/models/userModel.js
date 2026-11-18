'use strict';
/* users and their role profiles. Queries that return a user for display never select password_hash. */
const { query } = require('../config/db');

/* One fixed statement per portal: the identifier is only ever a bound parameter.
   students: member number or email, instructors: INS-xxxx or email, admins: ADM-xxx or email. */
const LOGIN_SQL = {
  student: `SELECT u.id, u.role, u.password_hash FROM users u
             WHERE u.role = 'student'
               AND (lower(u.email) = lower($1)
                    OR EXISTS (SELECT 1 FROM student_profile sp WHERE sp.user_id = u.id AND upper(sp.member_no) = upper($1)))
             LIMIT 1`,
  instructor: `SELECT u.id, u.role, u.password_hash FROM users u
                WHERE u.role = 'instructor' AND (upper(u.id) = upper($1) OR lower(u.email) = lower($1)) LIMIT 1`,
  admin: `SELECT u.id, u.role, u.password_hash FROM users u
           WHERE u.role = 'admin' AND (upper(u.id) = upper($1) OR lower(u.email) = lower($1)) LIMIT 1`
};

/* the credentials row for a sign-in attempt (the only place password_hash is read besides password changes) */
async function findCredentials(portal, identifier, db) {
  const sql = LOGIN_SQL[portal];
  if (!sql) return null;
  const r = await query(sql, [identifier], db);
  return r.rows[0] || null;
}

/* the signed-in account with its role profile. Used by the auth middleware on every request. */
async function findAccount(id, db) {
  const r = await query(
    `SELECT u.id, u.role, u.email, u.must_change_password, u.password_changed_at,
            sp.member_no, sp.full_name AS student_name, sp.dojo_id AS student_dojo, sp.rank_id, sp.age_group, sp.gender, sp.dob,
            br.name AS rank_name, m.account_status,
            ip.full_name AS instructor_name, ip.dan_grade, ip.photo_file, ip.is_chief, ip.status AS instructor_status,
            st.full_name AS staff_name, st.admin_type, st.status AS staff_status,
            gp.full_name AS guest_name,
            d.short_name AS dojo_short
       FROM users u
       LEFT JOIN student_profile sp ON sp.user_id = u.id
       LEFT JOIN belt_rank br ON br.id = sp.rank_id
       LEFT JOIN membership m ON m.user_id = sp.user_id
       LEFT JOIN dojo d ON d.id = sp.dojo_id
       LEFT JOIN instructor_profile ip ON ip.user_id = u.id
       LEFT JOIN staff_profile st ON st.user_id = u.id
       LEFT JOIN guest_profile gp ON gp.user_id = u.id
      WHERE u.id = $1`, [id], db);
  return r.rows[0] || null;
}

const touchLastLogin = (id, at, db) => query(`UPDATE users SET last_login_at = $2 WHERE id = $1`, [id, at], db);

/* an account with this email (any role), or null. Only id and role are returned. */
const findByEmail = (email, db) =>
  query(`SELECT id, role FROM users WHERE lower(email) = lower($1)`, [email], db).then(r => r.rows[0] || null);
const insertUser = ({ id, role, email, passwordHash, createdAt, mustChangePassword = false }, db) =>
  query(`INSERT INTO users (id, role, email, password_hash, created_at, must_change_password) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, role, email, passwordHash, createdAt, !!mustChangePassword], db);
/* id, role, email and password_hash of one account, for a password change. Pass lock = true inside a transaction (FOR UPDATE). */
const findCredentialsById = (id, db, lock = false) =>
  query(`SELECT id, role, email, password_hash FROM users WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id], db).then(r => r.rows[0] || null);
/* a new password (own change, or a Business Admin reset). The caller passes a bcrypt hash. mustChange forces the owner to pick their own at
   next sign-in. password_changed_at kills every session issued before it. */
const setPassword = (id, passwordHash, { mustChange = false, at = new Date() } = {}, db) =>
  query(`UPDATE users SET password_hash = $2, must_change_password = $3, password_changed_at = $4 WHERE id = $1`, [id, passwordHash, !!mustChange, at], db).then(r => r.rowCount > 0);
const updateEmail = (id, email, db) => query(`UPDATE users SET email = $2 WHERE id = $1`, [id, email], db);
module.exports = { findCredentials, findCredentialsById, findAccount, touchLastLogin, findByEmail, insertUser, updateEmail, setPassword };
