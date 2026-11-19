-- =====================================================================
-- ASK / Aikido Shinju-Kai management system: PostgreSQL schema
-- =====================================================================
-- Run:   psql -d ask_dojo -f database/db.sql   (then database/seed.sql)
-- Re-runnable: every table is dropped (CASCADE, reverse dependency order) and
-- recreated. This DESTROYS data in these tables only. Nothing else in the
-- database is touched.
--
-- Conventions: snake_case, VARCHAR(255) text ids, TIMESTAMPTZ for moments,
-- CHECK constraints for status/role lists, an index on every foreign key.
--
-- Table groups
--   1 Reference        dojo, belt_rank
--   2 Accounts         users, student_profile, guest_profile, instructor_profile,
--                      staff_profile, membership
--   3 Packages & money package_def, student_package, payment, refund_request,
--                      exception_request, equipment_order
--   4 Onboarding       auto_activation_rule, registration_application,
--                      application_checklist, guest_pass
--   5 Classes          class_template, class_session, class_attendance,
--                      class_waitlist, makeup_class, class_closure, class_feedback,
--                      class_feedback_prompt, instructor_remark, check_in
--   6 Grading          grading_session, grading_examiner, grading_application,
--                      grading_candidate, grading_history
--   7 Office           mc_request, followup, followup_attempt, notification_template,
--                      sent_log, import_issue, policy_setting
--   8 Audit            audit_log (append-only)
--
-- Design decisions (details in database/README.md)
--   D1 Weekly timetable (class_template) is separate from a dated occurrence
--      (class_session). Bookings and attendance point at class_session.lesson_id.
--      The old class_booking table is replaced by class_session.
--   D2 One staff_profile table with admin_type ('business' | 'frontdesk') replaces
--      admin_profile and frontdesk_profile. Display: business = "Business Admin",
--      frontdesk = "Front desk".
--   D3 Role-specific profiles carry a constant `role` column and a composite FK
--      (user_id, role) -> users(id, role), so a student profile can only hang off
--      a users row whose role is 'student', and so on.
--   D4 Grading is NOT a class type. It has its own tables and its venue is fixed
--      to the ASK HQ Dojo (dojo id 'hq'), enforced by CHECK + FK.
--   D5 audit_log is append-only: a trigger rejects UPDATE, DELETE and TRUNCATE
--      (the one exception is the FK ON DELETE SET NULL on actor_user_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- DROP (reverse dependency order). Includes tables from the previous
-- schema (class_booking, admin_profile, frontdesk_profile).
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_grading_conflict;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP FUNCTION IF EXISTS audit_log_guard() CASCADE;
DROP TABLE IF EXISTS policy_setting CASCADE;
DROP TABLE IF EXISTS import_issue CASCADE;
DROP TABLE IF EXISTS sent_log CASCADE;
DROP TABLE IF EXISTS notification_template CASCADE;
DROP TABLE IF EXISTS followup_attempt CASCADE;
DROP TABLE IF EXISTS followup CASCADE;
DROP TABLE IF EXISTS mc_request CASCADE;
DROP TABLE IF EXISTS grading_history CASCADE;
DROP TABLE IF EXISTS grading_candidate CASCADE;
DROP TABLE IF EXISTS grading_application CASCADE;
DROP TABLE IF EXISTS grading_examiner CASCADE;
DROP TABLE IF EXISTS grading_session CASCADE;
DROP TABLE IF EXISTS check_in CASCADE;
DROP TABLE IF EXISTS instructor_remark CASCADE;
DROP TABLE IF EXISTS class_feedback_prompt CASCADE; -- backend: which students already answered the rating pop-up
DROP TABLE IF EXISTS class_waitlist CASCADE;         -- backend: roster waitlist
DROP TABLE IF EXISTS class_feedback CASCADE;
DROP TABLE IF EXISTS class_closure CASCADE;
DROP TABLE IF EXISTS makeup_class CASCADE;
DROP TABLE IF EXISTS class_attendance CASCADE;
DROP TABLE IF EXISTS class_booking CASCADE;          -- old table, replaced by class_session
DROP TABLE IF EXISTS class_session CASCADE;
DROP TABLE IF EXISTS class_template CASCADE;
DROP TABLE IF EXISTS guest_pass CASCADE;
DROP TABLE IF EXISTS application_checklist CASCADE;
DROP TABLE IF EXISTS registration_application CASCADE;
DROP TABLE IF EXISTS auto_activation_rule CASCADE;
DROP TABLE IF EXISTS equipment_order CASCADE;
DROP TABLE IF EXISTS exception_request CASCADE;
DROP TABLE IF EXISTS refund_request CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS student_package CASCADE;
DROP TABLE IF EXISTS package_def CASCADE;
DROP TABLE IF EXISTS membership CASCADE;
DROP TABLE IF EXISTS staff_profile CASCADE;
DROP TABLE IF EXISTS admin_profile CASCADE;          -- old table, merged into staff_profile
DROP TABLE IF EXISTS frontdesk_profile CASCADE;      -- old table, merged into staff_profile
DROP TABLE IF EXISTS instructor_profile CASCADE;
DROP TABLE IF EXISTS guest_profile CASCADE;
DROP TABLE IF EXISTS student_profile CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS belt_rank CASCADE;
DROP TABLE IF EXISTS dojo CASCADE;

-- =====================================================================
-- 1. REFERENCE DATA
-- =====================================================================
CREATE TABLE dojo (
    id VARCHAR(255) PRIMARY KEY,                 -- 'hq', 'bedok', ...
    name VARCHAR(255) NOT NULL UNIQUE,
    short_name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    region VARCHAR(50) NOT NULL CHECK (region IN ('Central', 'East', 'North East', 'West', 'North')),
    address VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Temporarily closed')),
    qr_token VARCHAR(255) UNIQUE                 -- payload printed in this dojo's attendance QR code
);
COMMENT ON COLUMN dojo.qr_token IS 'Each location has its own QR code; a student scans it to check in (check_in table). Mock value for now.';

CREATE TABLE belt_rank (
    id VARCHAR(255) PRIMARY KEY,                 -- '6k' ... '1k', '1d'
    name VARCHAR(50) NOT NULL UNIQUE,            -- '6th Kyu' ... '1st Dan'
    sort_order INT NOT NULL UNIQUE,              -- 1 = lowest rank
    belt_color CHAR(7) NOT NULL,
    grading_fee NUMERIC(8, 2) NOT NULL CHECK (grading_fee >= 0)   -- fee to grade INTO this rank
);

-- =====================================================================
-- 2. ACCOUNTS AND PROFILES
-- =====================================================================
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'guest', 'instructor', 'admin')),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE for staff-issued temporary passwords: the user must set their own before anything else
    password_changed_at TIMESTAMPTZ,             -- sessions issued before this moment are rejected
    UNIQUE (id, role)                            -- target of the composite FKs below
);

CREATE TABLE student_profile (
    user_id VARCHAR(255) PRIMARY KEY,
    role VARCHAR(50) NOT NULL DEFAULT 'student' CHECK (role = 'student'),
    member_no VARCHAR(50) NOT NULL UNIQUE,       -- e.g. ASK-2025-1834 (EXT-... for external members)
    full_name VARCHAR(255) NOT NULL,
    dob DATE NOT NULL,
    joined_on DATE NOT NULL,                     -- date the student joined ASK (may be years before the seed window)
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female')),
    age_group VARCHAR(10) NOT NULL CHECK (age_group IN ('Adult', 'Child')),
    contact_no VARCHAR(50) NOT NULL,
    dojo_id VARCHAR(255) NOT NULL REFERENCES dojo(id) ON DELETE RESTRICT,
    rank_id VARCHAR(255) NOT NULL REFERENCES belt_rank(id) ON DELETE RESTRICT,
    source VARCHAR(20) NOT NULL DEFAULT 'ASK' CHECK (source IN ('ASK', 'External')),
    last_grading_date DATE,
    last_passed_grading_date DATE,
    -- HOURS COUNTERS (one meaning each; weapon_hours <= accumulated_hours <= total_accumulated_hours)
    total_accumulated_hours NUMERIC(7, 1) NOT NULL DEFAULT 0 CHECK (total_accumulated_hours >= 0),
    accumulated_hours NUMERIC(7, 1) NOT NULL DEFAULT 0 CHECK (accumulated_hours >= 0),
    weapon_hours NUMERIC(7, 1) NOT NULL DEFAULT 0 CHECK (weapon_hours >= 0),
    discount_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'student', 'senior', 'nsf')),
    guardian_name VARCHAR(255),
    guardian_contact VARCHAR(50),
    emergency_contact VARCHAR(255),
    medical_notes TEXT,
    CONSTRAINT student_hours_order CHECK (weapon_hours <= accumulated_hours AND accumulated_hours <= total_accumulated_hours),
    FOREIGN KEY (user_id, role) REFERENCES users(id, role) ON DELETE CASCADE
);
COMMENT ON COLUMN student_profile.joined_on IS 'Joining date. Like dob it is a real historical fact and is exempt from the seed data 2-year window (2025-11-06..2027-11-06).';
COMMENT ON COLUMN student_profile.total_accumulated_hours IS 'Lifetime training hours credited from attended sessions since joining.';
COMMENT ON COLUMN student_profile.accumulated_hours IS 'Hours since the last PASSED grading (counts toward the next rank). Resets to 0 on promotion.';
COMMENT ON COLUMN student_profile.weapon_hours IS 'The part of accumulated_hours earned in Weapons classes.';

CREATE TABLE guest_profile (
    user_id VARCHAR(255) PRIMARY KEY,
    role VARCHAR(50) NOT NULL DEFAULT 'guest' CHECK (role = 'guest'),
    full_name VARCHAR(255) NOT NULL,
    contact_no VARCHAR(50),
    trial_status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (trial_status IN ('Pending', 'Attended', 'Converted')),
    FOREIGN KEY (user_id, role) REFERENCES users(id, role) ON DELETE CASCADE
);

CREATE TABLE instructor_profile (
    user_id VARCHAR(255) PRIMARY KEY,            -- e.g. INS-0042
    role VARCHAR(50) NOT NULL DEFAULT 'instructor' CHECK (role = 'instructor'),
    full_name VARCHAR(255) NOT NULL,
    dan_grade SMALLINT NOT NULL CHECK (dan_grade BETWEEN 1 AND 10),
    photo_file VARCHAR(255),
    is_chief BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),   -- backend: the Staff page can deactivate an instructor account
    FOREIGN KEY (user_id, role) REFERENCES users(id, role) ON DELETE CASCADE
);

-- Office staff. Replaces admin_profile and frontdesk_profile (identical columns).
CREATE TABLE staff_profile (
    user_id VARCHAR(255) PRIMARY KEY,            -- e.g. ADM-001
    role VARCHAR(50) NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
    full_name VARCHAR(255) NOT NULL,
    admin_type VARCHAR(20) NOT NULL CHECK (admin_type IN ('business', 'frontdesk')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    FOREIGN KEY (user_id, role) REFERENCES users(id, role) ON DELETE CASCADE
);
COMMENT ON COLUMN staff_profile.admin_type IS 'business = Business Admin (full features); frontdesk = Front desk (fewer features, requests exceptions).';

CREATE TABLE membership (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES student_profile(user_id) ON DELETE CASCADE,
    membership_expiry DATE NOT NULL,
    account_status VARCHAR(50) NOT NULL CHECK (account_status IN ('Active', 'Inactive', 'Deactivated', 'Lapsed')),
    last_renewed_at DATE                         -- last annual dues payment
);

CREATE INDEX idx_student_profile_dojo ON student_profile(dojo_id);
CREATE INDEX idx_student_profile_rank ON student_profile(rank_id);
CREATE INDEX idx_student_profile_name ON student_profile(full_name);
CREATE INDEX idx_membership_status ON membership(account_status);

-- =====================================================================
-- 3. PACKAGES AND MONEY
-- =====================================================================
CREATE TABLE package_def (
    id VARCHAR(255) PRIMARY KEY,                 -- a10, a25, a50, aun, k1, k6, k50
    name VARCHAR(255) NOT NULL,
    audience VARCHAR(10) NOT NULL CHECK (audience IN ('adult', 'kids')),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    billing_unit VARCHAR(50),                    -- '/ 2 weeks', '/ month', '/ semester', NULL = one-off
    lessons INT CHECK (lessons > 0),             -- NULL = unlimited
    valid_days INT CHECK (valid_days > 0),
    valid_months INT CHECK (valid_months > 0),
    description VARCHAR(500),
    compassion_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (valid_days IS NOT NULL OR valid_months IS NOT NULL)
);

CREATE TABLE student_package (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    package_id VARCHAR(255) NOT NULL REFERENCES package_def(id) ON DELETE RESTRICT,
    lessons_total INT CHECK (lessons_total > 0),   -- NULL for unlimited
    lessons_left INT CHECK (lessons_left >= 0),
    purchased_at DATE NOT NULL,
    expires_at DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Used up', 'Expired')),
    CHECK ((lessons_total IS NULL) = (lessons_left IS NULL)),
    CHECK (lessons_left IS NULL OR lessons_left <= lessons_total),
    CHECK (expires_at >= purchased_at)
);
COMMENT ON TABLE student_package IS 'A bought package. A student may hold at most 2 Active rows (policy_setting max_packages); enforced by the application and checked in verification.';

CREATE TABLE payment (
    id VARCHAR(255) PRIMARY KEY,                 -- L-1001
    invoice_no VARCHAR(50) NOT NULL UNIQUE,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE RESTRICT,
    item VARCHAR(255) NOT NULL,
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('Package', 'Registration', 'Annual dues', 'Grading fee', 'Dogi', 'Other')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    method VARCHAR(20) NOT NULL CHECK (method IN ('Stripe', 'PayNow', 'Visa')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('Paid', 'Outstanding', 'Processing', 'Failed', 'Voided', 'Refunded')),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('desk', 'online', 'auto')),
    student_package_id VARCHAR(255) REFERENCES student_package(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ,
    note VARCHAR(500),                           -- backend: discount label, void or adjust reason shown on the desk ledger
    CHECK ((status IN ('Paid', 'Refunded')) = (paid_at IS NOT NULL))
);

CREATE TABLE refund_request (
    id VARCHAR(255) PRIMARY KEY,                 -- R-01
    payment_id VARCHAR(255) NOT NULL REFERENCES payment(id) ON DELETE RESTRICT,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL REFERENCES staff_profile(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
    decided_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMPTZ,
    CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE TABLE exception_request (
    id VARCHAR(255) PRIMARY KEY,                 -- X-01
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('registration', 'extension', 'access', 'mistake', 'refund')),
    subject_name VARCHAR(255) NOT NULL,          -- person may not be a member yet
    user_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE SET NULL,
    detail TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL REFERENCES staff_profile(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
    decided_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMPTZ,
    decision_note TEXT,                          -- backend: the Business Admin's reason for the decision
    CHECK ((status = 'pending') = (decided_at IS NULL))
);

CREATE TABLE equipment_order (
    id VARCHAR(255) PRIMARY KEY,                 -- E-01
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    item VARCHAR(255) NOT NULL,
    size VARCHAR(5) CHECK (size IN ('000', '00', '0', '1', '2', '3', '4', '5', '6', '7')),
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Ready at HQ', 'Handed over')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    handed_over_at TIMESTAMPTZ,
    handed_over_to VARCHAR(255),
    CHECK ((status = 'Handed over') = (handed_over_at IS NOT NULL))
);

CREATE INDEX idx_student_package_user ON student_package(user_id);
CREATE INDEX idx_student_package_package ON student_package(package_id);
CREATE INDEX idx_student_package_status ON student_package(status, expires_at);
CREATE INDEX idx_payment_user ON payment(user_id);
CREATE INDEX idx_payment_package ON payment(student_package_id);
CREATE INDEX idx_payment_status ON payment(status);
CREATE INDEX idx_payment_paid_at ON payment(paid_at);
CREATE INDEX idx_refund_payment ON refund_request(payment_id);
CREATE INDEX idx_refund_user ON refund_request(user_id);
CREATE INDEX idx_refund_requested_by ON refund_request(requested_by);
CREATE INDEX idx_refund_decided_by ON refund_request(decided_by);
CREATE INDEX idx_exception_user ON exception_request(user_id);
CREATE INDEX idx_exception_requested_by ON exception_request(requested_by);
CREATE INDEX idx_exception_decided_by ON exception_request(decided_by);
CREATE INDEX idx_exception_status ON exception_request(status);
CREATE INDEX idx_equipment_user ON equipment_order(user_id);

-- =====================================================================
-- 4. ONBOARDING (registration, guests)
-- =====================================================================
CREATE TABLE auto_activation_rule (
    id VARCHAR(255) PRIMARY KEY,                 -- details, consent, paid, medical, guardian
    label VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE registration_application (
    id VARCHAR(255) PRIMARY KEY,                 -- APP-01
    full_name VARCHAR(255) NOT NULL,
    dojo_id VARCHAR(255) NOT NULL REFERENCES dojo(id) ON DELETE RESTRICT,
    applicant_group VARCHAR(10) NOT NULL CHECK (applicant_group IN ('Adult', 'Child')),
    age SMALLINT NOT NULL CHECK (age BETWEEN 3 AND 110),   -- age at application, so no extra date of birth is stored
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('Male', 'Female')),
    nationality VARCHAR(100),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    emergency_contact VARCHAR(255),
    prior_experience VARCHAR(255),
    previous_member BOOLEAN NOT NULL DEFAULT FALSE,
    medical_declaration TEXT,                    -- NULL = answered "No"
    dogi_choice VARCHAR(255),
    package_id VARCHAR(255) REFERENCES package_def(id) ON DELETE SET NULL,
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    signer VARCHAR(255) NOT NULL,                -- the person who signed the consent (guardian for children)
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under review', 'Needs info', 'Approved', 'Rejected')),
    reviewed_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    password_hash VARCHAR(255),                  -- bcrypt hash of the password the applicant chose; kept only while pending, cleared on approve/reject. Never returned by an API.
    user_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE SET NULL   -- set once approved
);

CREATE TABLE application_checklist (
    application_id VARCHAR(255) NOT NULL REFERENCES registration_application(id) ON DELETE CASCADE,
    rule_id VARCHAR(255) NOT NULL REFERENCES auto_activation_rule(id) ON DELETE CASCADE,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (application_id, rule_id)
);

CREATE TABLE guest_pass (
    id VARCHAR(255) PRIMARY KEY,                 -- GP-01
    user_id VARCHAR(255) NOT NULL REFERENCES guest_profile(user_id) ON DELETE CASCADE,
    pass_type VARCHAR(10) NOT NULL CHECK (pass_type IN ('trial', 'single', 'day', 'week', 'month', 'private')),   -- backend: single/month/private added for the trial page
    amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),   -- backend: guests have no student_profile, so no payment row; the price is kept here
    used BOOLEAN NOT NULL DEFAULT FALSE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until DATE                             -- NULL for a trial pass
);

CREATE INDEX idx_reg_app_dojo ON registration_application(dojo_id);
CREATE INDEX idx_reg_app_package ON registration_application(package_id);
CREATE INDEX idx_reg_app_reviewed_by ON registration_application(reviewed_by);
CREATE INDEX idx_reg_app_user ON registration_application(user_id);
CREATE INDEX idx_reg_app_status ON registration_application(status);
CREATE INDEX idx_checklist_rule ON application_checklist(rule_id);
CREATE INDEX idx_guest_pass_user ON guest_pass(user_id);

-- =====================================================================
-- 5. CLASSES, BOOKINGS, ATTENDANCE
-- =====================================================================
-- Weekly rule ("every Monday 19:00 Adults with Bob Tan Sensei")
CREATE TABLE class_template (
    id VARCHAR(255) PRIMARY KEY,                 -- CT-01
    code VARCHAR(50) NOT NULL UNIQUE,            -- class code shown to instructors, e.g. HQ-MON7-5821
    dojo_id VARCHAR(255) NOT NULL REFERENCES dojo(id) ON DELETE RESTRICT,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Monday ... 6 = Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    mat VARCHAR(50) NOT NULL DEFAULT 'Mat A',
    class_type VARCHAR(50) NOT NULL CHECK (class_type IN ('Children Beginners', 'Children Juniors', 'Adults', 'Intermediate', 'Advanced', 'Ladies', 'Weapons', 'Mixed', 'SG50')),
    instructor_id VARCHAR(255) NOT NULL REFERENCES instructor_profile(user_id) ON DELETE RESTRICT,
    capacity INT NOT NULL CHECK (capacity > 0),
    kids_only BOOLEAN NOT NULL DEFAULT FALSE,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,   -- one-to-one lesson, not on the booking timetable
    private_student_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE CASCADE,
    online_bookable BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (end_time > start_time),
    CHECK (is_private = (private_student_id IS NOT NULL)),
    CONSTRAINT online_bookable_hq_only CHECK (dojo_id = 'hq' OR NOT online_bookable)   -- online booking is HQ only
);
COMMENT ON TABLE class_template IS 'Weekly timetable rule. Grading is NOT a class type; see grading_session. Online booking is HQ only (online_bookable_hq_only).';

-- One dated occurrence of a template
CREATE TABLE class_session (
    lesson_id VARCHAR(255) PRIMARY KEY,          -- LS-20261109-1900-HQ-A
    template_id VARCHAR(255) REFERENCES class_template(id) ON DELETE SET NULL,
    dojo_id VARCHAR(255) NOT NULL REFERENCES dojo(id) ON DELETE RESTRICT,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    mat VARCHAR(50) NOT NULL DEFAULT 'Mat A',
    class_type VARCHAR(50) NOT NULL CHECK (class_type IN ('Children Beginners', 'Children Juniors', 'Adults', 'Intermediate', 'Advanced', 'Ladies', 'Weapons', 'Mixed', 'SG50')),
    instructor_id VARCHAR(255) NOT NULL REFERENCES instructor_profile(user_id) ON DELETE RESTRICT,
    capacity INT NOT NULL CHECK (capacity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Ended', 'Cancelled')),
    ended_at TIMESTAMPTZ,
    CHECK (end_time > start_time),
    CHECK ((status = 'Ended') = (ended_at IS NOT NULL))
);

-- Booking + attendance in one row per student per lesson (replaces old class_attendance shape)
CREATE TABLE class_attendance (
    lesson_id VARCHAR(255) NOT NULL REFERENCES class_session(lesson_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- students and guests (walk-ins)
    attendance_status VARCHAR(50) NOT NULL CHECK (attendance_status IN ('Booked', 'Attended', 'No-Show', 'Cancelled')),
    remarks TEXT,
    student_package_id VARCHAR(255) REFERENCES student_package(id) ON DELETE SET NULL,   -- which package paid for it
    booked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    marked_by VARCHAR(255) REFERENCES instructor_profile(user_id) ON DELETE SET NULL,
    marked_at TIMESTAMPTZ,
    booked_via VARCHAR(20) NOT NULL DEFAULT 'online' CHECK (booked_via IN ('online', 'desk', 'walk-in', 'waitlist')),   -- backend: roster "how" column
    PRIMARY KEY (lesson_id, user_id)
);

-- Backend: students waiting for a place in a full class (roster waitlist)
CREATE TABLE class_waitlist (
    lesson_id VARCHAR(255) NOT NULL REFERENCES class_session(lesson_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lesson_id, user_id)
);

CREATE TABLE makeup_class (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    original_lesson_id VARCHAR(255) NOT NULL REFERENCES class_session(lesson_id) ON DELETE CASCADE,
    makeup_lesson_id VARCHAR(255) REFERENCES class_session(lesson_id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Used', 'Expired')),
    expires_at DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (status <> 'Used' OR makeup_lesson_id IS NOT NULL)
);

CREATE TABLE class_closure (
    id VARCHAR(255) PRIMARY KEY,                 -- CL-01
    dojo_id VARCHAR(255) NOT NULL REFERENCES dojo(id) ON DELETE CASCADE,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    note VARCHAR(255),
    CHECK (to_date >= from_date)
);
-- Backend: the closure that cancelled a lesson, so deleting the closure reopens exactly those lessons (a single cancelled class has no closure)
ALTER TABLE class_session ADD COLUMN IF NOT EXISTS closure_id VARCHAR(255) REFERENCES class_closure(id) ON DELETE SET NULL;

-- Anonymous: deliberately no student column
CREATE TABLE class_feedback (
    id VARCHAR(255) PRIMARY KEY,
    lesson_id VARCHAR(255) NOT NULL REFERENCES class_session(lesson_id) ON DELETE CASCADE,
    instructor_id VARCHAR(255) NOT NULL REFERENCES instructor_profile(user_id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    tags TEXT[] NOT NULL DEFAULT '{}',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backend: records only THAT a student answered (or skipped) the rating pop-up for a lesson, so it is not asked twice.
-- It is deliberately a separate table: class_feedback stays anonymous (no link between a rating and a student).
CREATE TABLE class_feedback_prompt (
    lesson_id VARCHAR(255) NOT NULL REFERENCES class_session(lesson_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    state VARCHAR(10) NOT NULL CHECK (state IN ('rated', 'skipped')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lesson_id, user_id)
);

CREATE TABLE instructor_remark (
    id VARCHAR(255) PRIMARY KEY,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('class', 'student', 'grading')),
    lesson_id VARCHAR(255) REFERENCES class_session(lesson_id) ON DELETE CASCADE,
    student_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE CASCADE,
    instructor_id VARCHAR(255) NOT NULL REFERENCES instructor_profile(user_id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (kind = 'class' AND lesson_id IS NOT NULL AND student_id IS NULL) OR
        (kind = 'student' AND lesson_id IS NOT NULL AND student_id IS NOT NULL) OR
        (kind = 'grading' AND student_id IS NOT NULL)
    )
);
COMMENT ON COLUMN instructor_remark.kind IS 'class = whole class note; student = one student in one class; grading = note for the examiner panel (lesson optional).';

-- Location QR scans (students scan the QR code of the dojo they are at)
CREATE TABLE check_in (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    dojo_id VARCHAR(255) NOT NULL REFERENCES dojo(id) ON DELETE RESTRICT,
    lesson_id VARCHAR(255) REFERENCES class_session(lesson_id) ON DELETE SET NULL,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    method VARCHAR(10) NOT NULL DEFAULT 'qr' CHECK (method IN ('qr'))
);

CREATE INDEX idx_class_template_dojo ON class_template(dojo_id);
CREATE INDEX idx_class_template_instructor ON class_template(instructor_id, weekday);
CREATE INDEX idx_class_template_private ON class_template(private_student_id);
CREATE INDEX idx_class_session_template ON class_session(template_id);
CREATE INDEX idx_class_session_dojo_date ON class_session(dojo_id, session_date);
CREATE INDEX idx_class_session_instructor_date ON class_session(instructor_id, session_date);
CREATE INDEX idx_class_session_date ON class_session(session_date);
CREATE INDEX idx_attendance_user ON class_attendance(user_id);
CREATE INDEX idx_waitlist_user ON class_waitlist(user_id);
CREATE INDEX idx_feedback_prompt_user ON class_feedback_prompt(user_id);
CREATE INDEX idx_attendance_package ON class_attendance(student_package_id);
CREATE INDEX idx_attendance_marked_by ON class_attendance(marked_by);
CREATE INDEX idx_makeup_user ON makeup_class(user_id);
CREATE INDEX idx_makeup_original ON makeup_class(original_lesson_id);
CREATE INDEX idx_makeup_makeup ON makeup_class(makeup_lesson_id);
CREATE INDEX idx_closure_dojo_dates ON class_closure(dojo_id, from_date, to_date);
CREATE INDEX idx_feedback_lesson ON class_feedback(lesson_id);
CREATE INDEX idx_feedback_instructor ON class_feedback(instructor_id);
CREATE INDEX idx_remark_lesson ON instructor_remark(lesson_id);
CREATE INDEX idx_remark_student ON instructor_remark(student_id);
CREATE INDEX idx_remark_instructor ON instructor_remark(instructor_id);
CREATE INDEX idx_check_in_user_time ON check_in(user_id, checked_in_at);
CREATE INDEX idx_check_in_dojo ON check_in(dojo_id);
CREATE INDEX idx_check_in_lesson ON check_in(lesson_id);

-- =====================================================================
-- 6. GRADING (separate from classes; always at ASK HQ Dojo)
-- =====================================================================
CREATE TABLE grading_session (
    id VARCHAR(255) PRIMARY KEY,                 -- GR-20261213
    label VARCHAR(255) NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    dojo_id VARCHAR(255) NOT NULL DEFAULT 'hq' REFERENCES dojo(id) ON DELETE RESTRICT,
    lead_examiner_id VARCHAR(255) NOT NULL REFERENCES instructor_profile(user_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'In progress', 'Completed', 'Cancelled')),
    application_close_date DATE,
    CONSTRAINT grading_only_at_hq CHECK (dojo_id = 'hq'),
    CHECK (end_time > start_time)
);
COMMENT ON TABLE grading_session IS 'A grading slot. Own time slot, never a class_session. Venue is always the ASK HQ Dojo (id hq). Examiners must not have a class_template/class_session at the same time (checked in verification).';

CREATE TABLE grading_examiner (
    session_id VARCHAR(255) NOT NULL REFERENCES grading_session(id) ON DELETE CASCADE,
    instructor_id VARCHAR(255) NOT NULL REFERENCES instructor_profile(user_id) ON DELETE RESTRICT,
    PRIMARY KEY (session_id, instructor_id)
);

-- Student asks to grade; HQ (staff) approves or disapproves
CREATE TABLE grading_application (
    id VARCHAR(255) PRIMARY KEY,                 -- GA-01
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    from_rank_id VARCHAR(255) NOT NULL REFERENCES belt_rank(id) ON DELETE RESTRICT,
    to_rank_id VARCHAR(255) NOT NULL REFERENCES belt_rank(id) ON DELETE RESTRICT,
    session_id VARCHAR(255) REFERENCES grading_session(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Approved', 'Rejected', 'Withdrawn')),
    note VARCHAR(500),
    fee_payment_id VARCHAR(255) REFERENCES payment(id) ON DELETE SET NULL,
    decided_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    CHECK (from_rank_id <> to_rank_id)
);

CREATE TABLE grading_candidate (
    session_id VARCHAR(255) NOT NULL REFERENCES grading_session(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    application_id VARCHAR(255) REFERENCES grading_application(id) ON DELETE SET NULL,
    from_rank_id VARCHAR(255) NOT NULL REFERENCES belt_rank(id) ON DELETE RESTRICT,
    to_rank_id VARCHAR(255) NOT NULL REFERENCES belt_rank(id) ON DELETE RESTRICT,
    fee NUMERIC(8, 2) NOT NULL CHECK (fee >= 0),
    result VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (result IN ('Pending', 'Pass', 'Retake', 'Fail')),   -- backend: 'Retake' added (instructor rubric)
    score NUMERIC(5, 2) CHECK (score BETWEEN 0 AND 100),
    well_done TEXT,
    to_improve TEXT,
    examiner_id VARCHAR(255),
    promotion_status VARCHAR(20) NOT NULL DEFAULT 'n/a' CHECK (promotion_status IN ('n/a', 'Pending approval', 'Promoted', 'Declined')),
    promotion_decided_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    promotion_decided_at TIMESTAMPTZ,
    PRIMARY KEY (session_id, user_id),
    FOREIGN KEY (session_id, examiner_id) REFERENCES grading_examiner(session_id, instructor_id),   -- NO ACTION so deleting a whole session cascades cleanly
    CHECK (result = 'Pending' OR examiner_id IS NOT NULL),
    CHECK ((result = 'Pass') = (promotion_status <> 'n/a'))
);
COMMENT ON COLUMN grading_candidate.promotion_status IS 'After a Pass, HQ approves the promotion: Pending approval -> Promoted (student_profile.rank_id updated) or Declined.';

CREATE TABLE grading_history (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    grading_session_id VARCHAR(255) REFERENCES grading_session(id) ON DELETE SET NULL,
    grading_date DATE NOT NULL,
    from_rank_id VARCHAR(255) REFERENCES belt_rank(id) ON DELETE RESTRICT,
    to_rank_id VARCHAR(255) REFERENCES belt_rank(id) ON DELETE RESTRICT,
    grading_remarks TEXT,
    grade BOOLEAN NOT NULL                       -- TRUE = Pass, FALSE = Fail
);

CREATE INDEX idx_grading_session_lead ON grading_session(lead_examiner_id);
CREATE INDEX idx_grading_session_dojo ON grading_session(dojo_id);
CREATE INDEX idx_grading_session_date ON grading_session(session_date);
CREATE INDEX idx_grading_examiner_instructor ON grading_examiner(instructor_id);
CREATE INDEX idx_grading_app_user ON grading_application(user_id);
CREATE INDEX idx_grading_app_from ON grading_application(from_rank_id);
CREATE INDEX idx_grading_app_to ON grading_application(to_rank_id);
CREATE INDEX idx_grading_app_session ON grading_application(session_id);
CREATE INDEX idx_grading_app_payment ON grading_application(fee_payment_id);
CREATE INDEX idx_grading_app_decided_by ON grading_application(decided_by);
CREATE INDEX idx_grading_cand_user ON grading_candidate(user_id);
CREATE INDEX idx_grading_cand_app ON grading_candidate(application_id);
CREATE INDEX idx_grading_cand_from ON grading_candidate(from_rank_id);
CREATE INDEX idx_grading_cand_to ON grading_candidate(to_rank_id);
CREATE INDEX idx_grading_cand_examiner ON grading_candidate(session_id, examiner_id);
CREATE INDEX idx_grading_cand_promo_by ON grading_candidate(promotion_decided_by);
CREATE INDEX idx_grading_hist_user ON grading_history(user_id);
CREATE INDEX idx_grading_hist_session ON grading_history(grading_session_id);
CREATE INDEX idx_grading_hist_from ON grading_history(from_rank_id);
CREATE INDEX idx_grading_hist_to ON grading_history(to_rank_id);

-- Grading never overlaps a lesson. Empty view = healthy. A row means one of:
--   examiner_template  an examiner has a weekly class_template at the grading time (any dojo)
--   examiner_session   an examiner has a non-cancelled class_session at the grading time (any dojo)
--   hq_template_open   an HQ weekly class overlaps the grading slot and no class_closure covers the date
--   hq_session         a non-cancelled HQ class_session overlaps the grading slot
CREATE VIEW v_grading_conflict AS
SELECT 'examiner_template'::text AS conflict, g.id AS grading_id, g.session_date, t.id AS ref_id, t.instructor_id
FROM grading_session g
JOIN grading_examiner e ON e.session_id = g.id
JOIN class_template t ON t.instructor_id = e.instructor_id
 AND t.weekday = EXTRACT(ISODOW FROM g.session_date)::int - 1
 AND t.start_time < g.end_time AND g.start_time < t.end_time
WHERE g.status <> 'Cancelled'
UNION ALL
SELECT 'examiner_session', g.id, g.session_date, s.lesson_id, s.instructor_id
FROM grading_session g
JOIN grading_examiner e ON e.session_id = g.id
JOIN class_session s ON s.instructor_id = e.instructor_id
 AND s.session_date = g.session_date AND s.status <> 'Cancelled'
 AND s.start_time < g.end_time AND g.start_time < s.end_time
WHERE g.status <> 'Cancelled'
UNION ALL
SELECT 'hq_template_open', g.id, g.session_date, t.id, t.instructor_id
FROM grading_session g
JOIN class_template t ON t.dojo_id = g.dojo_id
 AND t.weekday = EXTRACT(ISODOW FROM g.session_date)::int - 1
 AND t.start_time < g.end_time AND g.start_time < t.end_time
WHERE g.status <> 'Cancelled'
  AND NOT EXISTS (SELECT 1 FROM class_closure c
                  WHERE c.dojo_id = g.dojo_id AND g.session_date BETWEEN c.from_date AND c.to_date)
UNION ALL
SELECT 'hq_session', g.id, g.session_date, s.lesson_id, s.instructor_id
FROM grading_session g
JOIN class_session s ON s.dojo_id = g.dojo_id
 AND s.session_date = g.session_date AND s.status <> 'Cancelled'
 AND s.start_time < g.end_time AND g.start_time < s.end_time
WHERE g.status <> 'Cancelled';
COMMENT ON VIEW v_grading_conflict IS 'Rows = grading slot clashes with a lesson or an examiner''s class. Must be empty. Replaces a trigger (none used in this prototype).';

-- =====================================================================
-- 7. OFFICE OPERATIONS AND SETTINGS
-- =====================================================================
CREATE TABLE mc_request (
    id VARCHAR(255) PRIMARY KEY,                 -- MC-01
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    student_package_id VARCHAR(255) NOT NULL REFERENCES student_package(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('MC', 'Compassion')),
    days_requested INT NOT NULL CHECK (days_requested > 0),
    days_granted INT CHECK (days_granted >= 0),
    document_ref VARCHAR(255),                   -- uploaded medical certificate file name
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
    exception_id VARCHAR(255) REFERENCES exception_request(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decision_note TEXT                           -- backend: reason sent to the member when a request is not approved
);

CREATE TABLE followup (
    id VARCHAR(255) PRIMARY KEY,                 -- F-01
    user_id VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('declining', 'renewal', 'newcomer')),   -- backend: 'newcomer' added (Newcomers not returned list)
    owner_id VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    due_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done'))
);

CREATE TABLE followup_attempt (
    id VARCHAR(255) PRIMARY KEY,
    followup_id VARCHAR(255) NOT NULL REFERENCES followup(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    method VARCHAR(20) NOT NULL CHECK (method IN ('WhatsApp', 'Call', 'Email', 'SMS')),
    outcome VARCHAR(255) NOT NULL,
    note TEXT
);

CREATE TABLE notification_template (
    id VARCHAR(255) PRIMARY KEY,                 -- T-1
    name VARCHAR(255) NOT NULL UNIQUE,
    body TEXT NOT NULL
);

CREATE TABLE sent_log (
    id VARCHAR(255) PRIMARY KEY,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_by VARCHAR(255) REFERENCES staff_profile(user_id) ON DELETE SET NULL,
    audience VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    template_id VARCHAR(255) REFERENCES notification_template(id) ON DELETE SET NULL
);

CREATE TABLE import_issue (
    id VARCHAR(255) PRIMARY KEY,                 -- I-01
    file_name VARCHAR(255) NOT NULL,
    row_no INT NOT NULL CHECK (row_no > 0),
    issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN ('Missing information', 'Unmatched name', 'Pipeline error')),
    person_name VARCHAR(255),
    detail TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'dismissed')),
    matched_user_id VARCHAR(255) REFERENCES student_profile(user_id) ON DELETE SET NULL   -- backend: the member a row was matched to when it was fixed
);

-- Booking rules, fees, discounts, follow-up triggers (key/value)
CREATE TABLE policy_setting (
    setting_key VARCHAR(255) PRIMARY KEY,
    value_text TEXT NOT NULL,                    -- backend: was VARCHAR(255); the interventions list is stored here as JSON text
    value_type VARCHAR(10) NOT NULL CHECK (value_type IN ('int', 'numeric', 'text', 'bool')),
    description VARCHAR(500)
);

CREATE INDEX idx_mc_user ON mc_request(user_id);
CREATE INDEX idx_mc_package ON mc_request(student_package_id);
CREATE INDEX idx_mc_exception ON mc_request(exception_id);
CREATE INDEX idx_mc_decided_by ON mc_request(decided_by);
CREATE INDEX idx_followup_user ON followup(user_id);
CREATE INDEX idx_followup_owner ON followup(owner_id);
CREATE INDEX idx_followup_attempt_followup ON followup_attempt(followup_id);
CREATE INDEX idx_sent_log_sent_by ON sent_log(sent_by);
CREATE INDEX idx_sent_log_template ON sent_log(template_id);
CREATE INDEX idx_import_issue_status ON import_issue(status);

-- =====================================================================
-- 8. AUDIT LOG (append-only)
-- =====================================================================
CREATE TABLE audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,   -- NULL for system events and failed sign-ins
    actor_name VARCHAR(255),                     -- snapshots, so a row stays readable if the user is ever removed
    actor_role VARCHAR(20),
    actor_admin_type VARCHAR(20),
    action VARCHAR(60) NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),   -- group.verb, e.g. payment.collected
    entity_type VARCHAR(40),
    entity_id VARCHAR(255),
    summary TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,  -- ids and changed field names; never passwords, hashes, tokens or card data
    ip VARCHAR(64),
    user_agent VARCHAR(255)
);

CREATE INDEX idx_audit_time ON audit_log(occurred_at DESC, id DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- Rejects UPDATE, DELETE and TRUNCATE. The only change allowed is the foreign
-- key's ON DELETE SET NULL (actor_user_id going from a value to NULL).
CREATE FUNCTION audit_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
           AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
            RETURN NEW;
        END IF;
    END IF;
    RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();

COMMENT ON TABLE audit_log IS 'Append-only history of staff, auth, finance, grading and policy actions. A DBA can still DROP the table or the trigger.';
