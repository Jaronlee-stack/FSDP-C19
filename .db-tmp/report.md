# Report: ASK PostgreSQL schema and seed

Files changed: `database/db.sql` (rewritten), `database/seed.sql` (new), `database/README.md` (new). Work files in `.db-tmp/`: `verify.mjs`, `verify.log`, `inventory.md`, this report. Nothing under `src/`, `prompts/`, `.env*`, `.gitignore`, `app.js` was touched. No git write commands were run. No package.json in the repo; PGlite and bcryptjs live in `%TEMP%\askdb`.

## Tables by group (38)

| Group | Tables |
|---|---|
| 1 Reference | dojo, belt_rank |
| 2 Accounts | users, student_profile, guest_profile, instructor_profile, staff_profile, membership |
| 3 Packages and money | package_def, student_package, payment, refund_request, exception_request, equipment_order |
| 4 Onboarding | auto_activation_rule, registration_application, application_checklist, guest_pass |
| 5 Classes | class_template, class_session, class_attendance, makeup_class, class_closure, class_feedback, instructor_remark, check_in |
| 6 Grading | grading_session, grading_examiner, grading_application, grading_candidate, grading_history |
| 7 Office | mc_request, followup, followup_attempt, notification_template, sent_log, import_issue, policy_setting |

## Page / feature to table mapping

| Page or feature | Tables |
|---|---|
| Landing: dojos, classes, fees, join, trial | dojo, class_template, package_def, policy_setting, registration_application, guest_profile, guest_pass |
| Sign-in (student, instructor, admin) | users (+ role profile tables) |
| Student home, profile | student_profile, membership, belt_rank, instructor_remark, class_session |
| Student book.html | class_template, class_session, class_attendance, student_package, policy_setting (booking rules), makeup_class |
| Student packages.html, payments | package_def, student_package, payment, mc_request |
| Student grading.html (apply, history, feedback) | grading_application, grading_session, grading_candidate, grading_history |
| Student home: location QR check-in | dojo.qr_token, check_in |
| Student class rating (anonymous) | class_feedback |
| Instructor classes, attendance, End class | class_session, class_attendance, instructor_remark |
| Instructor grading (panel, candidates, results) | grading_session, grading_examiner, grading_candidate |
| Instructor profile and ratings | instructor_profile, class_feedback |
| Admin dashboard, payments, ledger | payment, refund_request, exception_request |
| Admin members, member record | student_profile, membership, student_package, payment, equipment_order, followup |
| Admin applications and register | registration_application, application_checklist, auto_activation_rule |
| Admin guests | guest_profile, guest_pass |
| Admin timetable, closures | class_template, class_session, class_closure |
| Admin equipment | equipment_order |
| Admin follow-ups | followup, followup_attempt |
| Admin notifications | notification_template, sent_log |
| Admin imports | import_issue |
| Admin grading approvals, promotions | grading_application, grading_candidate.promotion_status |
| Admin staff, policies | staff_profile, policy_setting, auto_activation_rule |

## Decisions to confirm

Old vs new schema:
1. `class_booking` is replaced by `class_session` (dated) + `class_template` (weekly). `lesson_id` key style kept (`LS-20261109-1900-HQ-A`).
2. `class_attendance` is kept by name and now also holds the booking (added `student_package_id`, `booked_at`, `marked_by`, `marked_at`). Its user FK points to `users` so guest walk-ins fit.
3. `admin_profile` and `frontdesk_profile` are merged into `staff_profile(admin_type business|frontdesk, status)`. `users.role` changed from (student, guest, instructor, admin, front_desk) to (student, guest, instructor, admin).
4. `student_profile`: `rank` and `dojo` text became `rank_id` and `dojo_id` FKs; `discount BOOLEAN` became `discount_type` (none/student/senior/nsf); added `member_no`, `gender`, `age_group`, `source`, guardian/emergency/medical fields. `membership.account_status` gained `Lapsed`; added `last_renewed_at`.
5. `grading_history` now links to `grading_session` and has from/to rank; `grade BOOLEAN` kept.
6. `makeup_class` gained `expires_at` and `created_at`.
7. Composite `(user_id, role)` FK on each profile table (role guard). Adds a `role` column to each profile table.
8. Grading is separate; HQ enforced by CHECK + FK.
9. HQ Sunday classes are closed on grading days via `class_closure` (CL-03 to CL-06), so grading never shares the room with a lesson. This changes the weekly timetable on those four Sundays. Alternative: drop the closures and accept the room overlap (only the examiner check would remain).
10. Seed moves Robin Tan's Sunday 11:00 Weapons class (CT-19) to Pang Kim Lock Sensei. `data.js` is unchanged and still lists Robin.
11. Joining dates are not stored (old members would be outside the date window). `member_no` carries the year.
12. Instructor ranks are `dan_grade` (1 to 10), not an FK to `belt_rank` (which stops at 1st Dan).
13. Seed deviations from data.js to fit the date rule or fix inconsistencies: Lervyn's Jun 2025 registration payment omitted; Hannah Teo's grading fee dated 12 Sep 2026 and S$50 (fee is keyed by target rank: to 4th Kyu = 50); Lervyn's attendance mapped to real timetable slots (the prototype had Tue 19:00 Adults with Bob Tan, but the timetable says James Tan); the Tue 3 Nov 19:00 Adults class is marked Cancelled (matches `sent_log`) and generates three make-up rows.
14. Grading fee meaning: `belt_rank.grading_fee` is the fee to grade into that rank.
15. Refund requests: 3 (R-01 pending, R-02 declined, R-03 approved for the Refunded payment) instead of 1 to 2, so the Refunded payment status has a matching request.

## Deferred / not modelled

- No audit_log: admin pages show only "last login", stored as `users.last_login_at`.
- `cohorts`, `interventions` (sample chart figures), `rosters` and `memberInfo` blobs: derived from attendance and profile columns.
- Lervyn has no `grading_application` for 3rd Kyu (prototype `grade.submitted` is null, he has 29 of 36 sessions).
- Max 2 active packages is checked by the verification script, not enforced by a trigger.
- No Expired make-up row and no Converted guest (CHECK lists allow them).
- Class sessions exist only for 2026-10-26 to 2026-11-22 at HQ (online booking is HQ-only). Other dojos have no timetable data in the prototype.
- `psql` is not installed here, so the files were not run against a native server.

## Verification evidence

Ran `node .db-tmp/verify.mjs` (PGlite 0.5.16, PostgreSQL 18.6 in WASM, in-memory). Full output: `.db-tmp/verify.log`; table/column inventory: `.db-tmp/inventory.md`. Result: **ALL CHECKS PASSED** (a first run found two issues that were fixed: future `booked_at` dates and the check harness expectations for composite role FKs and the Sep 2026 session where Robin is also an examiner).

| Check | Result |
|---|---|
| `db.sql` then `seed.sql`, zero errors | pass |
| `db.sql` run twice more (idempotent), tables empty, `seed.sql` loads again | pass |
| 38 tables, every one has at least 1 seed row | pass |
| Orphans across 78 foreign keys | 0 |
| Every FK has a supporting index (4 role-guard FKs use the PK index) | pass |
| 42 populated date/timestamp columns within 2025-11-06..2027-11-06 (dob excluded) | pass; overall min 2025-11-06 window, earliest value 2025-11-07/2025-11-20, latest 2027-11-05 |
| No examiner has a weekly template or dated session overlapping any grading session | pass (0 rows) |
| No HQ class (unless closed that day) overlaps a grading session | pass |
| Negative test: Robin back on Sunday 11:00 Weapons is flagged (GR-20261213 and GR-20260927) | pass, rolled back |
| Negative test: removing closure CL-06 flags 3 HQ Sunday templates | pass, rolled back |
| Every grading_session at `hq`; insert at `bedok` rejected | pass |
| CHECK rejects: bad role, payment status, attendance status, admin_type, rating, hours order; role-guard FK rejects student profile on instructor | pass |
| Max 2 active packages; lessons_left <= total; hours order; member_no format | pass |
| Capacity not exceeded; Attended/No-Show only past, Booked only today or later; check-ins have a booking; no overlapping bookings per student; booking rules (kids, Ladies, Intermediate, Advanced) respected; no mat clash | pass |
| Demo accounts: Lervyn Wong ASK-2025-1834 4th Kyu HQ; INS-0042 Bob Tan Sensei; ADM-001 business; ADM-101 frontdesk; ADM-102 inactive | pass |
| 12 dojos, 18 instructors, all 6 payment statuses, 4 attendance statuses, 4 membership statuses, 5 registration states | pass |
| Upcoming grading GR-20261213: 2026-12-13 09:00-12:30, hq, 3 examiners; past completed sessions exist | pass |
| `class_feedback` has no student/user column | pass |

Row counts: users 54, student_profile 29, instructor_profile 18, staff_profile 3, guest_profile 4, student_package 24, payment 33, class_template 22, class_session 88, class_attendance 105, check_in 6, grading_session 4, grading_candidate 11, grading_history 8 (full list in `verify.log`).

Seed password hash: real bcrypt of `password123` generated with bcryptjs in `%TEMP%\askdb`.
