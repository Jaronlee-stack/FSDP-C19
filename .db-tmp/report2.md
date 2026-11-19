# Report 2: schema/seed revision and prototype sync

Nothing is committed. Anchor date: today = 2026-11-06 (Fri). All edits were made with the file edit tools.

## Result

- `node .db-tmp/verify.mjs`: ALL CHECKS PASSED (log: `.db-tmp/verify.log`, 78 checks including the new ones and the negative tests).
- `$env:TZ='Asia/Singapore'; node .db-tmp/agree.mjs`: 1479 values compared, 0 unexplained mismatches, 4 allowed differences with reasons (log: `.db-tmp/agree.log`).
- `node .db-tmp/browser-check.mjs`: 39 pages at 1280px and 390px, 0 console errors, 0 failed requests (re-run after the final `data.js`/`store.js` edits). Screenshots from FEAT-001 are in `.db-tmp/screens/` (the final edits changed no layout, only data values).

## What changed per numbered decision

1. **Grading closes the timetable (changes the weekly timetable when grading exists).**
   - `seed.sql` no longer has CL-03..CL-06. It keeps CL-01 (public holiday) and CL-02 (mat resurfacing) and derives one closure `CL-<grading id>` (for example `CL-GR-20261213`) from every `grading_session` that overlaps an HQ weekly class.
   - `db.sql` has the new view `v_grading_conflict` (4 conflict kinds: `examiner_template`, `examiner_session`, `hq_template_open`, `hq_session`). It returns 0 rows. No HQ `class_session` exists on 2026-12-13, 2026-11-26, 2026-10-10/11 or 2026-09-27.
   - The prototype side (FEAT-001) has the 13 Dec HQ closure, so the student book page and instructor schedule show it.
2. **Prototype and seed agree.** `agree.mjs` is the proof (see Result and the list below).
3. **Joining dates are stored.** `student_profile.joined_on DATE NOT NULL` for all 29 students (plan2 D3 dates). It is exempt from the 2-year window, like `dob`. The year equals the year in `member_no`. S-006 Marcus joined 2026-09-14 and his `users.created_at` is 2026-09-14 15:00.
4. **Prototype data and seed agree.** Same as 2.
5. (Accepted by the user, no change.)
6. **Timetables for the other dojos.** 20 SAMPLE templates CT-23..CT-42 (10 open non-HQ dojos, 2 each), dated sessions for all templates from 2026-09-21 to 2026-12-20. `tampineswest` (temporarily closed) has none. Online booking is HQ only, enforced by the new CHECK `online_bookable_hq_only` on `class_template`. No bookings or attendance exist for non-HQ sessions.

## Schema changes (`database/db.sql`)

- `student_profile.joined_on DATE NOT NULL` with a COMMENT about the window exemption.
- `class_template` CHECK `online_bookable_hq_only` (`dojo_id = 'hq' OR NOT online_bookable`).
- View `v_grading_conflict` with a COMMENT. `DROP VIEW IF EXISTS v_grading_conflict;` is at the top of the drop list, so the file stays re-runnable (verified: run twice, then seed loads again).

## Seed changes (`database/seed.sql`)

- Header notes rewritten (joined dates stored, Robin/CT-19 agrees with `data.js`, derived closures, sample timetables, session range).
- `joined_on` added to the 29 `student_profile` rows. S-006 `users.created_at` = 2026-09-14 15:00+08.
- `grading_session` and `grading_examiner` inserts moved above the class section (closures depend on them). The grading applications, candidates and history stay in section 6.
- CT-23..CT-42 added with a SAMPLE comment. Sessions generated for 2026-09-21..2026-12-20. Random bookings now require `ct.online_bookable` and `session_date <= 2026-12-06`.
- `class_feedback.lesson_id` and `created_at` for FB-03..FB-12 re-pointed to real Bob Tan sessions using `.db-tmp/feedback-map.json`. FB-01 and FB-02 were already correct.
- `sent_log` SL-01 `sent_at` = 2026-11-03 17:00+08 (before the cancelled class).
- `grading_history` GH-07 remark = "Excellent jo kata. Ready for yudansha track." (the prototype wording).
- C-03 count: 5 `class_attendance` rows exist for `LS-20261103-1900-HQ-A` in the final seed, which equals the 5 used by FEAT-001 (`students: 5, lessons: 5`). No change needed.

## Changes to `src/` in this feature (all small, found by `agree.mjs`)

| File | Change | Why |
|---|---|---|
| `src/public/js/data.js` `SEED().pays` | item "25 lessons" to "25-lesson pack", "10 lessons" to "10-lesson pack" | Seed and the admin ledger use the package name |
| `src/public/js/data.js` `SEED().students` | `dojo` for Siti Rahman (kovan), Marcus Lim (toapayoh), Hannah Teo (tampines), Kenji Sato (westcoast), Grace Yeo (bishan) | They said `hq` while the member list says otherwise. The field is not displayed or filtered on anywhere |
| `src/public/js/store.js` admSeed | Yuki Tanaka `joinedAgo` 85 to 86 | Day count to 2026-08-12 (the planned joined date) |

FEAT-001 made the other `src` edits (see its findings in `.db-tmp/task-db-round2/features/FEAT-001.json`). One known gap: the student portal creates new payment rows with `p.t` ("25 lessons") when a package is bought in the demo. That is untouched.

## Non-HQ timetable sources

- Real: none found. The public site (`landingpage/js/public.js`) says "Ask HQ for this term's timetable", and `Info from website.docx` has no class days or times.
- Sample: all 20 rows. The full table is in `database/README.md` ("Non-HQ sample timetables") and mirrored by `OTHER_DOJO_CLASSES` in `data.js`.

## `agree.mjs` coverage and allowed differences

Compared: dojos, instructors, staff accounts and last login date, packages, belts and grading fees, policies, templates, auto-activation rules, weekly timetable (HQ, private, non-HQ: day, time, type, instructor, capacity, kids, online, code), members (name, grade, dojo, hours, status, joined date and label, dob, source, group, email, phone, guardian, NSF), instructor student list, Lervyn's package and payments, ledger, refunds, exceptions, guests, equipment, follow-ups and attempts, imports, registration applications, grading panel, grade card, grading applications, candidates, proposals, grading feedback, closures, the cancelled class (code, date, student count), sent log, feedback, remarks, Lervyn's attendance and level-ups.

Allowed differences (each has a reason in the script):
- Test session panel (prototype only, today 20:00).
- Private lesson codes (prototype has none).
- EXT-2026-0041 status (seed Deactivated) and EXT-2026-0042 status (seed Inactive): the prototype member list only has Active and Lapsed.

Seed-only rows (listed with reasons in the log): 4 students not on the prototype member list (S-011..S-014), 12 payments (grading fees and other students), refund R-03, follow-up attempts FA-01..FA-04, applications APP-05/06, three past grading sessions, closures CL-02 and the three past grading-day closures, sent log SL-02/SL-03. Make-up rows, check-ins, MC requests and GA-12/13 are seed-only and not compared.

## Decisions to confirm (plan2.md section 3)

- Removal of Lervyn's 14 Jun 2025 registration payment from the prototype (outside the 2-year window; `joined_on` keeps the fact).
- Marcus Lim joined Sep 2026 (the prototype said Feb 2026).
- The sample non-HQ timetable (no real source).
- The wider session range (2026-09-21..2026-12-20).
- `DB_KEY` bump to `ask-prototype-v4` resets saved demo state once.
- Admin-desk grading fee fix (fee is keyed by the target rank).
- HQ-only CHECK on `online_bookable`.
- New: the two external members with seed statuses Deactivated and Inactive are allowed to differ from the prototype (Active). Alternative: change the seed to Active and give those statuses to other students.

## Deferred (plan2.md section 4)

- No UI for non-HQ timetables in the instructor/student portals or the landing page.
- Class-scope closures (the 3 Nov cancel) are not reflected in student/instructor views.
- No trigger for the grading/lesson overlap or the 2-package limit (the view and verification tests document the rule).
- No audit log.
- The student book page only looks 30 days ahead, so 13 Dec is visible only after the real "today" reaches about 13 Nov.
