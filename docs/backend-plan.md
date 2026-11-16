# Backend plan: attendance, venues and access (Project 1)

Status: planning only. Nothing here is built. `app.js` and the `controllers`, `middlewares` and `models` folders are still empty, and every portal reads from browser storage.

## 1. What the backend has to prove

1. A student taps an NFC tag at **any** venue (HQ or external) and their attendance is recorded centrally.
2. Instructors and admins read the same records. Nobody syncs anything between venues.
3. Each role sees only what it should (students their own, instructors their classes, admins everything).

Everything else in Project 1 (reports, notifications, dashboards) reads from this data.

## 2. How NFC and external venues work

- **One central database.** An external venue never "tells HQ". The student's phone talks to the central server.
- **Each venue's tag holds a fixed link** with a venue tag ID, for example `/checkin?tag=VEN-07`. No code needs rewriting per class.
- **Check-in:** the student opens the link, is signed in, and the server posts the check-in. The server then:
  1. finds the class running at that venue now (check-in opens 30 minutes before the start and closes at the end)
  2. checks the student is booked, or is allowed to walk in (day pass, external club)
  3. records one attendance row, once only
  4. returns the class details for the confirmation page
- **Fallback:** a venue without a tag, or a failed tap, falls back to the instructor marking attendance on their roster. That row is recorded as `method = instructor`.
- **Abuse guard:** requiring a signed-in student, a booking and the time window blocks most sharing of the link. A short-lived code shown by the instructor can be added later if needed.

## 3. Schema changes (`database/db.sql`)

| Change | Why |
|---|---|
| New `venue` table: id, name, type (HQ or external), address, tag id | Replaces the free-text `lesson_location` |
| `class_booking`: replace `lesson_location` with `venue_id`; add `starts_at`, `ends_at` | Needed to find "the class running now" |
| `student_profile`: add `home_venue_id` | Replaces the free-text `dojo` |
| `class_attendance`: add `checked_in_at`, `method` (nfc, instructor, admin), `recorded_by` | Audit trail |
| Drop `makeup_class` | The centre has no make-up classes |
| Counted sessions: keep `accumulated_hours`, but add a "sessions at current grade" figure | Drives grading eligibility |
| Fix `package.json`: replace `postgresql` with `pg` | The listed package is not the database driver |

Deferred, not Project 1 or not needed yet: class ratings, instructor remarks, grading panels, payments tables beyond what Stripe needs.

## 4. Build order

**Step 1: foundation**
- Express app, config from `.env`, Postgres connection, migrations and seed script, error handling, Joi validation.
- Sign-in with JWT. Middleware that attaches the user and role.
- **Done when:** `GET /api/me` returns the signed-in user, and a request with no token is refused.

**Step 2: access rules**
- `requireRole(...)` middleware, plus scoping helpers (own records, own classes).
- The Examiner role is checked against a panel assignment, a time window and the signed-in user, on the server.
- **Done when:** a student cannot read another student's attendance, and an instructor cannot read a class they don't teach. Tests prove both.

**Step 3: attendance**
- `POST /api/checkin` (student, NFC).
- Instructor: list classes for a range, `GET` a roster, mark present or absent, end class (locks the roster, turns unmarked students into no-shows, adds +1 session for each present student).
- Student: `GET /api/me/attendance`.
- **Done when:** a check-in at an external venue shows on the HQ instructor and admin views, and ending a class updates a student's session count.

**Step 4: venues and external sessions**
- Seed a few external venues and classes. List venues and classes with the venue name on rosters, student schedules and reports.
- No admin screen to schedule classes: that belongs to Project 2.
- **Done when:** the same student can check in at HQ and at an external venue, and both appear in their history with the venue.

**Step 5: admin reads**
- Attendance by venue and date range. A declining-attendance list (last attended 14 or more days ago). Grading readiness counts. These feed the progress dashboard.

**Step 6: automatic notifications**
- Welcome email on registration, "you are eligible for grading", "attendance has dropped". A scheduled job runs the checks daily.

**Step 7: connect the front end**
- Replace browser-storage calls with API calls one module at a time, in this order: check-in, instructor roster, student attendance, then admin views. Keep each screen working at every step.

## 5. Testing

- Jest tests for every endpoint, against a test database. The CI pipeline already runs Jest on pull requests.
- Must-have cases: a duplicate check-in, a check-in outside the time window, a check-in for an unbooked class, and cross-role access attempts.

## 6. Questions to confirm with the centre

1. Do external-venue sessions count toward grading sessions? (The centre said day passes do not count.)
2. Can a student walk in at an external venue without booking, or must they book first?
3. Do external venues have their own instructor accounts? Instructor account management is out of Project 1 scope, so the accounts would be created by hand.
4. Which belt ranges belong to which class type, for the "recommended class" rule? (The centre said 4th to 6th Kyu train together in Intermediate.)
