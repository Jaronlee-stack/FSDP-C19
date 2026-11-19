'use strict';
/* Turns a users + profile row into the session object used by req.user, GET /auth/me and the login response. */
const clock = require('../utils/clock');

const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] || 'th'}`;

function ageOn(dob, day) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number), [ty, tm, td] = day.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/* returns null for a user row that has no usable profile */
function toSession(row) {
  if (!row) return null;
  const base = { id: row.id, role: row.role, mustChangePassword: !!row.must_change_password, adminType: null, name: null, memberNo: null, rank: null, rankId: null, dojoId: null, group: null, gender: null, age: null, label: '' };
  if (row.role === 'student') {
    return {
      ...base, name: row.student_name, memberNo: row.member_no, rank: row.rank_name, rankId: row.rank_id, dojoId: row.student_dojo,
      group: row.age_group === 'Child' ? 'child' : 'adult', gender: row.gender, age: ageOn(row.dob, clock.today()),
      label: `${row.rank_name} · ${row.dojo_short} Dojo`, status: row.account_status
    };
  }
  if (row.role === 'instructor') {
    return { ...base, name: row.instructor_name, rank: `${ordinal(row.dan_grade)} Dan`, dojoId: 'hq', label: `${ordinal(row.dan_grade)} Dan · HQ Dojo`, chief: !!row.is_chief, photo: row.photo_file };
  }
  if (row.role === 'admin') {
    const ba = row.admin_type === 'business';
    return { ...base, name: row.staff_name, adminType: row.admin_type, dojoId: 'hq', label: `${ba ? 'Business Admin' : 'Front desk'} · HQ Dojo`, status: row.staff_status };
  }
  if (row.role === 'guest') return { ...base, name: row.guest_name };
  return null;
}

/* why this account may not sign in or keep a session, or null when it can */
function deactivatedReason(row) {
  if (row.role === 'admin' && row.staff_status !== 'active') return 'This staff account was deactivated. Ask a Business Admin to reactivate it.';
  if (row.role === 'instructor' && row.instructor_status && row.instructor_status !== 'active') return 'This instructor account was deactivated. Ask a Business Admin to reactivate it.';
  if (row.role === 'student' && row.account_status === 'Deactivated') return 'This membership was deactivated. Please contact the HQ office.';
  return null;
}

module.exports = { toSession, deactivatedReason, ordinal, ageOn };
