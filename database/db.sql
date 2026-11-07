-- 1. AUTHENTICATION & CORE USERS
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    role VARCHAR(50) NOT NULL, -- Values: student, guest, instructor, admin, front_desk
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. ROLE PROFILES
CREATE TABLE student_profile (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    dob DATE NOT NULL,
    contact_no VARCHAR(50) NOT NULL,
    rank VARCHAR(50) NOT NULL,
    dojo VARCHAR(255) NOT NULL,
    last_grading_date DATE,
    last_passed_grading_date DATE,
    total_accumulated_hours NUMERIC DEFAULT 0,
    accumulated_hours NUMERIC DEFAULT 0,
    weapon_hours NUMERIC DEFAULT 0,
    discount BOOLEAN DEFAULT FALSE
);

CREATE TABLE guest_profile (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    contact_no VARCHAR(50),
    trial_status VARCHAR(50) -- Values: Pending, Attended, Converted
);

CREATE TABLE instructor_profile (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL
);

CREATE TABLE admin_profile (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL
);

CREATE TABLE frontdesk_profile (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL
);

-- 3. STUDENT BUSINESS LOGIC
CREATE TABLE membership (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES student_profile(user_id) ON DELETE CASCADE,
    membership_expiry DATE NOT NULL,
    account_status VARCHAR(50) NOT NULL -- Values: Active, Inactive, Deactivated
);

CREATE TABLE grading_history (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE CASCADE,
    grading_date DATE NOT NULL,
    grading_remarks TEXT,
    grade BOOLEAN NOT NULL -- TRUE for Pass, FALSE for Fail
);

-- 4. CLASS SCHEDULING & ATTENDANCE
CREATE TABLE class_booking (
    lesson_id VARCHAR(255) PRIMARY KEY,
    instructor_id VARCHAR(255) REFERENCES instructor_profile(user_id),
    class_code VARCHAR(255) NOT NULL,
    lesson_time TIMESTAMPTZ NOT NULL,
    lesson_location VARCHAR(255) NOT NULL,
    class_type VARCHAR(255) NOT NULL
);

CREATE TABLE class_attendance (
    lesson_id VARCHAR(255) REFERENCES class_booking(lesson_id) ON DELETE CASCADE,
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
    attendance_status VARCHAR(50) NOT NULL, -- Values: Booked, Attended, No-Show, Cancelled
    remarks TEXT,
    PRIMARY KEY (lesson_id, user_id)
);

CREATE TABLE makeup_class (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE CASCADE,
    original_lesson_id VARCHAR(255) REFERENCES class_booking(lesson_id),
    makeup_lesson_id VARCHAR(255) REFERENCES class_booking(lesson_id),
    status VARCHAR(50) NOT NULL -- Values: Pending, Used, Expired
);