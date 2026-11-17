# Database schema and seed data for ASK / Aikido Shinju-Kai

The change rewrites `database/db.sql` into a 38-table PostgreSQL schema and adds `database/seed.sql` (29 students, 4 guests, 18 instructors, 3 staff, 12 dojos) and a README. Grading becomes its own set of tables pinned to the HQ dojo, classes split into a weekly template and dated sessions, and `admin_profile`/`frontdesk_profile` merge into `staff_profile`. I re-ran everything myself in PGlite (PostgreSQL 18, in `%TEMP%`, nothing touched in the repo).

Watch for: max-2-active-packages and examiner/class overlap are not DB-enforced (confirmed, documented as app-level and verification-only, acceptable as deferred); HQ is kept free of lessons on grading Sundays only by `class_closure` rows, not by a constraint (confirmed, seed-level).

**Verdict**: APPROVED

## High-level view

Grading is modelled as `grading_session`, `grading_examiner`, `grading_application`, `grading_candidate` and `grading_history`. A CHECK (`grading_only_at_hq`) plus an FK pin the venue to `hq`. I inserted a session at `bedok` and it was rejected.

Classes are split into `class_template` (weekly rule) and `class_session` (dated occurrence). Bookings and attendance share one `class_attendance` row. Location QR scans live in `check_in`, with a per-dojo `qr_token`.

Accounts use role-specific profiles with a composite `(user_id, role)` FK to `users`. Staff are one table with `admin_type` business/frontdesk. ADM-001 is business, ADM-101 is active front desk, ADM-102 is inactive front desk.

The seed anchors on 2026-11-06 and covers every status the UI shows: all six payment statuses, refunds in each state, five registration states, four membership states, and MC/compassion, makeup, closure and import rows. Grading Sundays (including 13 Dec 2026, 09:00-12:30) are blocked at HQ by closure rows, and no examiner has a class overlapping a grading slot.

## Independent verification results

My own runs, not the coder's log:

- `db.sql` then `seed.sql`: zero errors.
- `db.sql` run twice, then `seed.sql` again: zero errors, so it is re-runnable.
- Date window: 42 date/timestamp columns other than `dob` were checked against 2025-11-06..2027-11-06. Zero rows fall outside.
- Integrity: the 78 FKs have no orphan rows (the coder's check, which I did not repeat). I found no users with more than 2 Active packages, no Active packages already expired, no `hours` ordering violations, no overbooked sessions, no Attended rows on non-Ended sessions, and no session/template mismatches.
- Examiner overlap: zero overlaps with `class_template` or `class_session`.
- The Lervyn row (ASK-2025-1834, 4th Kyu, `hq`), INS-0042 Bob Tan Sensei, ADM-001/101/102, and 12 dojos all match the brief.
- Constraints: 96 CHECKs and 78 FKs with mixed ON DELETE (CASCADE, RESTRICT, SET NULL, NO ACTION). Every table has seed rows.
- Seed data holds only bcrypt-shaped placeholder hashes and `@email.com` addresses. No secrets found.
- Git: no new commits, nothing staged, no package.json or `.agents/`, protected files (.env, .env.example, .gitignore, app.js, prompts/) unchanged. The only changes are `database/` and `.db-tmp/`.

<details>
<summary>Details</summary>

## Grading kept out of the class timetable by closure rows

The HQ weekly timetable has Sunday 09:00, 10:00 and 11:00 templates that overlap the grading slot on paper. The seed handles this with `class_closure` rows CL-03 to CL-06 on each grading Sunday (including 2026-12-13) with the note "Grading day: Sunday classes paused". No `class_session` exists on those dates. The separation the user asked for therefore holds in the seed, but nothing in the schema stops a later insert from creating an HQ session during a grading slot. The README describes this as an application rule. That is a reasonable deferral for a prototype, but the booking logic must check `grading_session` as well as `class_closure`.

## Rules left to the application

`policy_setting.max_packages` (max 2 active) and the examiner-versus-class overlap rule are documented as application logic. Both are currently clean in the seed. The README also records that the prototype's Robin Tan Sunday 11:00 Weapons class was reassigned to Pang Kim Lock Sensei in the seed to avoid the overlap. `data.js` still has the old assignment, so the UI mock and the DB disagree on that one class.

## Hours counters

`total_accumulated_hours`, `accumulated_hours` and `weapon_hours` each carry a column comment and a CHECK enforcing weapon <= accumulated <= total. This is what the brief asked for.

</details>

<details>
<summary>File map</summary>

- `database/db.sql`: rewritten schema, 38 tables, drops old `class_booking`, `admin_profile`, `frontdesk_profile`.
- `database/seed.sql`: seed data in one transaction.
- `database/README.md`: table groups and design decisions.

</details>
