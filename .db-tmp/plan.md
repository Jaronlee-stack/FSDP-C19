# Implementation Plan: ASK PostgreSQL schema + seed

Scope: edit `database/db.sql`, create `database/seed.sql` and `database/README.md`. Work files only under `.db-tmp/`. Do not touch `src/`, `prompts/`, `.env*`, `.gitignore`, `app.js`. No git write commands. Write files with the edit tools only.

Findings from exploration
- `database/db.sql` has 14 tables, all VARCHAR(255) ids, no CHECKs, no DROPs, no dojo/belt/package/payment tables. `class_booking` is really a class occurrence (lesson_id, time, location, type) and `rank`/`dojo` on `student_profile` are free text.
- psql/pg_isready are NOT installed (checked with Get-Command). node.exe is present. So verification uses PGlite (see Verification).
- Data source is `src/public/js/data.js`: `DOJOS` (12, `hq` id), `PKG` (a10, a25, a50, aun, k1, k6, k50), `CLASSES`/`PRIVATE_CLASSES` (weekly, `day` 0=Mon), `BELTS`, `GRADING_FEE`, `SEED()` (passes, students, apps, members, gradApps, proposals, pays, feedback, remarks, panels, attendance, gradingFeedback, mcRequests, checkIns, staff, ledger, refunds, exceptions, guests, equipment, followups, closures, imports, policies, sentLog).
- The 13 Dec 2026 panel (Sunday) is 09:00-12:30 with examiners Bob Tan (INS-0042), Steven Goh (INS-0031), Robin Tan (INS-0057). Robin's Sunday 11:00 Weapons class (`CLASSES` line 82) overlaps it.

## Decisions (record in README and header comments)

D1. class_template vs class_session: split them. Pages use both a weekly recurring timetable (CLASSES, PRIVATE_CLASSES, admin timetable setup) and dated things (rosters keyed `YYYY-MM-DD|HH:MM`, attendance, remarks, `classEnded`, closures). One table cannot hold both without duplicating the weekly rule on every date. `class_template` holds the weekly rule; `class_session` is one dated occurrence (template_id nullable FK, session_date, start/end, instructor, capacity, status). Booking and attendance reference `class_session.lesson_id` (keep the `lesson_id` key style, e.g. `LS-20261109-1900-HQ`). Old `class_booking` is dropped and replaced by `class_session` + `booking`.

D2. Staff consolidation: one `staff_profile` table (user_id PK, full_name, admin_type CHECK IN ('business','frontdesk'), status CHECK IN ('active','inactive'), last_login_at). `admin_profile` and `frontdesk_profile` are dropped. Reason: they hold identical columns, `portal.js`/`data.js` already model it as one `staff` list with `type`, and a role change becomes an UPDATE instead of a move between tables. `users.role` CHECK IN ('student','guest','instructor','admin'); admin_type is only meaningful for role='admin' (enforce with a trigger-free CHECK by making staff_profile rows exist only for role admin, documented). Display: 'business' = "Business Admin", 'frontdesk' = "Front desk" (README note, matching the user's earlier correction). Instructors stay in `instructor_profile` (they have rank, bio/photo, etc.). Instructor sign-in rows in the prototype `staff` list are covered by `users` + `instructor_profile`, not duplicated.

D3. Hours counters on `student_profile` (single meaning, comment in SQL):
- `total_accumulated_hours` = lifetime training hours credited from attended sessions since joining (matches `members[].hrs`, e.g. 61 for Lervyn).
- `accumulated_hours` = hours since the last passed grading (counts toward the next rank requirement).
- `weapon_hours` = the subset of `accumulated_hours` earned in Weapons classes.
Constraint: weapon_hours <= accumulated_hours <= total_accumulated_hours (CHECK). Seed values obey it. Session counts shown in UI (`s`/`need`) are derived from attendance, not stored.

D4. Grading is separate (user decision): own tables, fixed HQ venue enforced by `grading_session.dojo_id VARCHAR(255) NOT NULL DEFAULT 'hq' REFERENCES dojo(id) CHECK (dojo_id = 'hq')`.

D5. Dates: literal dates anchored on 2026-11-06. Allowed range 2025-11-06 to 2027-11-06; dob is the only exception. Note `ASK-2025-1834` joined Jun 2025 per data.js: that is out of window, so store `joined_at` as 2025-11-06 or later (member number keeps its text). Registration/dues dates earlier than 2025-11-06 from `pays` (14 Jun 2025, 20 Nov 2025 is fine) must be moved to >= 2025-11-06. Same for any membership start. Add a final self-check query in verification that scans every DATE/TIMESTAMPTZ column.

D6. Passwords: generate one real bcrypt hash of the fake password `password123` with bcryptjs installed in `$env:TEMP\askdb\` and paste it in seed.sql with a comment. If install fails, use the labelled placeholder `$2b$10$PLACEHOLDERHASHNOTREALxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (60 chars).

## Entity list and source files

| Entity | Source |
|---|---|
| dojo (12) | data.js DOJOS; landingpage dojos.html |
| belt_rank (6th Kyu..1st Dan, sort_order, color, grading_fee) | data.js BELTS, GRADING_FEE |
| user, student_profile, guest_profile, instructor_profile, staff_profile | store.js, portal.js, data.js staff/members/INSTRUCTORS, signin pages |
| membership (expiry, status Active/Inactive/Deactivated/Lapsed, registered_at, re-registration) | admin-members.js, data.js members |
| package_def, student_package | data.js PKG, passes; student_portal packages.html |
| payment (ledger) | data.js ledger, pays; student payments page; admin payments |
| refund_request | data.js refunds |
| exception_request | data.js exceptions |
| registration_application + checklist | data.js apps; admin applications.html; landingpage join.html |
| guest_pass | data.js guests; landingpage trial.html |
| class_template, class_session, booking, attendance | data.js CLASSES/PRIVATE_CLASSES/attendance/classEnded/rosters; student book.html; instructor classes |
| makeup_class | existing db.sql; admin-desk.js |
| class_closure | data.js closures; admin timetable |
| class_feedback (anonymous) | data.js feedback; student rating prompts |
| instructor_remark | data.js remarks (kind class/student/grading) |
| grading_session, grading_examiner, grading_candidate, grading_application, grading_history | data.js panels/gradApps/candidates/proposals/gradingFeedback/grade; student grading.html; instructor grading.html |
| mc_request (extension: MC/compassion) | data.js mcRequests, COMPASSION_DAYS; admin-desk.js |
| equipment_order | data.js equipment, DOGI_SIZES |
| followup, followup_attempt | data.js followups |
| notification_template, sent_log | data.js policies.templates, sentLog |
| import_issue | data.js imports |
| policy_setting (key/value), auto_activation_rule | data.js policies |
| check_in | data.js checkIns; store.js recordMyAttendance; student index.html location QR |
| audit_log (actor, action, entity, at) | staff pages "last active" and approvals; keep minimal, only if admin pages show it (confirm by grep in admin-shell.js; skip if not) |

Not modelled: cohorts, interventions (chart sample figures), `rosters`/`memberInfo` blobs (covered by booking/attendance and student_profile columns).

## Tables by group (key columns, FKs, CHECK lists)

Group 1 Reference: 
- `dojo(id PK, name, short_name, code UNIQUE, region CHECK IN ('Central','East','West','North','North-East'), address, status CHECK IN ('Open','Temporarily closed') DEFAULT 'Open')`. Region list must be taken from the actual DOJOS values (read data.js lines 8-20 first).
- `belt_rank(id PK e.g. '6k', name UNIQUE, sort_order INT UNIQUE, belt_color, grading_fee NUMERIC(8,2))`.

Group 2 Accounts: 
- `users(id, role CHECK, email UNIQUE, password_hash, created_at)`.
- `student_profile(user_id PK FK users CASCADE, member_no UNIQUE NOT NULL, full_name, dob, gender CHECK IN ('Male','Female'), age_group CHECK IN ('Adult','Child'), contact_no, dojo_id FK dojo, rank_id FK belt_rank, joined_at, last_grading_date, last_passed_grading_date, total_accumulated_hours, accumulated_hours, weapon_hours, discount_type CHECK IN ('none','student','senior','nsf'), guardian_name, guardian_contact, emergency_contact, medical_notes)` (replace `discount BOOLEAN`).
- `guest_profile(... trial_status CHECK IN ('Pending','Attended','Converted'))`.
- `instructor_profile(user_id, full_name, rank_id FK, photo_file, is_chief BOOL)` (Philip Lee flagged true in INSTRUCTORS).
- `staff_profile` per D2.
- `membership(user_id PK, membership_expiry, account_status CHECK IN ('Active','Inactive','Deactivated','Lapsed'), registered_at, last_reregistered_at)`.

Group 3 Packages and money:
- `package_def(id PK 'a10'..., name, audience CHECK IN ('adult','kids'), lessons INT NULL for unlimited, price, billing_unit, valid_days, valid_months, is_active)`.
- `student_package(id, user_id FK, package_id FK, lessons_total, lessons_left, purchased_at, expires_at, status CHECK IN ('Active','Used up','Expired'))`; max 2 active is a booking rule (policy_setting `max_packages`), documented; add a partial unique-free index and a verification query.
- `payment(id 'L-1001', invoice_no UNIQUE, user_id FK, item, amount NUMERIC(10,2) CHECK >=0, method CHECK IN ('Stripe','PayNow','Visa'), status CHECK IN ('Paid','Outstanding','Processing','Failed','Voided','Refunded'), channel CHECK IN ('desk','online','auto'), paid_at, created_at, package_id nullable)`.
- `refund_request(id, payment_id FK, user_id FK, amount, reason, requested_by FK staff_profile, status CHECK IN ('pending','approved','declined'), decided_by, requested_at, decided_at)`.
- `exception_request(id, kind CHECK IN ('registration','extension','access','mistake','refund'), subject_name, user_id nullable, detail, requested_by, status CHECK IN ('pending','approved','declined'), requested_at)`.
- `equipment_order(id, user_id, item, size CHECK IN dogi sizes or NULL, paid BOOL, status CHECK IN ('Requested','Ready at HQ','Handed over'), requested_at, handed_over_to)`.

Group 4 Onboarding:
- `registration_application(id, full_name, dojo_id, group CHECK, age, gender, nationality, phone, email, emergency_contact, prior_experience, previous_member, medical_declaration, dogi_choice, package_id, amount_paid, signer, submitted_at, status CHECK IN ('Submitted','Under review','Approved','Rejected','Needs info'), reviewed_by, user_id nullable after approval)` and `application_checklist(application_id, rule_id FK auto_activation_rule, done BOOL, PK both)`.
- `guest_pass(id, user_id/guest contact, pass_type CHECK IN ('trial','day','week'), used BOOL, valid_until)`.

Group 5 Classes:
- `class_template(id, dojo_id, weekday CHECK 0-6 (0=Mon), start_time, duration_min, class_type CHECK IN ('Adults','Children Beginners','Intermediate','Advanced','Weapons','Ladies','SG50','Mixed', plus every type found in CLASSES), instructor_id FK, capacity, kids_only, is_private, private_student_id nullable, min_rank_id nullable (Intermediate 4th Kyu, Advanced 1st Kyu))`.
- `class_session(lesson_id PK, template_id FK null, dojo_id, session_date, start_time, end_time, class_type, instructor_id, capacity, status CHECK IN ('Scheduled','Ended','Cancelled'), session_code UNIQUE, ended_at)`.
- `booking(lesson_id FK, user_id FK, status CHECK IN ('Booked','Attended','No-Show','Cancelled'), student_package_id nullable, booked_at, PK(lesson_id,user_id))` and merge existing `class_attendance` into it as `attendance_status` + `remarks`: decision: keep ONE table `class_attendance` renamed to `booking` is risky; instead keep the existing name `class_attendance` (it already carries Booked/Attended/No-Show/Cancelled) and add `student_package_id`, `booked_at`, `marked_by`, `marked_at`. No separate `booking` table. Walk-ins (guests) use the same table with user_id of guest.
- `makeup_class(id, user_id, original_lesson_id, makeup_lesson_id nullable, status CHECK IN ('Pending','Used','Expired'), expires_at)`.
- `class_closure(id, dojo_id, from_date, to_date, note, CHECK to>=from)`.
- `class_feedback(id, lesson_id FK, instructor_id FK, rating CHECK 1-5, tags TEXT[], note, created_at)`; NO user column.
- `instructor_remark(id, kind CHECK IN ('class','student','grading'), lesson_id nullable FK, student_id nullable FK, instructor_id FK, text, created_at)` with CHECK that kind='class' has no student and kind in ('student','grading') has one.
- `check_in(id, user_id FK, dojo_id FK, lesson_id nullable FK, checked_in_at, method CHECK IN ('qr'))`.

Group 6 Grading (separate from classes):
- `grading_session(id 'GR-20261213', label, session_date, start_time, end_time CHECK end>start, dojo_id DEFAULT 'hq' CHECK ='hq', lead_examiner_id FK instructor_profile, status CHECK IN ('Scheduled','In progress','Completed','Cancelled'), application_close_date)`.
- `grading_examiner(session_id FK, instructor_id FK, PK both)`.
- `grading_application(id, user_id, from_rank_id, to_rank_id, submitted_at, status CHECK IN ('Submitted','Approved','Scheduled','Rejected','Withdrawn'), note, fee_payment_id nullable FK payment)` (HQ approves/disapproves per user decision).
- `grading_candidate(session_id, user_id, application_id, from_rank_id, to_rank_id, fee NUMERIC, fee_paid BOOL, result CHECK IN ('Pending','Pass','Fail'), score NUMERIC CHECK 0-100 nullable, well_done TEXT, to_improve TEXT, examiner_id, PK(session_id,user_id))`.
- `grading_history(id, user_id, grading_session_id FK nullable, grading_date, from/to rank, grading_remarks, grade BOOLEAN)` (keep existing boolean grade).

Group 7 Office operations:
- `mc_request(id, user_id, student_package_id, kind CHECK IN ('MC','Compassion'), days_requested, days_granted, document_ref, status CHECK IN ('pending','approved','declined'), exception_id nullable, requested_at)`.
- `followup(id, user_id, kind CHECK IN ('declining','renewal'), owner_id FK staff_profile, due_date, status CHECK IN ('open','done'))`, `followup_attempt(id, followup_id FK CASCADE, attempted_at, method CHECK IN ('WhatsApp','Call','Email','SMS'), outcome, note)`.
- `notification_template(id, name, body)`, `sent_log(id, sent_at, sent_by FK staff_profile, audience, title, template_id nullable)`.
- `import_issue(id, file_name, row_no, issue_type CHECK IN ('Missing information','Unmatched name','Pipeline error'), person_name, detail, status CHECK IN ('open','fixed','dismissed'))`.
- `policy_setting(key PK, value_text, value_type CHECK IN ('int','numeric','text','bool'), description)` keys: registration_fee 60, annual_dues 48, discount_senior_age 65, discount_senior_pct 40, discount_student_from 17, discount_student_to 25, discount_student_pct 50, booking_ahead_months 1, booking_min_days 1, cancel_hours 4, max_packages 2, follow_decline_days 14, follow_renewal_days 30, compassion_days 14, grading_late_fee 20.
- `auto_activation_rule(id PK 'details','consent','paid','medical','guardian', text, enabled BOOL)`.

Every FK column gets an index. Add lookup indexes: student_profile(member_no already unique; dojo_id; rank_id), class_session(session_date, instructor_id), payment(user_id, status, paid_at), class_attendance(user_id), grading_candidate(user_id), check_in(user_id, checked_in_at). ON DELETE: profile children CASCADE; reference tables (dojo, belt_rank, package_def, instructor_profile) RESTRICT; optional links SET NULL; payment history RESTRICT from users deletion except via student cascade rules documented (payment.user_id ON DELETE RESTRICT).

## Ordered items

- [ ] 1. Re-read `database/db.sql`, `src/public/js/data.js` lines 7-20 (dojo regions/status), 48-60 (INSTRUCTORS full list with ids), 61-91 (CLASSES), and grep `admin_portal/*.js` for `audit`, `mcRequests`, `checkIns`, `portal.js` for ADMIN_PAGES/roles, to confirm column lists and value lists above. Adjust the CHECK lists to the exact values found. Record any deviation in `.db-tmp/notes.md`.
      Files: .db-tmp/notes.md (new)
      Verify: notes file lists every CHECK value set with its source line.

- [ ] 2. Set up verification tooling outside the repo: `mkdir $env:TEMP\askdb; cd $env:TEMP\askdb; npm init -y; npm i @electric-sql/pglite bcryptjs`. Generate bcrypt hash of `password123` and save to `$env:TEMP\askdb\hash.txt`. Write a runner script `$env:TEMP\askdb\run.mjs` (via file tool) that loads PGlite in memory, executes `db.sql`, then `seed.sql`, then the check queries from item 6, and prints results. If PGlite fails, try `embedded-postgres` in the same folder. Nothing is installed in the repo.
      Files: outside the repo only
      Verify: `node run.mjs` with the OLD db.sql loads without error (proves the harness works).

- [ ] 3. Rewrite `database/db.sql` per the Group list: header comment (group explanations, decisions D1-D4, re-run note), then `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` is too aggressive for shared DBs, so instead use `DROP TABLE IF EXISTS ... CASCADE` for every old and new table in reverse dependency order, then CREATE in dependency order: dojo, belt_rank, users, student_profile, guest_profile, instructor_profile, staff_profile, membership, package_def, student_package, payment, refund_request, exception_request, equipment_order, auto_activation_rule, registration_application, application_checklist, guest_pass, class_template, class_session, class_attendance, makeup_class, class_closure, class_feedback, instructor_remark, check_in, grading_session, grading_examiner, grading_application, grading_candidate, grading_history, mc_request, followup, followup_attempt, notification_template, sent_log, import_issue, policy_setting. Add indexes and column comments for the hours counters (D3). Old tables `admin_profile`, `frontdesk_profile`, `class_booking` must be in the DROP list.
      Files: database/db.sql
      Verify: run harness with db.sql only: executes cleanly twice in a row (re-runnable); query information_schema to confirm table count and that every FK column has an index.

- [ ] 4. Create `database/seed.sql` in a single transaction (BEGIN/COMMIT), anchor comment `-- anchor: today = 2026-11-06 (Fri)`. Insert order and row-count targets:
      1 dojo 12; 2 belt_rank 7; 3 package_def 7; 4 policy_setting ~15; 5 auto_activation_rule 5; 6 notification_template 3; 7 users ~55 (28 students, 4 guests, ~17 instructors from INSTRUCTORS, 3 staff incl. ADM-001 business 'Grace Lim', ADM-101 frontdesk 'Daniel Ong', ADM-102 frontdesk inactive 'Farah Yusof'); 8 student_profile 28 (Lervyn Wong ASK-2025-1834 4th Kyu hq; ranks 6th Kyu..1st Kyu spread; several dojos; ages incl. children, 17-25, 65+); 9 guest_profile 4; 10 instructor_profile all of INSTRUCTORS (Bob Tan Sensei = INS-0042, Steven Goh INS-0031, Robin Tan INS-0057, Annie Goh INS-0063, others INS ids unique); 11 staff_profile 3; 12 membership 28 (Active, Inactive, Deactivated, Lapsed all used); 13 student_package ~12 (Lervyn P-1834-25: 25 total, 18 left, bought 2026-09-15, expires 2027-01-15; none exceed 2 active per student); 14 payment ~22 (all 6 statuses; invoice numbers INV-xxxxxxx unique; include data.js ledger rows L-1001..L-1018 with dates mapped into November 2026 / earlier months within window); 15 refund_request 2 (R-01 pending, R-02 declined); 16 exception_request 4; 17 equipment_order 4; 18 registration_application 6 (one per status) + checklist rows; 19 guest_pass 4; 20 class_template: all HQ CLASSES (~25) + PRIVATE_CLASSES 2 (Priya Lee Mon 17:00, Jamie Tan Wed 18:00) ; 21 class_closure 2 (C-01 on 2026-11-26, plus one past); 22 class_session: dated occurrences generated from templates for 2026-11-02..2026-11-22 (2 weeks around today) plus the 13 Dec Sunday occurrences are NOT needed; 23 class_attendance ~120 across all four statuses, Lervyn's past rows (Adults Thu/Tue 19:00 attended, one no-show, one pending/Booked future); 24 makeup_class 3 incl. expiry; 25 class_feedback ~12 (Bob Tan, rows from data.js feedback, no student ids); 26 instructor_remark ~8 (kinds class/student/grading from data.js remarks); 27 check_in ~6 (all by students with a Booked/Attended session that day at that dojo); 28 grading_session 3: past Completed `GR-20260926` (2026-09-26 Sat 09:00-12:00, examiners incl. Steven Goh and Robin Tan; outcomes Hannah Teo 5th->4th Pass, Siti Rahman 2nd->1st Pass, one Fail), the upcoming `GR-20261213` (2026-12-13 09:00-12:30 label 'December Grading', lead Bob Tan, examiners 3, status Scheduled), optionally the Cancelled test session omitted; 29 grading_examiner 6; 30 grading_application ~6 (Jamie Tan, Priya Lee, Wei Jie Chua per data.js gradApps, Lervyn target 3rd Kyu); 31 grading_candidate ~6 (upcoming: Pending; past: Pass/Fail with scores and feedback text); 32 grading_history ~10 (past passes linked to grading_session; Lervyn has at least 2 past entries within window); 33 mc_request 3 (X-02 Ahmad Karim 21 days pending; one Compassion approved; one MC approved); 34 followup 3 + followup_attempt ~4; 35 sent_log 3; 36 import_issue 3; update student hours counters consistent with D3.
      Files: database/seed.sql
      Verify: harness runs db.sql then seed.sql with zero errors and COMMIT succeeds.

- [ ] 5. Fix the Robin Tan overlap in the seed (cannot edit `src/`). The weekly template for Sunday 11:00 Weapons (`CLASSES` line 82) overlaps the 2026-12-13 09:00-12:30 panel. Resolution: in `class_template` seed, assign the Sunday 11:00 Weapons template to a non-examiner instructor who has no other class at that time (pick from INSTRUCTORS excluding Bob Tan, Steven Goh, Robin Tan; verify with the check in item 6; first choice Pang Kim Lock Sensei), and note in the seed comment and README that the prototype's `data.js` still lists Robin Tan and must be updated separately. Also check Bob Tan and Steven Goh Sunday classes and their private lessons for the same clash and fix the same way. Also add a seed comment that `class_session` rows are not generated for 13 Dec, so no dated clash exists, while the template check still covers recurring classes.
      Files: database/seed.sql
      Verify: overlap query from item 6 returns 0 rows.

- [ ] 6. Run the verification suite with the harness (script lives in `$env:TEMP\askdb`; copy the final queries into `.db-tmp/verify.sql` for the record). Checks, each must pass:
      a) db.sql then seed.sql load cleanly; db.sql then seed.sql again after db.sql re-run also works.
      b) Row counts match targets in item 4 (print per table).
      c) Date window: for every DATE/TIMESTAMPTZ column (use information_schema + dynamic query) except student_profile.dob and guest/registration dob columns, min >= 2025-11-06 and max <= 2027-11-06.
      d) Grading vs class overlap: for every grading_session, every grading_examiner, join `class_template` on weekday = EXTRACT(ISODOW)-1 of session_date and time-range overlap `start_time < g.end_time AND end_time > g.start_time`, plus the same against `class_session` rows on that date (including private lessons). Expect 0 rows. Also assert no grading_session overlaps a normal class_session at the HQ dojo for the same date. Include a negative test: temporarily insert Robin Tan's original Sunday 11:00 Weapons template inside a rolled-back transaction and confirm the query returns 1 row (proves the check works).
      e) Grading venue: `SELECT count(*) FROM grading_session WHERE dojo_id <> 'hq'` = 0, and an INSERT with another dojo is rejected by the CHECK.
      f) Business rules: no student with more than 2 Active student_package rows; every Attended/Booked attendee in a check_in day has a matching session; lessons_left <= lessons_total; weapon_hours <= accumulated_hours <= total_accumulated_hours; member_no unique; ADM-001 type business, ADM-101 frontdesk, ADM-102 inactive, INS-0042 name 'Bob Tan Sensei'; class_feedback has no user column.
      g) Each status/role CHECK rejects a bad value (spot test 3 tables).
      Files: .db-tmp/verify.sql, .db-tmp/review-report.md (results table)
      Verify: all queries produce the expected results; paste outputs in the report.

- [ ] 7. Write `database/README.md`: local setup (`createdb ask_dojo`, `psql -d ask_dojo -f database/db.sql`, `psql -d ask_dojo -f database/seed.sql`), seed anchor and date rule, demo accounts (emails, password `password123` only if a real bcrypt was generated, else say hashes are placeholders), table overview by group, decisions D1-D6, the Robin Tan resolution, and the fact that verification used PGlite because psql was unavailable.
      Files: database/README.md
      Verify: manual read-through; commands in README match file names; re-run item 6 harness once more after final edits.

- [ ] 8. Final hygiene: confirm no files were added under `src/`, `prompts/`, `.agents/` and no `package.json`/`node_modules` in the repo root (`git status --short` read-only). Write `.db-tmp/review.json` is the reviewer's job, not this plan's.
      Files: none
      Verify: `git status --short` shows only `database/db.sql` (modified), `database/seed.sql`, `database/README.md` (new) plus pre-existing changes and `.db-tmp/`.

## Workflow structure
No FEAT decomposition: the schema, the seed, and the verification are tightly coupled (seed depends on every column), the whole job touches 3 files, and splitting would only add hand-offs. The existing implement-and-review loop runs this plan; its reviewer writes `.db-tmp/review.json` (`{"verdict":"APPROVED"|"CHANGES_REQUESTED","findings":[...],"reviewDoc":"<path>"}`) unchanged.
