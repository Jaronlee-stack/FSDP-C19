# ASK database (PostgreSQL)

Schema and fake seed data for the Aikido Shinju-Kai management system. Derived from the prototype pages (`src/public/js/data.js`, `store.js`, student, instructor and admin portals).

## Set up

```bash
createdb ask_dojo
psql -d ask_dojo -f database/db.sql     # schema (drops and recreates its own tables, so it can be re-run)
psql -d ask_dojo -f database/seed.sql   # demo data, one transaction
```

`db.sql` only drops the tables it owns. Run it on a dedicated database. Re-running it empties those tables, so run `seed.sql` again afterwards.

## Seed rules

- Anchor date: **today = 2026-11-06 (Friday)**. All seeded dates and timestamps are between 2025-11-06 and 2027-11-06. The only exceptions are `student_profile.dob` and `student_profile.joined_on` (real historical facts).
- Every account has the fake password `password123`. The hash in `seed.sql` is a real bcrypt hash (bcryptjs, cost 10). Do not use it outside development.
- Demo accounts

| Who | id | email | Notes |
|---|---|---|---|
| Lervyn Wong | `S-001` | lervyn@email.com | ASK-2025-1834, 4th Kyu, HQ, 2 active packages, bookings, payments, 2 gradings |
| Bob Tan Sensei | `INS-0042` | bob.tan@askdojo.example | Instructor, lead examiner on 13 Dec |
| Grace Lim | `ADM-001` | grace.lim@askdojo.example | `business` (Business Admin) |
| Daniel Ong | `ADM-101` | daniel.ong@askdojo.example | `frontdesk` (Front desk) |
| Farah Yusof | `ADM-102` | farah.yusof@askdojo.example | `frontdesk`, inactive |

## Tables by group

1. **Reference**: `dojo` (12, HQ id `hq`, each with a `qr_token` for the location QR), `belt_rank` (6th Kyu to 1st Dan, with grading fee)
2. **Accounts**: `users`, `student_profile`, `guest_profile`, `instructor_profile`, `staff_profile`, `membership`
3. **Packages and money**: `package_def`, `student_package`, `payment`, `refund_request`, `exception_request`, `equipment_order`
4. **Onboarding**: `auto_activation_rule`, `registration_application`, `application_checklist`, `guest_pass`
5. **Classes**: `class_template`, `class_session`, `class_attendance`, `makeup_class`, `class_closure`, `class_feedback`, `instructor_remark`, `check_in`
6. **Grading**: `grading_session`, `grading_examiner`, `grading_application`, `grading_candidate`, `grading_history`
7. **Office**: `mc_request`, `followup`, `followup_attempt`, `notification_template`, `sent_log`, `import_issue`, `policy_setting`

## Decisions

- **Grading is separate from classes.** It has its own tables. `grading_session.dojo_id` defaults to `hq` and a CHECK (`grading_only_at_hq`) plus the FK force the ASK HQ Dojo. Grading closes the HQ timetable: `seed.sql` derives one `class_closure` row (`CL-<grading id>`) from every `grading_session` that overlaps an HQ weekly class, so no HQ `class_session` exists on a grading slot. No examiner has a normal class at the same time. The view `v_grading_conflict` lists any violation (examiner class at the grading time, HQ weekly class without a closure, HQ dated class inside the slot) and must return 0 rows. A view plus verification tests is used instead of a trigger.
- **Online booking is HQ only.** CHECK `online_bookable_hq_only` on `class_template` (`dojo_id = 'hq' OR NOT online_bookable`). Non-HQ classes have no bookings or attendance.
- **Weekly rule vs dated class.** `class_template` is the weekly timetable. `class_session` is one dated occurrence (`lesson_id` such as `LS-20261109-1900-HQ-A`). Bookings and attendance are one row per student per lesson in `class_attendance` (status Booked, Attended, No-Show, Cancelled). The old `class_booking` table is replaced by `class_session`.
- **One staff table.** `staff_profile` (`admin_type` = `business` or `frontdesk`) replaces `admin_profile` and `frontdesk_profile`, which had identical columns. In the UI `business` is "Business Admin" and `frontdesk` is "Front desk". Instructors stay in `instructor_profile`.
- **Role guard.** Each profile table has a constant `role` column and a composite FK `(user_id, role)` to `users(id, role)`. A student profile cannot be attached to an instructor user.
- **Hours counters** on `student_profile` (CHECK `weapon_hours <= accumulated_hours <= total_accumulated_hours`):
  - `total_accumulated_hours`: lifetime training hours since joining.
  - `accumulated_hours`: hours since the last passed grading.
  - `weapon_hours`: the part of `accumulated_hours` earned in Weapons classes.
- **Joining dates are stored** in `student_profile.joined_on` (`DATE NOT NULL`). Like `dob` it is exempt from the 2-year window, so old members keep their real joining date. The year of `member_no` equals the year of `joined_on`, and `joined_on` is never after a student's account, payment, package, booking or grading date. `users.created_at` for long-time members is 2025-11-07 (system go-live) and means "account row created". `membership.last_renewed_at` is the last dues payment.
- **Promotion approval.** After a Pass, `grading_candidate.promotion_status` is `Pending approval` until HQ approves it; then it becomes `Promoted` and `student_profile.rank_id` changes.
- **Max 2 active packages** is a policy (`policy_setting.max_packages`) enforced by the application and checked by the verification script, not a DB trigger.
- **Robin Tan.** Robin is an examiner on 13 Dec (09:00-12:30), so the Sunday 11:00 Weapons class (CT-19) is taught by Pang Kim Lock Sensei in both the seed and `data.js` (Robin keeps Wednesday 20:00 Weapons).
- **Session range.** `class_session` covers 2026-09-21 to 2026-12-20 (past sessions are `Ended`, today and later `Scheduled`; Tue 3 Nov 19:00 Adults is `Cancelled`). Closure dates have no sessions. Random bookings only exist on HQ sessions up to 2026-12-06 (booking window of one month).

## Non-HQ sample timetables

The public site only shows the HQ timetable. Every other dojo says "Ask HQ for this term's timetable", and `Info from website.docx` gives no class days or times. So **all 20 rows below are SAMPLE data** (templates CT-23 to CT-42, mirrored by `OTHER_DOJO_CLASSES` in `data.js`). They are not bookable online and have no bookings. `tampineswest` (Temporarily closed) has none. Each instructor teaches two classes on different days.

| Template | Dojo | Day | Time | Type | Capacity | Instructor |
|---|---|---|---|---|---|---|
| CT-23 | bedok | Tue | 19:00 | Adults | 16 | Chew Eng Lam (INS-0008) |
| CT-24 | bedok | Sat | 10:00 | Children Beginners | 12 | Ronald Tan (INS-0027) |
| CT-25 | tampines | Mon | 19:00 | Adults | 18 | Quah Yong Lok (INS-0021) |
| CT-26 | tampines | Sat | 11:00 | Mixed | 16 | Aloyseus Lee (INS-0033) |
| CT-27 | kovan | Wed | 19:00 | Adults | 16 | Allan Lai (INS-0015) |
| CT-28 | kovan | Sun | 10:00 | Children Beginners | 12 | Alexander Lee (INS-0036) |
| CT-29 | sengkang | Thu | 20:00 | Adults | 16 | Tham Wai Yip (INS-0038) |
| CT-30 | sengkang | Sat | 09:00 | Children Juniors | 12 | Billy Lim (INS-0049) |
| CT-31 | bishan | Mon | 20:00 | Adults | 16 | James Moy (INS-0012) |
| CT-32 | bishan | Tue | 18:00 | Children Beginners | 14 | Tan Kok Hiang (INS-0024) |
| CT-33 | toapayoh | Wed | 20:00 | Mixed | 18 | Quah Yong Lok (INS-0021) |
| CT-34 | toapayoh | Thu | 19:00 | SG50 | 14 | Chew Eng Lam (INS-0008) |
| CT-35 | jurong | Mon | 19:00 | Adults | 16 | Allan Lai (INS-0015) |
| CT-36 | jurong | Sat | 10:00 | Children Juniors | 12 | James Moy (INS-0012) |
| CT-37 | westcoast | Tue | 20:00 | Adults | 16 | Ronald Tan (INS-0027) |
| CT-38 | westcoast | Sun | 09:00 | Mixed | 16 | Aloyseus Lee (INS-0033) |
| CT-39 | woodlands | Wed | 19:00 | Adults | 16 | Tham Wai Yip (INS-0038) |
| CT-40 | woodlands | Sun | 10:00 | Children Beginners | 12 | Billy Lim (INS-0049) |
| CT-41 | chongpang | Fri | 19:00 | Adults | 14 | Alexander Lee (INS-0036) |
| CT-42 | chongpang | Wed | 18:00 | Children Juniors | 12 | Tan Kok Hiang (INS-0024) |

## Verification

`psql` was not installed on the machine that produced this schema, so it was verified with PGlite (real PostgreSQL 18 compiled to WASM). The script is `.db-tmp/verify.mjs`; results are in `.db-tmp/verify.log`. `.db-tmp/agree.mjs` loads `data.js`, `store.js` and `core.js` with a pinned clock (2026-11-06) and compares the prototype data with the seed; results are in `.db-tmp/agree.log`.
