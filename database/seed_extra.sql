-- Extra demo accounts: 5 students, 2 instructors, 2 admins. Run after seed.sql. Re-running fails on duplicate ids (run once per database).
-- Same demo password as seed.sql: password123
BEGIN;

INSERT INTO users (id, role, email, password_hash, created_at, last_login_at)
SELECT t.id, t.role, t.email, h.v, t.created_at::timestamptz, t.last_login_at::timestamptz
FROM (SELECT '$2b$10$T88/9UZzmA2kWCyjDC44VObKDgRfr0bt1x5Fk0u3gqnD4Q8Q5UBTu'::varchar AS v) h,
(VALUES
('S-030', 'student', 'ethan.ng@email.com', '2026-01-10 10:00+08', NULL),
('S-031', 'student', 'mei.lin@email.com', '2026-02-14 10:00+08', NULL),
('S-032', 'student', 'raj.kumar@email.com', '2026-03-03 10:00+08', NULL),
('S-033', 'student', 'sarah.wu@email.com', '2026-04-21 10:00+08', NULL),
('S-034', 'student', 'hiroshi.tanaka@email.com', '2026-05-09 10:00+08', NULL),
('INS-0070', 'instructor', 'ahmad.r@askdojo.example', '2025-11-07 10:00+08', NULL),
('INS-0071', 'instructor', 'lina.c@askdojo.example', '2025-11-07 10:00+08', NULL),
('ADM-002', 'admin', 'nur.hakim@askdojo.example', '2025-11-07 10:00+08', NULL),
('ADM-103', 'admin', 'ben.teo@askdojo.example', '2025-11-07 10:00+08', NULL)
) AS t(id, role, email, created_at, last_login_at);

INSERT INTO student_profile (user_id, member_no, full_name, dob, joined_on, gender, age_group, contact_no, dojo_id, rank_id, source,
    total_accumulated_hours, accumulated_hours, weapon_hours, discount_type, guardian_name, guardian_contact, emergency_contact, medical_notes) VALUES
('S-030', 'ASK-2026-3001', 'Ethan Ng', '1999-04-11', '2026-01-10', 'Male', 'Adult', '9111 2001', 'hq', '6k', 'ASK', 8, 8, 1, 'none', NULL, NULL, 'Ng Mei Ling (Sister)', NULL),
('S-031', 'ASK-2026-3002', 'Mei Lin Ong', '2001-08-23', '2026-02-14', 'Female', 'Adult', '9111 2002', 'bedok', '5k', 'ASK', 14, 12, 2, 'student', NULL, NULL, 'Ong Hock (Brother)', NULL),
('S-032', 'ASK-2026-3003', 'Raj Kumar', '1990-12-05', '2026-03-03', 'Male', 'Adult', '9111 2003', 'hq', '4k', 'External', 22, 22, 4, 'none', NULL, NULL, 'Priya Kumar (Spouse)', 'Asthma (carries inhaler)'),
('S-033', 'ASK-2026-3004', 'Sarah Wu', '2014-07-30', '2026-04-21', 'Female', 'Child', '9111 2004', 'tampines', '6k', 'ASK', 6, 6, 0, 'none', 'Wu Jian (Father)', '9111 2099', 'Wu Jian (Father)', NULL),
('S-034', 'ASK-2026-3005', 'Hiroshi Tanaka', '1994-02-17', '2026-05-09', 'Male', 'Adult', '9111 2005', 'hq', '3k', 'ASK', 3, 3, 0, 'senior', NULL, NULL, 'Yumi Tanaka (Spouse)', NULL);

INSERT INTO membership (user_id, membership_expiry, account_status, last_renewed_at) VALUES
('S-030', '2027-01-10', 'Active', '2026-01-10'),
('S-031', '2027-02-14', 'Active', '2026-02-14'),
('S-032', '2027-03-03', 'Active', '2026-03-03'),
('S-033', '2027-04-21', 'Active', '2026-04-21'),
('S-034', '2027-05-09', 'Active', '2026-05-09');

INSERT INTO instructor_profile (user_id, full_name, dan_grade, photo_file, is_chief) VALUES
('INS-0070', 'Ahmad Rahman Sensei', 3, NULL, FALSE),
('INS-0071', 'Lina Chua Sensei', 4, NULL, FALSE);

INSERT INTO staff_profile (user_id, full_name, admin_type, status) VALUES
('ADM-002', 'Nur Hakim', 'business', 'active'),
('ADM-103', 'Ben Teo', 'frontdesk', 'active');

COMMIT;
