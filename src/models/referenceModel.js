'use strict';
/* Reference data that every page needs: dojos, belt ranks, packages, public policy values, weekly timetable, instructors. */
const { query } = require('../config/db');

/* never selects dojo.qr_token */
const listDojos = db => query(
  `SELECT id, name, short_name, code, region, address, status FROM dojo ORDER BY (id = 'hq') DESC, region, name`, [], db).then(r => r.rows);

const listBelts = db => query(
  `SELECT id, name, sort_order, belt_color, grading_fee FROM belt_rank ORDER BY sort_order`, [], db).then(r => r.rows);

const listActivePackages = db => query(
  `SELECT id, name, audience, price, billing_unit, lessons, valid_days, valid_months, description, compassion_eligible
     FROM package_def WHERE is_active ORDER BY audience, price, id`, [], db).then(r => r.rows);

const PUBLIC_POLICY_KEYS = [
  'registration_fee', 'annual_dues', 'discount_senior_age', 'discount_senior_pct', 'discount_student_from_age', 'discount_student_to_age',
  'discount_student_pct', 'booking_ahead_months', 'booking_min_days', 'cancel_hours', 'max_packages', 'compassion_days', 'grading_late_fee'
];
const listPublicPolicies = db => query(
  `SELECT setting_key, value_text, value_type FROM policy_setting WHERE setting_key = ANY($1::text[])`, [PUBLIC_POLICY_KEYS], db).then(r => r.rows);

/* public timetable rows: no private lessons */
const listPublicTemplates = db => query(
  `SELECT t.id, t.code, t.dojo_id, t.weekday, to_char(t.start_time, 'HH24:MI') AS start_time, to_char(t.end_time, 'HH24:MI') AS end_time,
          t.mat, t.class_type, t.capacity, t.kids_only, t.online_bookable, i.full_name AS instructor_name
     FROM class_template t JOIN instructor_profile i ON i.user_id = t.instructor_id
    WHERE NOT t.is_private
    ORDER BY t.weekday, t.start_time, t.id`, [], db).then(r => r.rows);

const listInstructors = db => query(
  `SELECT user_id, full_name, dan_grade, photo_file, is_chief FROM instructor_profile ORDER BY is_chief DESC, dan_grade DESC, user_id`, [], db).then(r => r.rows);

module.exports = { listDojos, listBelts, listActivePackages, listPublicPolicies, listPublicTemplates, listInstructors };
