-- =====================================================================
-- ASK / Aikido Shinju-Kai: seed data (fake, for development only)
-- =====================================================================
-- Run AFTER database/db.sql:   psql -d ask_dojo -f database/seed.sql
-- anchor: today = 2026-11-06 (Fri). Every seeded date/timestamp lies between
-- 2025-11-06 and 2027-11-06. The only exceptions are student_profile.dob and
-- student_profile.joined_on (real historical facts, stored as they are).
-- All accounts use the fake password "password123" (bcrypt hash below,
-- generated with bcryptjs, cost 10). Do not use in production.
--
-- Notes
--  * Joining dates ARE stored (student_profile.joined_on) and are exempt from
--    the 2-year window. The year of member_no equals the year of joined_on.
--    users.created_at for long-time members is 2025-11-07 (system go-live); it
--    means "account row created", not "joined".
--  * Robin Tan Sensei is a 13 Dec 2026 examiner (09:00-12:30). The Sunday 11:00
--    Weapons class (CT-19) is taught by Pang Kim Lock Sensei, and data.js now
--    agrees (Robin keeps Wednesday 20:00 Weapons).
--  * Grading closes the HQ timetable: class_closure rows for grading days are
--    DERIVED from grading_session (one row per grading date that overlaps an HQ
--    weekly class), so no HQ class_session exists on a grading slot. The view
--    v_grading_conflict must return 0 rows.
--  * CT-23..CT-42 are SAMPLE timetables for the 10 open non-HQ dojos (2 classes
--    a week each). No real non-HQ timetable exists (the public site says "ask
--    HQ"). They are not bookable online (HQ only), so they have no bookings.
--  * class_session covers 2026-09-21..2026-12-20.
--  * membership.last_renewed_at is the last annual dues payment inside the
--    date window.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Reference data
-- ---------------------------------------------------------------------
INSERT INTO dojo (id, name, short_name, code, region, address, status, qr_token) VALUES
('hq', 'ASK Headquarters Dojo', 'HQ', 'ASK HQ', 'Central', 'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630', 'Open', 'ASK-QR-HQ-7F3A'),
('bedok', 'ActiveSG Bedok Dojo', 'Bedok', 'BDAS', 'East', 'Heartbeat@Bedok, 11 Bedok North Street 1, #01-02, Singapore 469662', 'Open', 'ASK-QR-BDAS-1C9D'),
('tampines', 'Our Tampines Hub Dojo', 'Tampines', 'OTH', 'East', '1 Tampines Walk, Singapore 528523', 'Open', 'ASK-QR-OTH-82B4'),
('kovan', 'Paya Lebar Kovan Dojo', 'Kovan', 'PLKC', 'North East', '207 Hougang Street 21, Singapore 530207', 'Open', 'ASK-QR-PLKC-5E10'),
('sengkang', 'ActiveSG Sengkang Dojo', 'Sengkang', 'SKAS', 'North East', '57 Anchorvale Road, Singapore 544964', 'Open', 'ASK-QR-SKAS-A7C2'),
('bishan', 'ActiveSG Bishan Dojo', 'Bishan', 'BSAS', 'Central', '5 Bishan Street 14, Singapore 579783', 'Open', 'ASK-QR-BSAS-3D68'),
('toapayoh', 'SAFRA Toa Payoh Dojo', 'Toa Payoh', 'STPY', 'Central', '293 Lorong 6 Toa Payoh, Singapore 319387', 'Open', 'ASK-QR-STPY-90E1'),
('jurong', 'ActiveSG Jurong East Dojo', 'Jurong East', 'JEAS', 'West', '21 Jurong East Street 31, Singapore 609517', 'Open', 'ASK-QR-JEAS-4B27'),
('westcoast', 'West Coast Dojo', 'West Coast', 'WCCC', 'West', '2 Clementi West Street 2, Singapore 129605', 'Open', 'ASK-QR-WCCC-C6F9'),
('woodlands', 'ActiveSG Woodlands Dojo', 'Woodlands', 'WDAS', 'North', '2 Woodlands Street 12, Singapore 738599', 'Open', 'ASK-QR-WDAS-2A85'),
('chongpang', 'Chong Pang Dojo', 'Chong Pang', 'CPCC', 'North', '109 Yishun Ring Road, Singapore 760109', 'Open', 'ASK-QR-CPCC-D13E'),
('tampineswest', 'Tampines West Dojo', 'Tampines W', 'TWCC', 'East', '5 Tampines Avenue 3, Singapore 529705', 'Temporarily closed', 'ASK-QR-TWCC-6B04');

INSERT INTO belt_rank (id, name, sort_order, belt_color, grading_fee) VALUES
('6k', '6th Kyu', 1, '#FFFFFF', 40),
('5k', '5th Kyu', 2, '#E9C84A', 40),
('4k', '4th Kyu', 3, '#8B5A2B', 50),
('3k', '3rd Kyu', 4, '#A0702F', 50),
('2k', '2nd Kyu', 5, '#6E4520', 60),
('1k', '1st Kyu', 6, '#4E3015', 60),
('1d', '1st Dan', 7, '#14161B', 120);

INSERT INTO package_def (id, name, audience, price, billing_unit, lessons, valid_days, valid_months, description, compassion_eligible) VALUES
('a10', '10-lesson pack', 'adult', 270, NULL, 10, 77, NULL, 'Good for 1 class a week', FALSE),
('a25', '25-lesson pack', 'adult', 600, NULL, 25, NULL, 4, 'Most members start here', FALSE),
('a50', '50-lesson pack', 'adult', 980, NULL, 50, NULL, 6, 'For 2 or more classes a week', FALSE),
('aun', 'Unlimited', 'adult', 96, '/ 2 weeks', NULL, 14, NULL, 'Book as many classes as you like (3-month minimum)', FALSE),
('k1', 'Children 1-month pass', 'kids', 150, NULL, 4, 35, NULL, '4 lessons, valid 5 weeks from your first session', TRUE),
('k6', 'Children 6-month pass', 'kids', 139, '/ month', 24, NULL, 6, '24 lessons, or S$834 per semester', FALSE),
('k50', 'Children 50-lesson pack', 'kids', 1200, '/ semester', 50, NULL, 6, 'Valid 6 months from your first session', FALSE);

INSERT INTO policy_setting (setting_key, value_text, value_type, description) VALUES
('registration_fee', '60', 'numeric', 'One-off registration fee (S$)'),
('annual_dues', '48', 'numeric', 'Annual dues (S$)'),
('discount_senior_age', '65', 'int', 'Senior discount applies from this age'),
('discount_senior_pct', '40', 'int', 'Senior discount percent'),
('discount_student_from_age', '17', 'int', 'Student discount lowest age'),
('discount_student_to_age', '25', 'int', 'Student discount highest age'),
('discount_student_pct', '50', 'int', 'Student discount percent'),
('booking_ahead_months', '1', 'int', 'How far ahead a class can be booked (months)'),
('booking_min_days', '1', 'int', 'Minimum days before class to book'),
('cancel_hours', '4', 'int', 'Cancel at least this many hours before class to get the lesson back'),
('max_packages', '2', 'int', 'Maximum Active packages per student'),
('follow_decline_days', '14', 'int', 'Days without attending before a declining follow-up is created'),
('follow_renewal_days', '30', 'int', 'Days before expiry that a renewal follow-up is created'),
('compassion_days', '14', 'int', 'Compassion Guaranteed extension (children 1-month pass)'),
('grading_late_fee', '20', 'numeric', 'Late fee for a grading application after the close date (S$)'),
('payment_methods', 'Stripe', 'text', 'Accepted online payment methods');

INSERT INTO auto_activation_rule (id, label, enabled) VALUES
('details', 'Personal details complete', TRUE),
('consent', 'Consent signed', TRUE),
('paid', 'Registration paid', TRUE),
('medical', 'Medical declaration answered', TRUE),
('guardian', 'Guardian consent for children', TRUE);

INSERT INTO notification_template (id, name, body) VALUES
('T-1', 'Class cancelled', 'Today''s class is cancelled. Your lesson has been returned.'),
('T-2', 'Payment reminder', 'Your annual dues are unpaid. Please pay at the HQ desk or online.'),
('T-3', 'Dojo closed', 'The dojo is closed on the date shown. Classes resume the next day.');

-- ---------------------------------------------------------------------
-- 2. Accounts. Password for every account: password123
-- ---------------------------------------------------------------------
INSERT INTO users (id, role, email, password_hash, created_at, last_login_at)
SELECT t.id, t.role, t.email, h.v, t.created_at::timestamptz, t.last_login_at::timestamptz
FROM (SELECT '$2b$10$T88/9UZzmA2kWCyjDC44VObKDgRfr0bt1x5Fk0u3gqnD4Q8Q5UBTu'::varchar AS v) h,
(VALUES
-- students
('S-001', 'student', 'lervyn@email.com', '2025-11-07 10:00+08', '2026-11-06 08:30+08'),
('S-002', 'student', 'jamie.tan@email.com', '2025-11-07 10:00+08', '2026-11-05 20:10+08'),
('S-003', 'student', 'david.koh@email.com', '2025-11-07 10:00+08', '2026-09-20 19:00+08'),
('S-004', 'student', 'priya.lee@email.com', '2025-11-07 10:00+08', '2026-11-04 21:45+08'),
('S-005', 'student', 'siti.rahman@email.com', '2025-11-07 10:00+08', '2026-11-05 18:30+08'),
('S-006', 'student', 'marcus.lim@email.com', '2026-09-14 15:00+08', '2026-10-12 12:00+08'),
('S-007', 'student', 'grace.yeo@email.com', '2025-11-07 10:00+08', '2026-08-30 10:00+08'),
('S-008', 'student', 'kenji.sato@email.com', '2025-11-07 10:00+08', '2026-11-04 17:20+08'),
('S-009', 'student', 'weijie.chua@email.com', '2025-11-07 10:00+08', '2026-11-03 08:05+08'),
('S-010', 'student', 'hannah.teo@email.com', '2025-11-07 10:00+08', '2026-11-02 22:10+08'),
('S-011', 'student', 'ahmad.karim@email.com', '2025-11-07 10:00+08', '2026-11-04 09:00+08'),
('S-012', 'student', 'ming.ng@email.com', '2025-11-07 10:00+08', '2026-11-01 19:30+08'),
('S-013', 'student', 'rachel.ong@email.com', '2025-11-07 10:00+08', '2026-11-05 07:45+08'),
('S-014', 'student', 'arjun.nair@email.com', '2026-08-14 10:00+08', '2026-08-20 10:00+08'),
('S-015', 'student', 'mei.tan@email.com', '2026-10-07 10:00+08', '2026-11-02 18:00+08'),
('S-016', 'student', 'alvin.lim@email.com', '2025-11-07 10:00+08', '2026-11-01 11:00+08'),
('S-017', 'student', 'pei.goh@email.com', '2026-09-22 10:00+08', '2026-11-03 16:00+08'),
('S-018', 'student', 'kelvin.wong@email.com', '2025-11-07 10:00+08', '2026-10-25 15:00+08'),
('S-019', 'student', 'ryan.chua@email.com', '2026-10-17 10:00+08', '2026-11-05 19:00+08'),
('S-020', 'student', 'siew.eng@email.com', '2025-11-07 10:00+08', '2026-11-04 10:30+08'),
('S-021', 'student', 'ivan.teo@email.com', '2025-11-07 10:00+08', '2026-08-15 10:00+08'),
('S-022', 'student', 'natalie.ho@email.com', '2025-11-07 10:00+08', '2026-09-30 10:00+08'),
('S-023', 'student', 'faisal.h@email.com', '2025-11-07 10:00+08', '2026-11-05 20:00+08'),
('S-024', 'student', 'olivia.sim@email.com', '2025-11-07 10:00+08', '2026-11-03 21:00+08'),
('S-025', 'student', 'ben.ong@email.com', '2025-11-07 10:00+08', '2026-11-02 12:30+08'),
('S-026', 'student', 'lakshmi.p@email.com', '2025-11-07 10:00+08', '2026-11-04 13:00+08'),
('S-027', 'student', 'daniel.park@email.com', '2026-09-07 10:00+08', '2026-09-21 10:00+08'),
('S-028', 'student', 'yuki.t@email.com', '2026-08-12 10:00+08', '2026-09-02 10:00+08'),
('S-029', 'student', 'joel.lee@email.com', '2026-08-23 10:00+08', '2026-11-05 18:45+08'),
-- guests
('G-01', 'guest', 'aisyah@email.com', '2026-11-04 12:00+08', NULL),
('G-02', 'guest', 'tom.becker@email.com', '2026-11-06 09:00+08', '2026-11-06 09:05+08'),
('G-03', 'guest', 'chen.hui@email.com', '2026-11-04 15:00+08', NULL),
('G-04', 'guest', 'ravi.menon@email.com', '2026-10-28 11:00+08', '2026-10-29 18:00+08'),
-- instructors
('INS-0001', 'instructor', 'philip.lee@askdojo.example', '2025-11-07 09:00+08', '2026-10-20 09:00+08'),
('INS-0008', 'instructor', 'chew.englam@askdojo.example', '2025-11-07 09:00+08', '2026-10-18 09:00+08'),
('INS-0012', 'instructor', 'james.moy@askdojo.example', '2025-11-07 09:00+08', '2026-10-22 09:00+08'),
('INS-0015', 'instructor', 'allan.lai@askdojo.example', '2025-11-07 09:00+08', '2026-10-05 09:00+08'),
('INS-0021', 'instructor', 'quah.yonglok@askdojo.example', '2025-11-07 09:00+08', '2026-10-11 09:00+08'),
('INS-0024', 'instructor', 'tan.kokhiang@askdojo.example', '2025-11-07 09:00+08', '2026-11-01 09:00+08'),
('INS-0027', 'instructor', 'ronald.tan@askdojo.example', '2025-11-07 09:00+08', '2026-10-15 09:00+08'),
('INS-0029', 'instructor', 'lim.cheencheen@askdojo.example', '2025-11-07 09:00+08', '2026-11-05 09:00+08'),
('INS-0031', 'instructor', 'steven.goh@askdojo.example', '2025-11-07 09:00+08', '2026-11-03 09:00+08'),
('INS-0033', 'instructor', 'aloyseus.lee@askdojo.example', '2025-11-07 09:00+08', '2026-09-28 09:00+08'),
('INS-0036', 'instructor', 'alexander.lee@askdojo.example', '2025-11-07 09:00+08', '2026-09-30 09:00+08'),
('INS-0038', 'instructor', 'tham.waiyip@askdojo.example', '2025-11-07 09:00+08', '2026-10-09 09:00+08'),
('INS-0042', 'instructor', 'bob.tan@askdojo.example', '2025-11-07 09:00+08', '2026-11-05 18:40+08'),
('INS-0045', 'instructor', 'james.tan@askdojo.example', '2025-11-07 09:00+08', '2026-11-03 18:40+08'),
('INS-0049', 'instructor', 'billy.lim@askdojo.example', '2025-11-07 09:00+08', '2026-10-14 09:00+08'),
('INS-0052', 'instructor', 'pang.kimlock@askdojo.example', '2025-11-07 09:00+08', '2026-11-01 09:00+08'),
('INS-0057', 'instructor', 'robin.tan@askdojo.example', '2025-11-07 09:00+08', '2026-11-01 09:00+08'),
('INS-0063', 'instructor', 'annie.goh@askdojo.example', '2025-11-07 09:00+08', '2026-11-04 09:00+08'),
-- office staff
('ADM-001', 'admin', 'grace.lim@askdojo.example', '2025-11-07 09:00+08', '2026-11-06 08:00+08'),
('ADM-101', 'admin', 'daniel.ong@askdojo.example', '2025-11-07 09:00+08', '2026-11-06 08:15+08'),
('ADM-102', 'admin', 'farah.yusof@askdojo.example', '2025-11-07 09:00+08', '2026-09-19 17:00+08')
) AS t(id, role, email, created_at, last_login_at);

INSERT INTO student_profile (user_id, member_no, full_name, dob, joined_on, gender, age_group, contact_no, dojo_id, rank_id, source,
    total_accumulated_hours, accumulated_hours, weapon_hours, discount_type, guardian_name, guardian_contact, emergency_contact, medical_notes) VALUES
('S-001', 'ASK-2025-1834', 'Lervyn Wong', '2006-03-12', '2025-06-14', 'Male', 'Adult', '9123 4567', 'hq', '4k', 'ASK', 61, 34, 6, 'none', NULL, NULL, 'May Wong (Parent)', NULL),
('S-002', 'ASK-2024-0921', 'Jamie Tan', '1997-06-02', '2024-03-18', 'Male', 'Adult', '9010 2211', 'hq', '3k', 'ASK', 112, 40, 12, 'none', NULL, NULL, 'Linda Tan (Mother)', NULL),
('S-003', 'ASK-2024-1440', 'David Koh', '1985-09-19', '2024-08-13', 'Male', 'Adult', '9232 1100', 'hq', '5k', 'ASK', 28, 28, 3, 'none', NULL, NULL, 'Helen Koh (Spouse)', NULL),
('S-004', 'ASK-2021-0310', 'Priya Lee', '1988-01-25', '2021-01-11', 'Female', 'Adult', '9345 8821', 'hq', '1k', 'ASK', 284, 90, 30, 'none', NULL, NULL, 'Arun Lee (Spouse)', NULL),
('S-005', 'ASK-2022-0788', 'Siti Rahman', '1993-04-11', '2022-05-09', 'Female', 'Adult', '9456 7712', 'kovan', '2k', 'ASK', 176, 50, 14, 'none', NULL, NULL, 'Rahman Ali (Father)', NULL),
('S-006', 'ASK-2026-0102', 'Marcus Lim', '2001-07-08', '2026-09-14', 'Male', 'Adult', '9567 3320', 'toapayoh', '6k', 'ASK', 9, 9, 0, 'none', NULL, NULL, 'Lim Boon Hock (Father)', NULL),
('S-007', 'ASK-2023-1203', 'Grace Yeo', '1992-12-30', '2023-12-05', 'Female', 'Adult', '9678 4431', 'bishan', '5k', 'ASK', 41, 20, 2, 'none', NULL, NULL, 'Yeo Kai Wen (Brother)', NULL),
('S-008', 'ASK-2023-0456', 'Kenji Sato', '1990-10-04', '2023-04-17', 'Male', 'Adult', '9789 5542', 'westcoast', '3k', 'ASK', 98, 30, 8, 'none', NULL, NULL, 'Yumi Sato (Spouse)', NULL),
('S-009', 'ASK-2022-0090', 'Wei Jie Chua', '1984-02-14', '2022-01-24', 'Male', 'Adult', '9890 6653', 'hq', '2k', 'ASK', 190, 60, 20, 'none', NULL, NULL, 'Chua Mei Ling (Spouse)', NULL),
('S-010', 'ASK-2025-0612', 'Hannah Teo', '1999-08-22', '2025-06-21', 'Female', 'Adult', '9901 7764', 'tampines', '5k', 'ASK', 47, 31, 4, 'none', NULL, NULL, 'Teo Siew Hwa (Mother)', NULL),
('S-011', 'ASK-2025-1522', 'Ahmad Karim', '1994-03-03', '2025-04-08', 'Male', 'Adult', '9012 8875', 'hq', '4k', 'ASK', 52, 29, 5, 'none', NULL, NULL, 'Noraini Karim (Spouse)', NULL),
('S-012', 'ASK-2024-1873', 'Ming Ng', '1996-11-17', '2024-10-14', 'Male', 'Adult', '9123 9986', 'hq', '4k', 'ASK', 38, 22, 3, 'none', NULL, NULL, 'Ng Kok Seng (Father)', NULL),
('S-013', 'ASK-2025-2064', 'Rachel Ong', '1991-05-09', '2025-05-27', 'Female', 'Adult', '9234 1097', 'hq', '4k', 'ASK', 66, 35, 6, 'none', NULL, NULL, 'Ong Teck Lee (Spouse)', NULL),
('S-014', 'ASK-2026-2977', 'Arjun Nair', '2002-09-27', '2026-08-14', 'Male', 'Adult', '9345 2108', 'hq', '6k', 'ASK', 5, 5, 0, 'none', NULL, NULL, 'Suresh Nair (Father)', NULL),
('S-015', 'ASK-2026-3101', 'Aiden Tan', '2017-05-14', '2026-10-07', 'Male', 'Child', '9111 2201', 'hq', '6k', 'ASK', 6, 6, 0, 'none', 'Mei Tan', '9111 2201', 'Mei Tan (Mother)', NULL),
('S-016', 'ASK-2025-2718', 'Chloe Lim', '2013-09-02', '2025-07-22', 'Female', 'Child', '9222 3302', 'hq', '5k', 'ASK', 44, 22, 0, 'none', 'Alvin Lim', '9222 3302', 'Alvin Lim (Father)', NULL),
('S-017', 'ASK-2026-3102', 'Ethan Goh', '2019-01-20', '2026-09-22', 'Male', 'Child', '9333 4403', 'hq', '6k', 'ASK', 4, 4, 0, 'none', 'Pei Goh', '9333 4403', 'Pei Goh (Mother)', NULL),
('S-018', 'ASK-2024-2255', 'Sophia Wong', '2011-11-08', '2024-06-18', 'Female', 'Child', '9444 5504', 'bishan', '5k', 'ASK', 61, 30, 0, 'none', 'Kelvin Wong', '9444 5504', 'Kelvin Wong (Father)', NULL),
('S-019', 'ASK-2026-3103', 'Ryan Chua', '2003-03-30', '2026-10-17', 'Male', 'Adult', '9555 6605', 'hq', '6k', 'ASK', 5, 5, 0, 'nsf', NULL, NULL, 'Chua Ah Beng (Father)', NULL),
('S-020', 'ASK-2023-1942', 'Tan Siew Eng', '1957-07-12', '2023-09-12', 'Female', 'Adult', '9666 7706', 'hq', '4k', 'ASK', 132, 60, 10, 'senior', NULL, NULL, 'Tan Wei Ming (Son)', 'Mild knee arthritis'),
('S-021', 'ASK-2022-1177', 'Ivan Teo', '1989-02-17', '2022-07-12', 'Male', 'Adult', '9777 8807', 'hq', '3k', 'ASK', 150, 50, 10, 'none', NULL, NULL, 'Teo Hui Min (Spouse)', NULL),
('S-022', 'ASK-2024-2031', 'Natalie Ho', '1995-12-05', '2024-09-03', 'Female', 'Adult', '9888 9908', 'hq', '5k', 'ASK', 38, 20, 2, 'none', NULL, NULL, 'Ho Chee Keong (Father)', NULL),
('S-023', 'ASK-2025-2490', 'Faisal Hamid', '1991-06-21', '2025-02-18', 'Male', 'Adult', '9999 0009', 'hq', '4k', 'ASK', 52, 20, 4, 'none', NULL, NULL, 'Aisha Hamid (Spouse)', NULL),
('S-024', 'ASK-2025-2511', 'Olivia Sim', '1998-10-10', '2025-09-09', 'Female', 'Adult', '9010 1110', 'hq', '5k', 'ASK', 40, 20, 2, 'none', NULL, NULL, 'Sim Boon Kiat (Father)', NULL),
('S-025', 'ASK-2024-2188', 'Benjamin Ong', '1986-04-03', '2024-03-04', 'Male', 'Adult', '9121 2211', 'hq', '3k', 'ASK', 88, 30, 6, 'none', NULL, NULL, 'Ong Mei Fen (Spouse)', NULL),
('S-026', 'ASK-2023-1650', 'Lakshmi Pillai', '1980-08-26', '2023-06-20', 'Female', 'Adult', '9232 3312', 'hq', '2k', 'ASK', 170, 60, 20, 'none', NULL, NULL, 'Ravi Pillai (Spouse)', NULL),
('S-027', 'EXT-2026-0041', 'Daniel Park', '1994-01-09', '2026-09-07', 'Male', 'Adult', '9343 4413', 'tampines', '6k', 'External', 8, 8, 0, 'none', NULL, NULL, 'Park Ji-ho (Brother)', NULL),
('S-028', 'EXT-2026-0042', 'Yuki Tanaka', '1990-05-28', '2026-08-12', 'Female', 'Adult', '9454 5514', 'bedok', '5k', 'External', 22, 22, 1, 'none', NULL, NULL, 'Hiro Tanaka (Spouse)', NULL),
('S-029', 'ASK-2026-3104', 'Joel Lee', '2000-09-15', '2026-08-23', 'Male', 'Adult', '9565 6615', 'hq', '6k', 'ASK', 7, 7, 0, 'none', NULL, NULL, 'Lee Kah Hock (Father)', NULL);

INSERT INTO guest_profile (user_id, full_name, contact_no, trial_status) VALUES
('G-01', 'Nur Aisyah', '9123 4410', 'Pending'),
('G-02', 'Tom Becker', '8123 7782', 'Pending'),
('G-03', 'Chen Hui', '9011 5530', 'Pending'),
('G-04', 'Ravi Menon', '9876 2201', 'Attended');

INSERT INTO instructor_profile (user_id, full_name, dan_grade, photo_file, is_chief) VALUES
('INS-0001', 'Philip Lee Shihan', 7, 'philip-lee.png', TRUE),
('INS-0008', 'Chew Eng Lam Sensei', 6, 'chew-eng-lam.jpg', FALSE),
('INS-0012', 'James Moy Sensei', 6, 'james-moy.jpg', FALSE),
('INS-0015', 'Allan Lai Sensei', 6, 'allan-lai.jpg', FALSE),
('INS-0042', 'Bob Tan Sensei', 6, 'bob-tan.jpg', FALSE),
('INS-0021', 'Quah Yong Lok Sensei', 6, 'quah-yong-lok.jpg', FALSE),
('INS-0063', 'Annie Goh Sensei', 6, 'annie-goh.jpg', FALSE),
('INS-0024', 'Tan Kok Hiang Sensei', 6, 'tan-kok-hiang.jpg', FALSE),
('INS-0027', 'Ronald Tan Sensei', 5, 'ronald-tan.jpg', FALSE),
('INS-0029', 'Lim Cheen Cheen Sensei', 5, 'lim-cheen-cheen.jpg', FALSE),
('INS-0033', 'Aloyseus Lee Sensei', 5, 'aloyseus-lee.jpg', FALSE),
('INS-0036', 'Alexander Lee Sensei', 5, 'alexander-lee.jpg', FALSE),
('INS-0038', 'Tham Wai Yip Sensei', 5, 'tham-wai-yip.jpg', FALSE),
('INS-0031', 'Steven Goh Sensei', 5, 'steven-goh.jpg', FALSE),
('INS-0045', 'James Tan Sensei', 5, 'james-tan.jpg', FALSE),
('INS-0049', 'Billy Lim Sensei', 5, 'billy-lim.jpg', FALSE),
('INS-0052', 'Pang Kim Lock Sensei', 5, 'pang-kim-lock.jpg', FALSE),
('INS-0057', 'Robin Tan Sensei', 5, 'robin-tan.jpg', FALSE);

INSERT INTO staff_profile (user_id, full_name, admin_type, status) VALUES
('ADM-001', 'Grace Lim', 'business', 'active'),
('ADM-101', 'Daniel Ong', 'frontdesk', 'active'),
('ADM-102', 'Farah Yusof', 'frontdesk', 'inactive');

INSERT INTO membership (user_id, membership_expiry, account_status, last_renewed_at) VALUES
('S-001', '2027-01-02', 'Active', '2026-01-02'),
('S-002', '2027-03-10', 'Active', '2026-03-10'),
('S-003', '2026-10-01', 'Lapsed', NULL),
('S-004', '2027-08-08', 'Active', '2026-08-08'),
('S-005', '2027-11-05', 'Active', '2026-11-05'),
('S-006', '2027-09-14', 'Active', '2026-09-14'),
('S-007', '2026-10-15', 'Lapsed', NULL),
('S-008', '2027-05-20', 'Active', '2026-05-20'),
('S-009', '2027-10-06', 'Active', '2026-10-06'),
('S-010', '2027-06-12', 'Active', '2026-06-12'),
('S-011', '2027-02-18', 'Active', '2026-02-18'),
('S-012', '2027-04-02', 'Active', '2026-04-02'),
('S-013', '2027-05-30', 'Active', '2026-05-30'),
('S-014', '2027-08-14', 'Inactive', '2026-08-14'),
('S-015', '2027-10-07', 'Active', '2026-10-07'),
('S-016', '2027-05-02', 'Active', '2026-05-02'),
('S-017', '2027-09-22', 'Active', '2026-09-22'),
('S-018', '2027-03-30', 'Active', '2026-03-30'),
('S-019', '2027-10-17', 'Active', '2026-10-17'),
('S-020', '2027-01-15', 'Active', '2026-01-15'),
('S-021', '2026-09-07', 'Lapsed', NULL),
('S-022', '2026-10-07', 'Lapsed', NULL),
('S-023', '2027-03-08', 'Active', '2026-03-08'),
('S-024', '2027-04-12', 'Active', '2026-04-12'),
('S-025', '2027-02-06', 'Active', '2026-02-06'),
('S-026', '2027-06-25', 'Active', '2026-06-25'),
('S-027', '2026-12-01', 'Deactivated', '2025-12-01'),
('S-028', '2027-07-12', 'Inactive', '2026-07-12'),
('S-029', '2027-08-23', 'Active', '2026-08-23');

-- ---------------------------------------------------------------------
-- 3. Packages and money
-- ---------------------------------------------------------------------
INSERT INTO student_package (id, user_id, package_id, lessons_total, lessons_left, purchased_at, expires_at, status) VALUES
('SP-001', 'S-001', 'a25', 25, 18, '2026-09-15', '2027-01-15', 'Active'),
('SP-002', 'S-001', 'a25', 25, 25, '2026-11-01', '2027-03-01', 'Active'),
('SP-003', 'S-002', 'aun', NULL, NULL, '2026-11-02', '2026-11-16', 'Active'),
('SP-004', 'S-009', 'a50', 50, 50, '2026-11-03', '2027-05-03', 'Active'),
('SP-005', 'S-008', 'a10', 10, 10, '2026-11-04', '2027-01-20', 'Active'),
('SP-006', 'S-008', 'a25', 25, 14, '2026-09-03', '2027-01-03', 'Active'),
('SP-007', 'S-005', 'a10', 10, 10, '2026-11-06', '2027-01-21', 'Active'),
('SP-008', 'S-015', 'k1', 4, 3, '2026-10-23', '2026-11-27', 'Active'),
('SP-009', 'S-016', 'k6', 24, 12, '2026-08-04', '2027-02-04', 'Active'),
('SP-010', 'S-017', 'k1', 4, 2, '2026-10-16', '2026-11-20', 'Active'),
('SP-011', 'S-018', 'k6', 24, 8, '2026-07-05', '2027-01-05', 'Active'),
('SP-012', 'S-019', 'a10', 10, 9, '2026-10-30', '2027-01-15', 'Active'),
('SP-013', 'S-020', 'a25', 25, 14, '2026-09-25', '2027-01-25', 'Active'),
('SP-014', 'S-021', 'a25', 25, 0, '2026-05-07', '2026-09-07', 'Used up'),
('SP-015', 'S-022', 'a10', 10, 0, '2026-08-01', '2026-10-17', 'Used up'),
('SP-016', 'S-023', 'a10', 10, 3, '2026-08-26', '2026-11-11', 'Active'),
('SP-017', 'S-024', 'a10', 10, 4, '2026-08-30', '2026-11-15', 'Active'),
('SP-018', 'S-025', 'a25', 25, 11, '2026-08-21', '2026-12-21', 'Active'),
('SP-019', 'S-026', 'a25', 25, 6, '2026-08-26', '2026-12-26', 'Active'),
('SP-020', 'S-029', 'a10', 10, 5, '2026-09-30', '2026-12-16', 'Active'),
('SP-021', 'S-011', 'a25', 25, 11, '2026-09-20', '2027-01-20', 'Active'),
('SP-022', 'S-013', 'a10', 10, 7, '2026-10-02', '2026-12-18', 'Active'),
('SP-023', 'S-001', 'a10', 10, 0, '2025-11-20', '2026-02-05', 'Used up'),
('SP-024', 'S-002', 'aun', NULL, NULL, '2026-10-12', '2026-10-26', 'Expired');

INSERT INTO payment (id, invoice_no, user_id, item, kind, amount, method, status, channel, student_package_id, created_at, paid_at)
SELECT id, invoice_no, user_id, item, kind, amount, method, status, channel, student_package_id, created_at::timestamptz,
       CASE WHEN status IN ('Paid', 'Refunded') THEN created_at::timestamptz END
FROM (VALUES
('L-1001', 'INV-2050037', 'S-001', '25-lesson pack', 'Package', 600, 'Stripe', 'Paid', 'online', 'SP-002', '2026-11-01 10:12+08'),
('L-1002', 'INV-2050074', 'S-002', 'Unlimited · 2 weeks', 'Package', 96, 'Stripe', 'Paid', 'auto', 'SP-003', '2026-11-02 06:00+08'),
('L-1003', 'INV-2050111', 'S-009', '50-lesson pack', 'Package', 980, 'Stripe', 'Paid', 'desk', 'SP-004', '2026-11-03 14:20+08'),
('L-1004', 'INV-2050148', 'S-008', '10-lesson pack', 'Package', 270, 'Stripe', 'Paid', 'online', 'SP-005', '2026-11-04 09:41+08'),
('L-1005', 'INV-2050185', 'S-005', 'Annual dues', 'Annual dues', 48, 'Stripe', 'Paid', 'desk', NULL, '2026-11-05 18:05+08'),
('L-1006', 'INV-2050222', 'S-010', 'Grading fee', 'Grading fee', 50, 'Stripe', 'Paid', 'desk', NULL, '2026-09-12 12:30+08'),
('L-1007', 'INV-2050259', 'S-002', 'Unlimited · 2 weeks', 'Package', 96, 'Stripe', 'Processing', 'auto', NULL, '2026-11-06 06:00+08'),
('L-1008', 'INV-2050296', 'S-003', 'Annual dues', 'Annual dues', 48, 'Stripe', 'Outstanding', 'desk', NULL, '2026-11-06 09:00+08'),
('L-1009', 'INV-2050333', 'S-007', 'Annual dues', 'Annual dues', 48, 'Stripe', 'Outstanding', 'desk', NULL, '2026-11-06 09:00+08'),
('L-1010', 'INV-2050370', 'S-006', '10-lesson pack', 'Package', 270, 'Stripe', 'Failed', 'auto', NULL, '2026-11-06 07:15+08'),
('L-1011', 'INV-2050407', 'S-004', 'Grading fee', 'Grading fee', 120, 'Stripe', 'Paid', 'desk', NULL, '2026-11-06 11:10+08'),
('L-1012', 'INV-2050444', 'S-001', 'Dogi', 'Dogi', 85, 'Stripe', 'Paid', 'desk', NULL, '2026-10-20 19:40+08'),
('L-1013', 'INV-2050481', 'S-002', 'Unlimited · 2 weeks', 'Package', 96, 'Stripe', 'Paid', 'auto', 'SP-024', '2026-10-12 06:00+08'),
('L-1014', 'INV-2050518', 'S-009', 'Annual dues', 'Annual dues', 48, 'Stripe', 'Paid', 'desk', NULL, '2026-10-06 18:30+08'),
('L-1015', 'INV-2050555', 'S-006', 'Registration', 'Registration', 60, 'Stripe', 'Paid', 'desk', NULL, '2026-09-14 15:00+08'),
('L-1016', 'INV-2050592', 'S-008', '25-lesson pack', 'Package', 600, 'Stripe', 'Paid', 'online', 'SP-006', '2026-09-03 20:10+08'),
('L-1017', 'INV-2050629', 'S-004', 'Annual dues', 'Annual dues', 48, 'Stripe', 'Paid', 'desk', NULL, '2026-08-08 17:45+08'),
('L-1018', 'INV-2050666', 'S-005', '10-lesson pack', 'Package', 270, 'Stripe', 'Paid', 'desk', 'SP-007', '2026-11-06 10:20+08'),
('L-1019', 'INV-2050703', 'S-008', '10-lesson pack', 'Package', 270, 'Stripe', 'Paid', 'online', NULL, '2026-11-04 09:42+08'),
('L-1020', 'INV-2050740', 'S-002', 'Unlimited · 2 weeks', 'Package', 96, 'Stripe', 'Voided', 'desk', NULL, '2026-10-28 19:30+08'),
('L-1021', 'INV-2050777', 'S-024', 'Dogi', 'Dogi', 85, 'Stripe', 'Refunded', 'desk', NULL, '2026-10-02 18:50+08'),
('L-1022', 'INV-2041870', 'S-001', '25-lesson pack', 'Package', 600, 'Visa', 'Paid', 'online', 'SP-001', '2026-09-15 20:00+08'),
('L-1023', 'INV-2042181', 'S-001', 'Annual dues 2026', 'Annual dues', 48, 'Visa', 'Paid', 'online', NULL, '2026-01-02 12:00+08'),
('L-1024', 'INV-2042492', 'S-001', '10-lesson pack', 'Package', 270, 'PayNow', 'Paid', 'online', 'SP-023', '2025-11-20 21:15+08'),
('L-1025', 'INV-2050925', 'S-001', 'Grading fee', 'Grading fee', 40, 'Stripe', 'Paid', 'desk', NULL, '2025-12-01 19:20+08'),
('L-1026', 'INV-2050962', 'S-001', 'Grading fee', 'Grading fee', 50, 'Stripe', 'Paid', 'desk', NULL, '2026-03-02 19:25+08'),
('L-1027', 'INV-2050999', 'S-023', 'Grading fee', 'Grading fee', 50, 'Stripe', 'Paid', 'desk', NULL, '2025-12-02 19:10+08'),
('L-1028', 'INV-2051036', 'S-024', 'Grading fee', 'Grading fee', 40, 'Stripe', 'Paid', 'desk', NULL, '2026-03-03 18:55+08'),
('L-1029', 'INV-2051073', 'S-020', 'Grading fee', 'Grading fee', 50, 'Stripe', 'Paid', 'desk', NULL, '2026-03-03 11:05+08'),
('L-1030', 'INV-2051110', 'S-005', 'Grading fee', 'Grading fee', 60, 'Stripe', 'Paid', 'desk', NULL, '2026-09-14 12:00+08'),
('L-1031', 'INV-2051147', 'S-025', 'Grading fee', 'Grading fee', 60, 'Stripe', 'Paid', 'desk', NULL, '2026-09-14 12:10+08'),
('L-1032', 'INV-2051184', 'S-002', 'Grading fee', 'Grading fee', 60, 'Stripe', 'Paid', 'desk', NULL, '2026-11-01 13:00+08'),
('L-1033', 'INV-2051221', 'S-009', 'Grading fee', 'Grading fee', 60, 'Stripe', 'Paid', 'desk', NULL, '2026-10-29 13:30+08')
) AS v(id, invoice_no, user_id, item, kind, amount, method, status, channel, student_package_id, created_at);

INSERT INTO refund_request (id, payment_id, user_id, amount, reason, requested_by, status, decided_by, requested_at, decided_at) VALUES
('R-01', 'L-1019', 'S-008', 270, 'Charged twice by Stripe', 'ADM-101', 'pending', NULL, '2026-11-05 10:00+08', NULL),
('R-02', 'L-1015', 'S-006', 60, 'Moving overseas before the first class', 'ADM-101', 'declined', 'ADM-001', '2026-10-31 14:00+08', '2026-11-01 09:30+08'),
('R-03', 'L-1021', 'S-024', 85, 'Wrong size, dogi returned unused', 'ADM-101', 'approved', 'ADM-001', '2026-10-03 11:00+08', '2026-10-04 09:00+08');

INSERT INTO exception_request (id, kind, subject_name, user_id, detail, requested_by, status, decided_by, requested_at, decided_at) VALUES
('X-01', 'registration', 'Liu Wei', NULL, 'Wants to carry over 1st Kyu from Aikikai Beijing. Needs record check.', 'ADM-101', 'pending', NULL, '2026-11-05 15:00+08', NULL),
('X-02', 'extension', 'Ahmad Karim', 'S-011', 'MC covers 21 days, over the 14 day limit.', 'ADM-101', 'pending', NULL, '2026-11-04 11:30+08', NULL),
('X-03', 'mistake', 'Jamie Tan', 'S-002', 'Payment taken twice at the desk on the same day.', 'ADM-101', 'pending', NULL, '2026-11-03 20:15+08', NULL),
('X-04', 'access', 'Rachel Ong', 'S-013', 'Asked to join Advanced class at 2nd Kyu.', 'ADM-101', 'declined', 'ADM-001', '2026-10-29 19:40+08', '2026-10-30 10:00+08');

INSERT INTO equipment_order (id, user_id, item, size, paid, status, requested_at, handed_over_at, handed_over_to) VALUES
('E-01', 'S-006', 'Dogi, handbook, belt', '3', TRUE, 'Ready at HQ', '2026-11-02 12:00+08', NULL, NULL),
('E-02', 'S-010', 'Dogi', '1', TRUE, 'Requested', '2026-11-04 12:00+08', NULL, NULL),
('E-03', 'S-003', 'Belt', NULL, FALSE, 'Requested', '2026-11-05 12:00+08', NULL, NULL),
('E-04', 'S-001', 'Dogi', '4', TRUE, 'Handed over', '2026-10-07 12:00+08', '2026-10-09 19:00+08', 'Lervyn Wong');

-- ---------------------------------------------------------------------
-- 4. Onboarding
-- ---------------------------------------------------------------------
INSERT INTO registration_application (id, full_name, dojo_id, applicant_group, age, gender, nationality, phone, email, emergency_contact,
    prior_experience, previous_member, medical_declaration, dogi_choice, package_id, amount_paid, signer, submitted_at, status,
    reviewed_by, reviewed_at, review_note, user_id) VALUES
('APP-01', 'Sarah Lee', 'hq', 'Adult', 27, 'Female', 'Singaporean', '9001 2345', 'sarah.lee@email.com', 'Daniel Lee (Spouse) · 9002 3456',
    NULL, FALSE, NULL, 'Cotton (Standard), size 3', 'a25', 690, 'Sarah Lee', '2026-11-01 11:00+08', 'Submitted', NULL, NULL, NULL, NULL),
('APP-02', 'Raj Kumaran', 'kovan', 'Adult', 34, 'Male', 'Singapore PR', '9123 9876', 'raj.k@email.com', 'Meena Kumaran (Spouse) · 9765 4321',
    'Karate, 2 years · 7th Kyu', FALSE, 'Mild asthma, carries inhaler', 'Heavyweight Cotton, size 5', 'a10', 375, 'Raj Kumaran', '2026-10-31 15:30+08', 'Under review', NULL, NULL, NULL, NULL),
('APP-03', 'Liu Wei', 'toapayoh', 'Adult', 41, 'Male', 'Chinese', '8234 5566', 'liu.wei@email.com', 'Zhang Min (Spouse) · 8123 4455',
    'Aikido (Aikikai Beijing), 1st Kyu', FALSE, NULL, 'Competition Grade, size 4', 'a50', 1100, 'Liu Wei', '2026-10-30 10:20+08', 'Needs info', 'ADM-101', '2026-11-05 15:00+08', 'Record check needed for carried-over rank (see X-01).', NULL),
('APP-04', 'Emma Koh', 'bishan', 'Child', 9, 'Female', 'Singaporean', '9345 6789', 'koh.family@email.com', 'Jason Koh (Parent) · 9345 6789',
    NULL, FALSE, 'Peanut allergy', 'Cotton (Standard), size 0', 'k1', 240, 'Jason Koh (parent/guardian)', '2026-10-29 09:45+08', 'Submitted', NULL, NULL, NULL, NULL),
('APP-05', 'Ryan Chua', 'hq', 'Adult', 23, 'Male', 'Singaporean', '9555 6605', 'ryan.chua@email.com', 'Chua Ah Beng (Father) · 9555 0000',
    NULL, FALSE, NULL, 'Cotton (Standard), size 4', 'a10', 330, 'Ryan Chua', '2026-10-16 18:00+08', 'Approved', 'ADM-101', '2026-10-17 10:00+08', 'All checks passed.', 'S-019'),
('APP-06', 'Tommy Lau', 'hq', 'Adult', 31, 'Male', 'Singaporean', '9666 1234', 'tommy.lau@email.com', 'Lau Mei (Sister) · 9666 4321',
    NULL, TRUE, NULL, NULL, 'a10', 0, 'Tommy Lau', '2026-09-22 16:00+08', 'Rejected', 'ADM-001', '2026-09-23 09:30+08', 'Duplicate of an existing member record.', NULL);

INSERT INTO application_checklist (application_id, rule_id, done)
SELECT a.id, r.id,
  CASE a.id
    WHEN 'APP-01' THEN TRUE
    WHEN 'APP-02' THEN r.id <> 'paid'
    WHEN 'APP-03' THEN r.id <> 'medical' AND r.id <> 'details'
    WHEN 'APP-04' THEN r.id <> 'guardian'
    WHEN 'APP-05' THEN TRUE
    ELSE FALSE
  END
FROM registration_application a
CROSS JOIN auto_activation_rule r
WHERE r.id <> 'guardian' OR a.applicant_group = 'Child';

INSERT INTO guest_pass (id, user_id, pass_type, used, issued_at, valid_until) VALUES
('GP-01', 'G-01', 'trial', FALSE, '2026-11-04 12:00+08', NULL),
('GP-02', 'G-02', 'day', FALSE, '2026-11-06 09:00+08', '2026-11-06'),
('GP-03', 'G-03', 'week', FALSE, '2026-11-04 15:00+08', '2026-11-11'),
('GP-04', 'G-04', 'trial', TRUE, '2026-10-28 11:00+08', NULL);

-- ---------------------------------------------------------------------
-- 5. Grading slots, then classes. Weekly templates (HQ + SAMPLE non-HQ), then
--    dated sessions 2026-09-21..2026-12-20. Grading slots come first because
--    HQ class closures are derived from them.
-- ---------------------------------------------------------------------
-- Grading: own slots at HQ, never during an examiner's normal class
INSERT INTO grading_session (id, label, session_date, start_time, end_time, dojo_id, lead_examiner_id, status, application_close_date) VALUES
('GR-20251214', 'December Grading 2025', '2025-12-14', '09:00', '12:00', 'hq', 'INS-0042', 'Completed', '2025-11-30'),
('GR-20260315', 'March Grading 2026', '2026-03-15', '09:00', '12:00', 'hq', 'INS-0031', 'Completed', '2026-03-01'),
('GR-20260927', 'September Grading 2026', '2026-09-27', '09:00', '12:00', 'hq', 'INS-0031', 'Completed', '2026-09-13'),
('GR-20261213', 'December Grading 2026', '2026-12-13', '09:00', '12:30', 'hq', 'INS-0042', 'Scheduled', '2026-11-29');

INSERT INTO grading_examiner (session_id, instructor_id) VALUES
('GR-20251214', 'INS-0042'), ('GR-20251214', 'INS-0008'), ('GR-20251214', 'INS-0012'),
('GR-20260315', 'INS-0031'), ('GR-20260315', 'INS-0042'), ('GR-20260315', 'INS-0008'),
('GR-20260927', 'INS-0031'), ('GR-20260927', 'INS-0057'), ('GR-20260927', 'INS-0042'),
('GR-20261213', 'INS-0042'), ('GR-20261213', 'INS-0031'), ('GR-20261213', 'INS-0057');

INSERT INTO class_template (id, code, dojo_id, weekday, start_time, end_time, mat, class_type, instructor_id, capacity, kids_only, is_private, private_student_id, online_bookable) VALUES
('CT-01', 'HQ-MON6-5821', 'hq', 0, '18:00', '19:00', 'Mat A', 'Children Beginners', 'INS-0029', 14, TRUE, FALSE, NULL, TRUE),
('CT-02', 'HQ-MON7-5958', 'hq', 0, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0042', 20, FALSE, FALSE, NULL, TRUE),
('CT-03', 'HQ-MON8-6095', 'hq', 0, '20:00', '21:00', 'Mat A', 'Intermediate', 'INS-0042', 16, FALSE, FALSE, NULL, TRUE),
('CT-04', 'HQ-TUE6-6232', 'hq', 1, '18:00', '19:00', 'Mat A', 'Children Juniors', 'INS-0063', 12, TRUE, FALSE, NULL, TRUE),
('CT-05', 'HQ-TUE7-6369', 'hq', 1, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0045', 20, FALSE, FALSE, NULL, TRUE),
('CT-06', 'HQ-TUE8-6506', 'hq', 1, '20:00', '21:00', 'Mat A', 'Ladies', 'INS-0063', 14, FALSE, FALSE, NULL, TRUE),
('CT-07', 'HQ-WED7-6643', 'hq', 2, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0042', 20, FALSE, FALSE, NULL, TRUE),
('CT-08', 'HQ-WED8-6780', 'hq', 2, '20:00', '21:00', 'Mat A', 'Weapons', 'INS-0057', 12, FALSE, FALSE, NULL, TRUE),
('CT-09', 'HQ-THU6-6917', 'hq', 3, '18:00', '19:00', 'Mat A', 'Children Beginners', 'INS-0029', 14, TRUE, FALSE, NULL, TRUE),
('CT-10', 'HQ-THU7-7054', 'hq', 3, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0031', 18, FALSE, FALSE, NULL, TRUE),
('CT-11', 'HQ-THU8-7191', 'hq', 3, '20:00', '21:00', 'Mat A', 'Advanced', 'INS-0042', 14, FALSE, FALSE, NULL, TRUE),
('CT-12', 'HQ-FRI7-7328', 'hq', 4, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0042', 20, FALSE, FALSE, NULL, TRUE),
('CT-13', 'HQ-FRI8-7465', 'hq', 4, '20:00', '21:00', 'Mat A', 'Mixed', 'INS-0024', 18, FALSE, FALSE, NULL, TRUE),
('CT-14', 'HQ-SAT9-7602', 'hq', 5, '09:00', '10:00', 'Mat A', 'Children Juniors', 'INS-0029', 12, TRUE, FALSE, NULL, TRUE),
('CT-15', 'HQ-SAT10-7739', 'hq', 5, '10:00', '11:00', 'Mat A', 'Children Beginners', 'INS-0029', 14, TRUE, FALSE, NULL, TRUE),
('CT-16', 'HQ-SAT11-7876', 'hq', 5, '11:00', '12:00', 'Mat A', 'Mixed', 'INS-0042', 20, FALSE, FALSE, NULL, TRUE),
('CT-17', 'HQ-SUN9-8013', 'hq', 6, '09:00', '10:00', 'Mat A', 'Adults', 'INS-0024', 20, FALSE, FALSE, NULL, TRUE),
('CT-18', 'HQ-SUN10-8150', 'hq', 6, '10:00', '11:00', 'Mat A', 'SG50', 'INS-0063', 16, FALSE, FALSE, NULL, TRUE),
-- taught by Pang Kim Lock Sensei so Robin Tan is free for the 13 Dec grading panel (data.js agrees)
('CT-19', 'HQ-SUN11-8287', 'hq', 6, '11:00', '12:00', 'Mat A', 'Weapons', 'INS-0052', 12, FALSE, FALSE, NULL, TRUE),
-- one-to-one lessons (office-arranged, not on the online timetable)
('CT-20', 'HQ-MON5-9001', 'hq', 0, '17:00', '18:00', 'Mat B', 'Advanced', 'INS-0042', 1, FALSE, TRUE, 'S-004', FALSE),
('CT-21', 'HQ-WED6-9002', 'hq', 2, '18:00', '19:00', 'Mat B', 'Adults', 'INS-0042', 1, FALSE, TRUE, 'S-002', FALSE),
('CT-22', 'HQ-SAT10-9003', 'hq', 5, '10:00', '11:00', 'Mat B', 'Intermediate', 'INS-0042', 1, FALSE, TRUE, 'S-012', FALSE),
-- SAMPLE data: weekly timetables for the 10 open non-HQ dojos (2 classes each, none for tampineswest which is
-- temporarily closed). There is no real source: the public site says "ask HQ for this term's timetable".
-- Not bookable online (HQ only), mirrored by OTHER_DOJO_CLASSES in data.js.
('CT-23', 'BEDOK-TUE7-8424', 'bedok', 1, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0008', 16, FALSE, FALSE, NULL, FALSE),
('CT-24', 'BEDOK-SAT10-8561', 'bedok', 5, '10:00', '11:00', 'Mat A', 'Children Beginners', 'INS-0027', 12, TRUE, FALSE, NULL, FALSE),
('CT-25', 'TAMPINES-MON7-8698', 'tampines', 0, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0021', 18, FALSE, FALSE, NULL, FALSE),
('CT-26', 'TAMPINES-SAT11-8835', 'tampines', 5, '11:00', '12:00', 'Mat A', 'Mixed', 'INS-0033', 16, FALSE, FALSE, NULL, FALSE),
('CT-27', 'KOVAN-WED7-8972', 'kovan', 2, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0015', 16, FALSE, FALSE, NULL, FALSE),
('CT-28', 'KOVAN-SUN10-9109', 'kovan', 6, '10:00', '11:00', 'Mat A', 'Children Beginners', 'INS-0036', 12, TRUE, FALSE, NULL, FALSE),
('CT-29', 'SENGKANG-THU8-9246', 'sengkang', 3, '20:00', '21:00', 'Mat A', 'Adults', 'INS-0038', 16, FALSE, FALSE, NULL, FALSE),
('CT-30', 'SENGKANG-SAT9-9383', 'sengkang', 5, '09:00', '10:00', 'Mat A', 'Children Juniors', 'INS-0049', 12, TRUE, FALSE, NULL, FALSE),
('CT-31', 'BISHAN-MON8-9520', 'bishan', 0, '20:00', '21:00', 'Mat A', 'Adults', 'INS-0012', 16, FALSE, FALSE, NULL, FALSE),
('CT-32', 'BISHAN-TUE6-9657', 'bishan', 1, '18:00', '19:00', 'Mat A', 'Children Beginners', 'INS-0024', 14, TRUE, FALSE, NULL, FALSE),
('CT-33', 'TOAPAYOH-WED8-9794', 'toapayoh', 2, '20:00', '21:00', 'Mat A', 'Mixed', 'INS-0021', 18, FALSE, FALSE, NULL, FALSE),
('CT-34', 'TOAPAYOH-THU7-9931', 'toapayoh', 3, '19:00', '20:00', 'Mat A', 'SG50', 'INS-0008', 14, FALSE, FALSE, NULL, FALSE),
('CT-35', 'JURONGEAST-MON7-1068', 'jurong', 0, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0015', 16, FALSE, FALSE, NULL, FALSE),
('CT-36', 'JURONGEAST-SAT10-1205', 'jurong', 5, '10:00', '11:00', 'Mat A', 'Children Juniors', 'INS-0012', 12, TRUE, FALSE, NULL, FALSE),
('CT-37', 'WESTCOAST-TUE8-1342', 'westcoast', 1, '20:00', '21:00', 'Mat A', 'Adults', 'INS-0027', 16, FALSE, FALSE, NULL, FALSE),
('CT-38', 'WESTCOAST-SUN9-1479', 'westcoast', 6, '09:00', '10:00', 'Mat A', 'Mixed', 'INS-0033', 16, FALSE, FALSE, NULL, FALSE),
('CT-39', 'WOODLANDS-WED7-1616', 'woodlands', 2, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0038', 16, FALSE, FALSE, NULL, FALSE),
('CT-40', 'WOODLANDS-SUN10-1753', 'woodlands', 6, '10:00', '11:00', 'Mat A', 'Children Beginners', 'INS-0049', 12, TRUE, FALSE, NULL, FALSE),
('CT-41', 'CHONGPANG-FRI7-1890', 'chongpang', 4, '19:00', '20:00', 'Mat A', 'Adults', 'INS-0036', 14, FALSE, FALSE, NULL, FALSE),
('CT-42', 'CHONGPANG-WED6-2027', 'chongpang', 2, '18:00', '19:00', 'Mat A', 'Children Juniors', 'INS-0024', 12, TRUE, FALSE, NULL, FALSE);

INSERT INTO class_closure (id, dojo_id, from_date, to_date, note) VALUES
('CL-01', 'hq', '2026-11-26', '2026-11-26', 'Public holiday'),
('CL-02', 'hq', '2026-10-10', '2026-10-11', 'Mat resurfacing');

-- Grading closes the HQ timetable: one closure per grading date that overlaps an HQ weekly class.
-- Derived, so any future grading_session is covered by re-running this statement.
INSERT INTO class_closure (id, dojo_id, from_date, to_date, note)
SELECT 'CL-' || g.id, g.dojo_id, g.session_date, g.session_date, 'Grading day: Sunday classes paused'
FROM grading_session g
WHERE EXISTS (SELECT 1 FROM class_template t
              WHERE t.dojo_id = g.dojo_id
                AND t.weekday = extract(isodow FROM g.session_date)::int - 1
                AND t.start_time < g.end_time AND g.start_time < t.end_time);

-- Dated occurrences for every template, 2026-09-21..2026-12-20 (closures excluded)
INSERT INTO class_session (lesson_id, template_id, dojo_id, session_date, start_time, end_time, mat, class_type, instructor_id, capacity, status, ended_at)
SELECT 'LS-' || to_char(d.day, 'YYYYMMDD') || '-' || to_char(t.start_time, 'HH24MI') || '-' || upper(t.dojo_id) || '-' || right(t.mat, 1),
       t.id, t.dojo_id, d.day, t.start_time, t.end_time, t.mat, t.class_type, t.instructor_id, t.capacity,
       CASE WHEN d.day < DATE '2026-11-06' THEN 'Ended' ELSE 'Scheduled' END,
       CASE WHEN d.day < DATE '2026-11-06' THEN ((d.day + t.end_time)::timestamp AT TIME ZONE 'Asia/Singapore') END
FROM class_template t
CROSS JOIN (SELECT g::date AS day FROM generate_series(DATE '2026-09-21', DATE '2026-12-20', INTERVAL '1 day') g) d
WHERE extract(isodow FROM d.day)::int - 1 = t.weekday
  AND NOT EXISTS (SELECT 1 FROM class_closure c WHERE c.dojo_id = t.dojo_id AND d.day BETWEEN c.from_date AND c.to_date);

-- Tue 3 Nov 19:00 Adults was cancelled (see sent_log). Ended -> Cancelled, so no ended_at.
UPDATE class_session SET status = 'Cancelled', ended_at = NULL WHERE lesson_id = 'LS-20261103-1900-HQ-A';

-- Explicit rows: demo student Lervyn Wong, a few others, one guest walk-in
INSERT INTO class_attendance (lesson_id, user_id, attendance_status, remarks, student_package_id, booked_at)
SELECT v.lesson_id, v.user_id, v.st, v.remarks, v.pkg,
       ((LEAST(cs.session_date - 3, DATE '2026-11-05') + TIME '10:00')::timestamp AT TIME ZONE 'Asia/Singapore')
FROM (VALUES
('LS-20261028-1900-HQ-A', 'S-001', 'Attended', NULL, 'SP-001'),
('LS-20261029-1900-HQ-A', 'S-001', 'No-Show', 'Did not turn up; lesson stays used', 'SP-001'),
('LS-20261030-1900-HQ-A', 'S-001', 'Attended', NULL, 'SP-001'),
('LS-20261031-1100-HQ-A', 'S-001', 'Attended', NULL, 'SP-001'),
('LS-20261102-1900-HQ-A', 'S-001', 'Attended', NULL, 'SP-001'),
('LS-20261103-1900-HQ-A', 'S-001', 'Cancelled', 'Class cancelled by the dojo; lesson returned', 'SP-001'),
('LS-20261104-1900-HQ-A', 'S-001', 'Attended', NULL, 'SP-001'),
('LS-20261106-1900-HQ-A', 'S-001', 'Booked', NULL, 'SP-001'),
('LS-20261109-1900-HQ-A', 'S-001', 'Booked', NULL, 'SP-001'),
('LS-20261111-1900-HQ-A', 'S-001', 'Booked', NULL, 'SP-001'),
('LS-20261112-1900-HQ-A', 'S-001', 'Cancelled', 'Cancelled by student 2 days ahead; lesson returned', 'SP-001'),
('LS-20261103-1900-HQ-A', 'S-002', 'Cancelled', 'Class cancelled by the dojo', 'SP-003'),
('LS-20261109-1900-HQ-A', 'S-002', 'Booked', 'Make-up for 3 Nov', 'SP-003'),
('LS-20261103-1900-HQ-A', 'S-012', 'Cancelled', 'Class cancelled by the dojo', NULL),
('LS-20261029-1900-HQ-A', 'G-04', 'Attended', 'Trial class', NULL)
) AS v(lesson_id, user_id, st, remarks, pkg)
JOIN class_session cs ON cs.lesson_id = v.lesson_id;

-- Private lessons: the arranged student attends, future ones are Booked
INSERT INTO class_attendance (lesson_id, user_id, attendance_status, student_package_id, booked_at)
SELECT cs.lesson_id, ct.private_student_id,
       CASE WHEN cs.session_date < DATE '2026-11-06' THEN 'Attended' ELSE 'Booked' END,
       NULL,
       ((LEAST(cs.session_date - 7, DATE '2026-11-05') + TIME '10:00')::timestamp AT TIME ZONE 'Asia/Singapore')
FROM class_session cs
JOIN class_template ct ON ct.id = cs.template_id AND ct.is_private
ON CONFLICT DO NOTHING;

-- Everyone else: pseudo-random but deterministic bookings of ACTIVE HQ students, restricted by the booking rules
-- (children only in children classes, Ladies only for women, SG50 age 50+, Intermediate 4th Kyu+, Advanced 1st Kyu+)
-- and by a package that covers the date. ~1 in 6 eligible pairs.
INSERT INTO class_attendance (lesson_id, user_id, attendance_status, student_package_id, booked_at)
SELECT cs.lesson_id, sp.user_id,
       CASE
         WHEN cs.status = 'Cancelled' THEN 'Cancelled'
         WHEN cs.session_date >= DATE '2026-11-06' THEN CASE WHEN x.h % 10 = 0 THEN 'Cancelled' ELSE 'Booked' END
         ELSE CASE WHEN x.h % 10 = 0 THEN 'No-Show' WHEN x.h % 10 = 1 THEN 'Cancelled' ELSE 'Attended' END
       END,
       pk.id,
       ((LEAST(cs.session_date - 3, DATE '2026-11-05') + TIME '10:00')::timestamp AT TIME ZONE 'Asia/Singapore')
FROM student_profile sp
JOIN membership m ON m.user_id = sp.user_id AND m.account_status = 'Active'
JOIN belt_rank br ON br.id = sp.rank_id
CROSS JOIN class_session cs
JOIN class_template ct ON ct.id = cs.template_id AND NOT ct.is_private
CROSS JOIN LATERAL (SELECT ('x' || substr(md5(cs.lesson_id || sp.user_id), 1, 7))::bit(28)::int AS h) x
JOIN LATERAL (SELECT p.id FROM student_package p
              WHERE p.user_id = sp.user_id AND p.purchased_at <= cs.session_date AND p.expires_at >= cs.session_date
              ORDER BY p.expires_at LIMIT 1) pk ON TRUE
WHERE sp.user_id <> 'S-001'
  AND sp.dojo_id = cs.dojo_id
  AND ct.kids_only = (sp.age_group = 'Child')
  AND (ct.class_type <> 'Ladies' OR sp.gender = 'Female')
  AND (ct.class_type <> 'SG50' OR date_part('year', age(DATE '2026-11-06', sp.dob)) >= 50)
  AND (ct.class_type <> 'Intermediate' OR br.sort_order >= 3)
  AND (ct.class_type <> 'Advanced' OR br.sort_order >= 6)
  AND ct.online_bookable                         -- online booking is HQ only
  AND cs.session_date <= DATE '2026-12-06'       -- booking_ahead_months = 1
  AND x.h % 6 = 0
ON CONFLICT DO NOTHING;

-- Instructor marks Attended / No-Show when the class ends
UPDATE class_attendance ca
SET marked_by = cs.instructor_id, marked_at = cs.ended_at
FROM class_session cs
WHERE cs.lesson_id = ca.lesson_id AND ca.attendance_status IN ('Attended', 'No-Show') AND cs.ended_at IS NOT NULL;

INSERT INTO makeup_class (id, user_id, original_lesson_id, makeup_lesson_id, status, expires_at, created_at) VALUES
('MU-01', 'S-001', 'LS-20261103-1900-HQ-A', NULL, 'Pending', '2026-12-03', '2026-11-03 17:00+08'),
('MU-02', 'S-002', 'LS-20261103-1900-HQ-A', 'LS-20261109-1900-HQ-A', 'Used', '2026-12-03', '2026-11-03 17:00+08'),
('MU-03', 'S-012', 'LS-20261103-1900-HQ-A', NULL, 'Pending', '2026-12-03', '2026-11-03 17:00+08');

-- Location QR check-ins (only students with a booking for that class)
INSERT INTO check_in (id, user_id, dojo_id, lesson_id, checked_in_at, method) VALUES
('CI-01', 'S-001', 'hq', 'LS-20261104-1900-HQ-A', '2026-11-04 18:52+08', 'qr'),
('CI-02', 'S-001', 'hq', 'LS-20261102-1900-HQ-A', '2026-11-02 18:50+08', 'qr');

INSERT INTO check_in (id, user_id, dojo_id, lesson_id, checked_in_at, method)
SELECT 'CI-' || (10 + row_number() OVER (ORDER BY ca.lesson_id, ca.user_id)), ca.user_id, cs.dojo_id, cs.lesson_id,
       (((cs.session_date + cs.start_time) - INTERVAL '8 minutes')::timestamp AT TIME ZONE 'Asia/Singapore'), 'qr'
FROM class_attendance ca
JOIN class_session cs ON cs.lesson_id = ca.lesson_id
WHERE ca.attendance_status = 'Attended' AND ca.user_id LIKE 'S-%' AND ca.user_id <> 'S-001'
  AND cs.session_date BETWEEN DATE '2026-11-03' AND DATE '2026-11-05'
ORDER BY ca.lesson_id, ca.user_id
LIMIT 8;

INSERT INTO class_feedback (id, lesson_id, instructor_id, rating, tags, note, created_at) VALUES
('FB-01', 'LS-20261104-1900-HQ-A', 'INS-0042', 5, ARRAY['Clear explanations', 'Felt safe'], 'Sensei broke ikkyo down step by step. I finally understand the entry.', '2026-11-04 21:30+08'),
('FB-02', 'LS-20261102-2000-HQ-A', 'INS-0042', 5, ARRAY['Learned something new'], 'Loved the new variation. Challenging but fair.', '2026-11-02 22:10+08'),
('FB-03', 'LS-20261030-1900-HQ-A', 'INS-0042', 4, ARRAY['Good pace', 'Fun partner work'], NULL, '2026-10-30 21:05+08'),
('FB-04', 'LS-20261024-1100-HQ-A', 'INS-0042', 5, ARRAY['Felt safe', 'Clear explanations'], 'Felt welcome as a newer student. Thank you for the extra tips on ukemi.', '2026-10-24 13:00+08'),
('FB-05', 'LS-20261022-2000-HQ-A', 'INS-0042', 4, ARRAY['Learned something new'], 'Great technique focus. Would like a little more time on weapons.', '2026-10-22 21:40+08'),
('FB-06', 'LS-20261023-1900-HQ-A', 'INS-0042', 3, ARRAY['Good pace'], 'Class ran a few minutes over and the warm-up felt rushed.', '2026-10-23 21:15+08'),
('FB-07', 'LS-20261019-2000-HQ-A', 'INS-0042', 5, ARRAY['Clear explanations', 'Learned something new'], 'Very clear demonstrations. Easy to follow even from the back row.', '2026-10-19 22:00+08'),
('FB-08', 'LS-20261016-1900-HQ-A', 'INS-0042', 4, ARRAY['Fun partner work'], NULL, '2026-10-16 21:20+08'),
('FB-09', 'LS-20261003-1100-HQ-A', 'INS-0042', 5, ARRAY['Felt safe', 'Good pace'], 'Calm, patient and encouraging.', '2026-10-03 14:00+08'),
('FB-10', 'LS-20261009-1900-HQ-A', 'INS-0042', 2, ARRAY[]::text[], 'The mat was crowded, so partner work was hard to do safely.', '2026-10-09 21:10+08'),
('FB-11', 'LS-20261001-2000-HQ-A', 'INS-0042', 4, ARRAY['Clear explanations'], NULL, '2026-10-01 21:30+08'),
('FB-12', 'LS-20260930-1900-HQ-A', 'INS-0042', 5, ARRAY['Learned something new', 'Felt safe'], 'Best class this month.', '2026-09-30 22:00+08');

INSERT INTO instructor_remark (id, kind, lesson_id, student_id, instructor_id, body, created_at) VALUES
('RM-01', 'grading', NULL, 'S-002', 'INS-0042', 'Strong ukemi and calm under pressure. Keep the hips lower in iriminage.', '2026-11-02 21:30+08'),
('RM-02', 'grading', NULL, 'S-004', 'INS-0042', 'Ready for Shodan. Jo kata is excellent, but rushes the opening of ikkyo.', '2026-10-31 11:30+08'),
('RM-03', 'class', 'LS-20261102-1900-HQ-A', NULL, 'INS-0042', 'We drilled ikkyo omote and ura. At home, practise stepping off the line before you pivot. Next class: shomen uchi variations.', '2026-11-02 21:15+08'),
('RM-04', 'student', 'LS-20261102-1900-HQ-A', 'S-001', 'INS-0042', 'Your ukemi is improving. Keep your chin tucked on back rolls and breathe out as you land.', '2026-11-02 21:20+08'),
('RM-05', 'class', 'LS-20261030-1900-HQ-A', NULL, 'INS-0042', 'Today was shihonage. The key is to extend through the arm, not lift with the shoulder.', '2026-10-30 21:10+08'),
('RM-06', 'grading', 'LS-20261030-1900-HQ-A', 'S-001', 'INS-0042', 'On track for the next grading. Keep up your attendance and work on your suwari-waza.', '2026-10-30 21:12+08');

-- ---------------------------------------------------------------------
-- 6. Grading applications, candidates and history (the slots are above)
-- ---------------------------------------------------------------------
INSERT INTO grading_application (id, user_id, from_rank_id, to_rank_id, session_id, submitted_at, status, note, fee_payment_id, decided_by, decided_at) VALUES
('GA-01', 'S-001', '6k', '5k', 'GR-20251214', '2025-11-28 19:00+08', 'Approved', NULL, 'L-1025', 'ADM-001', '2025-11-30 10:00+08'),
('GA-02', 'S-023', '5k', '4k', 'GR-20251214', '2025-11-29 19:00+08', 'Approved', NULL, 'L-1027', 'ADM-001', '2025-11-30 10:05+08'),
('GA-03', 'S-001', '5k', '4k', 'GR-20260315', '2026-02-28 19:00+08', 'Approved', NULL, 'L-1026', 'ADM-001', '2026-03-01 10:00+08'),
('GA-04', 'S-024', '6k', '5k', 'GR-20260315', '2026-02-28 20:00+08', 'Approved', NULL, 'L-1028', 'ADM-001', '2026-03-01 10:05+08'),
('GA-05', 'S-020', '5k', '4k', 'GR-20260315', '2026-03-01 09:00+08', 'Approved', NULL, 'L-1029', 'ADM-001', '2026-03-01 10:10+08'),
('GA-06', 'S-010', '5k', '4k', 'GR-20260927', '2026-09-10 18:00+08', 'Approved', NULL, 'L-1006', 'ADM-001', '2026-09-11 10:00+08'),
('GA-07', 'S-005', '2k', '1k', 'GR-20260927', '2026-09-10 18:30+08', 'Approved', NULL, 'L-1030', 'ADM-001', '2026-09-11 10:05+08'),
('GA-08', 'S-025', '3k', '2k', 'GR-20260927', '2026-09-11 08:30+08', 'Approved', NULL, 'L-1031', 'ADM-001', '2026-09-11 10:10+08'),
('GA-09', 'S-002', '3k', '2k', 'GR-20261213', '2026-11-01 12:00+08', 'Approved', 'Weapons requirement met', 'L-1032', 'ADM-001', '2026-11-02 09:30+08'),
('GA-10', 'S-004', '1k', '1d', 'GR-20261213', '2026-10-30 12:00+08', 'Approved', 'Yudansha points 2.5 / 2.0', 'L-1011', 'ADM-001', '2026-11-02 09:35+08'),
('GA-11', 'S-009', '2k', '1k', 'GR-20261213', '2026-10-28 12:00+08', 'Approved', 'Weapons requirement met', 'L-1033', 'ADM-001', '2026-11-02 09:40+08'),
('GA-12', 'S-013', '4k', '3k', 'GR-20261213', '2026-11-05 08:00+08', 'Submitted', 'Asks to grade in December. Awaiting HQ decision.', NULL, NULL, NULL),
('GA-13', 'S-012', '4k', '3k', NULL, '2026-11-03 20:00+08', 'Rejected', 'Needs 36 sessions in rank; has 22.', NULL, 'ADM-001', '2026-11-04 09:00+08');

INSERT INTO grading_candidate (session_id, user_id, application_id, from_rank_id, to_rank_id, fee, result, score, well_done, to_improve, examiner_id, promotion_status, promotion_decided_by, promotion_decided_at) VALUES
('GR-20251214', 'S-001', 'GA-01', '6k', '5k', 40, 'Pass', 82, 'Good attendance and steady basics. Your rolls are safe on both sides.', 'Relax your shoulders when you grab, and keep eye contact with your partner.', 'INS-0042', 'Promoted', 'ADM-001', '2025-12-15 10:00+08'),
('GR-20251214', 'S-023', 'GA-02', '5k', '4k', 50, 'Pass', 79, 'Solid timing on shomenuchi ikkyo.', 'Finish each technique before turning away.', 'INS-0008', 'Promoted', 'ADM-001', '2025-12-15 10:05+08'),
('GR-20260315', 'S-001', 'GA-03', '5k', '4k', 50, 'Pass', 86, 'Confident ukemi and a calm, upright posture. Your shomenuchi ikkyo has good timing.', 'Keep your hips lower in iriminage and finish each throw before you turn away. Practise suwari-waza knee walking.', 'INS-0031', 'Promoted', 'ADM-001', '2026-03-16 10:00+08'),
('GR-20260315', 'S-024', 'GA-04', '6k', '5k', 40, 'Pass', 80, 'Neat footwork and good focus.', 'Speak up when you are unsure of a technique.', 'INS-0008', 'Promoted', 'ADM-001', '2026-03-16 10:05+08'),
('GR-20260315', 'S-020', 'GA-05', '5k', '4k', 50, 'Pass', 77, 'Careful, controlled technique.', 'Do not rush the ushiro ukemi.', 'INS-0042', 'Promoted', 'ADM-001', '2026-03-16 10:10+08'),
('GR-20260927', 'S-010', 'GA-06', '5k', '4k', 50, 'Pass', 84, 'Clean ukemi, good posture in ikkyo.', 'Keep your centre lower in iriminage.', 'INS-0031', 'Pending approval', NULL, NULL),
('GR-20260927', 'S-005', 'GA-07', '2k', '1k', 60, 'Pass', 91, 'Excellent jo kata.', 'Start preparing for the yudansha track.', 'INS-0057', 'Pending approval', NULL, NULL),
('GR-20260927', 'S-025', 'GA-08', '3k', '2k', 60, 'Fail', 54, 'Strong spirit and good ukemi.', 'Randori timing and suwari-waza need more work. Re-apply next grading.', 'INS-0042', 'n/a', NULL, NULL),
('GR-20261213', 'S-002', 'GA-09', '3k', '2k', 60, 'Pending', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL),
('GR-20261213', 'S-004', 'GA-10', '1k', '1d', 120, 'Pending', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL),
('GR-20261213', 'S-009', 'GA-11', '2k', '1k', 60, 'Pending', NULL, NULL, NULL, NULL, 'n/a', NULL, NULL);

INSERT INTO grading_history (id, user_id, grading_session_id, grading_date, from_rank_id, to_rank_id, grading_remarks, grade) VALUES
('GH-01', 'S-001', 'GR-20251214', '2025-12-14', '6k', '5k', 'Good attendance and steady basics. Your rolls are safe on both sides.', TRUE),
('GH-02', 'S-023', 'GR-20251214', '2025-12-14', '5k', '4k', 'Solid timing on shomenuchi ikkyo.', TRUE),
('GH-03', 'S-001', 'GR-20260315', '2026-03-15', '5k', '4k', 'Confident ukemi and a calm, upright posture.', TRUE),
('GH-04', 'S-024', 'GR-20260315', '2026-03-15', '6k', '5k', 'Neat footwork and good focus.', TRUE),
('GH-05', 'S-020', 'GR-20260315', '2026-03-15', '5k', '4k', 'Careful, controlled technique.', TRUE),
('GH-06', 'S-010', 'GR-20260927', '2026-09-27', '5k', '4k', 'Clean ukemi, good posture in ikkyo.', TRUE),
('GH-07', 'S-005', 'GR-20260927', '2026-09-27', '2k', '1k', 'Excellent jo kata. Ready for yudansha track.', TRUE),
('GH-08', 'S-025', 'GR-20260927', '2026-09-27', '3k', '2k', 'Randori timing and suwari-waza need more work.', FALSE);

UPDATE student_profile sp
SET last_grading_date = g.last_any, last_passed_grading_date = g.last_pass
FROM (SELECT user_id, max(grading_date) AS last_any, max(grading_date) FILTER (WHERE grade) AS last_pass
      FROM grading_history GROUP BY user_id) g
WHERE g.user_id = sp.user_id;

-- ---------------------------------------------------------------------
-- 7. Office operations
-- ---------------------------------------------------------------------
INSERT INTO mc_request (id, user_id, student_package_id, kind, days_requested, days_granted, document_ref, status, exception_id, requested_at, decided_by, decided_at) VALUES
('MC-01', 'S-011', 'SP-021', 'MC', 21, NULL, 'mc-ahmad-karim.pdf', 'pending', 'X-02', '2026-11-04 11:30+08', NULL, NULL),
('MC-02', 'S-017', 'SP-010', 'Compassion', 14, 14, NULL, 'approved', NULL, '2026-10-30 17:00+08', 'ADM-101', '2026-10-30 17:20+08'),
('MC-03', 'S-013', 'SP-022', 'MC', 10, 10, 'mc-rachel-ong.pdf', 'approved', NULL, '2026-10-20 09:00+08', 'ADM-101', '2026-10-20 09:30+08');

INSERT INTO followup (id, user_id, kind, owner_id, due_date, status) VALUES
('F-01', 'S-006', 'declining', 'ADM-101', '2026-11-07', 'open'),
('F-02', 'S-007', 'declining', 'ADM-101', '2026-11-06', 'open'),
('F-03', 'S-003', 'renewal', 'ADM-102', '2026-11-09', 'open');

INSERT INTO followup_attempt (id, followup_id, attempted_at, method, outcome, note) VALUES
('FA-01', 'F-02', '2026-10-28 14:00+08', 'WhatsApp', 'No answer', NULL),
('FA-02', 'F-02', '2026-11-03 11:00+08', 'Call', 'Voicemail left', 'Asked her to call back about dues'),
('FA-03', 'F-03', '2026-10-25 15:00+08', 'Call', 'Will pay next week', NULL),
('FA-04', 'F-03', '2026-11-02 10:30+08', 'WhatsApp', 'No answer', NULL);

INSERT INTO sent_log (id, sent_at, sent_by, audience, title, template_id) VALUES
('SL-01', '2026-11-03 17:00+08', 'ADM-101', 'Adults · Tue 7 PM', 'Class cancelled', 'T-1'),
('SL-02', '2026-11-03 09:00+08', 'ADM-101', 'Members with unpaid dues', 'Payment reminder', 'T-2'),
('SL-03', '2026-11-05 09:30+08', 'ADM-001', 'All HQ members', 'Dojo closed', 'T-3');

INSERT INTO import_issue (id, file_name, row_no, issue_type, person_name, detail, status) VALUES
('I-01', 'tampines-roll-sep.csv', 14, 'Missing information', 'Wong S. L.', 'No date of birth or phone number', 'open'),
('I-02', 'tampines-roll-sep.csv', 31, 'Unmatched name', 'Kenji S.', 'Could be Kenji Sato (ASK-2023-0456)', 'open'),
('I-03', 'bedok-roll-oct.csv', 6, 'Pipeline error', NULL, 'Row could not be read: unexpected date format', 'open');

COMMIT;
