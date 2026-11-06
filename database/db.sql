// ==========================================
// 1. AUTHENTICATION & CORE USERS
// ==========================================
Table users {
  id varchar [pk, note: 'e.g., UUID or custom string ID']
  role varchar [not null, note: 'Values: student, guest, instructor, admin, front_desk']
  email varchar [unique, not null]
  password_hash varchar [not null]
  created_at timestamptz [not null]
}

// ==========================================
// 2. ROLE PROFILES (1-to-1 with users)
// ==========================================
Table student_profile {
  user_id varchar [pk, ref: - users.id]
  full_name varchar [not null]
  dob date [not null]
  contact_no varchar [not null]
  rank varchar [not null]
  dojo varchar [not null]
  last_grading_date date
  last_passed_grading_date date
  total_accumulated_hours numeric [default: 0]
  accumulated_hours numeric [default: 0]
  weapon_hours numeric [default: 0]
  discount boolean [default: false]
}

Table guest_profile {
  user_id varchar [pk, ref: - users.id]
  full_name varchar [not null]
  contact_no varchar
  trial_status varchar [note: 'Values: Pending, Attended, Converted']
}

Table instructor_profile {
  user_id varchar [pk, ref: - users.id]
  full_name varchar [not null]
}

Table admin_profile {
  user_id varchar [pk, ref: - users.id]
  full_name varchar [not null]
}

Table frontdesk_profile {
  user_id varchar [pk, ref: - users.id]
  full_name varchar [not null]
}

// ==========================================
// 3. STUDENT BUSINESS LOGIC
// ==========================================
Table membership {
  user_id varchar [pk, ref: - student_profile.user_id]
  membership_expiry date [not null]
  account_status varchar [not null, note: 'Values: Active, Inactive, Deactivated']
}

Table grading_history {
  id varchar [pk]
  user_id varchar [ref: > student_profile.user_id]
  grading_date date [not null]
  grading_remarks text
  grade boolean [not null, note: 'TRUE for Pass, FALSE for Fail']
}

// ==========================================
// 4. CLASS SCHEDULING & ATTENDANCE
// ==========================================
Table class_booking {
  lesson_id varchar [pk]
  instructor_id varchar [ref: > instructor_profile.user_id]
  class_code varchar [not null]
  lesson_time timestamptz [not null, note: 'Stores both date and time']
  lesson_location varchar [not null]
  class_type varchar [not null]
}

Table class_attendance {
  lesson_id varchar [ref: > class_booking.lesson_id]
  user_id varchar [ref: > users.id, note: 'Links to users so Guests can also be added to rosters']
  attendance_status varchar [not null, note: 'Values: Booked, Attended, No-Show, Cancelled']
  remarks text [note: 'Instructor notes on student performance']
  
  indexes {
    (lesson_id, user_id) [pk] // Composite Primary Key
  }
}

Table makeup_class {
  id varchar [pk]
  user_id varchar [ref: > student_profile.user_id]
  original_lesson_id varchar [ref: > class_booking.lesson_id, note: 'The class they missed']
  makeup_lesson_id varchar [ref: > class_booking.lesson_id, note: 'The class they are using the credit for']
  status varchar [not null, note: 'Values: Pending, Used, Expired']
}