# Aikido Shinju-Kai (ASK) management system

FSDP project - Aikido PS 1.

One Node.js server runs the REST API (Express + PostgreSQL, MVC) and serves the four static portals from `src/public`:

| Portal | URL | Who |
| --- | --- | --- |
| Public site | `/landingpage/` | visitors (trial booking, join form, dojo and fee information) |
| Student portal | `/student_portal/` | members |
| Instructor portal | `/instructor_portal/` | instructors (sign in on the staff page) |
| Office portal | `/admin_portal/` | Front desk and Business Admin |

`/` redirects to the public site. The pages hold no data of their own: they read and write through the API and keep nothing in the browser
(only three display preferences: sidebar collapsed, home view and sound).

## Requirements

- Node.js 20 or newer (CI uses Node 25)
- PostgreSQL 14 or newer

## Install

```powershell
npm install        # or: npm ci
```

### Create the database

```powershell
createdb ask_dojo
psql -d ask_dojo -f database/db.sql      # schema (safe to run again: it drops and recreates the tables)
psql -d ask_dojo -f database/seed.sql    # sample data
```

See [database/README.md](database/README.md) for the tables, the seed rules and every schema change made for the backend.

### Configure

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored: never commit it.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` turns on HSTS, `Secure` cookies, hides error details and makes `JWT_SECRET` mandatory |
| `PORT` | `3000` | HTTP port |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `localhost`, `5432`, `ask_dojo`, `postgres`, none | PostgreSQL connection |
| `DB_POOL_MAX` | `10` | maximum pooled connections |
| `DB_SSL` | `false` | `true` connects with TLS |
| `JWT_SECRET` | none | secret that signs the session token. **Required in production** (the server refuses to start without it). In development a random throwaway value is used and a warning is printed, so sessions end on every restart |
| `JWT_EXPIRES_IN` | `8h` | session length (for example `8h`, `30m`) |
| `APP_TZ` | `Asia/Singapore` | time zone used for "today" and class times |
| `APP_FAKE_TODAY` | unset | **development only.** Pins the server date, for example `2026-11-06`, which is the day the seed data is built around. Ignored (with a warning) when `NODE_ENV=production` |
| `LOGIN_RATE_MAX`, `LOGIN_RATE_WINDOW_MS` | `10`, `900000` | sign-in attempts allowed per address in the window |
| `CHANGE_PW_RATE_MAX`, `CHANGE_PW_RATE_WINDOW_MS` | `5`, `900000` | failed change-password attempts allowed per signed-in account in the window (successful changes are not counted); then `429 RATE_LIMITED` |
| `TRUST_PROXY` | unset | set to the number of proxies in front of the server when you deploy behind one |

Use a long random value for `JWT_SECRET`, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

The seed data is dated around 6 November 2026. Without `APP_FAKE_TODAY` the server uses the real date, so the seeded classes and
bookings will look old or far ahead. For a demo, set `APP_FAKE_TODAY=2026-11-06` in `.env`. The clock time still follows the real time of day.

## Run

```powershell
npm start      # node app.js
npm run dev    # node --watch app.js (restarts on change)
npm test       # placeholder: there is no unit-test framework yet, the command exits 0 so CI can run it
```

Open http://localhost:3000.

## Demo accounts

Every seeded account uses the password `password123`. It is for local demos only: change or remove these accounts before any real use.

| Portal | Sign in with | Who |
| --- | --- | --- |
| Student | `ASK-2025-1834` or `lervyn@email.com` | Lervyn Wong, 4th Kyu |
| Instructor (staff sign-in page) | `INS-0042` | Bob Tan Sensei |
| Business Admin (staff sign-in page) | `ADM-001` | Grace Lim |
| Front desk (staff sign-in page) | `ADM-101` | Daniel Ong |

`ADM-102` (Farah Yusof) is a deactivated front desk account and cannot sign in.

The seeded registration applications that are still open (`APP-01` to `APP-04`) also carry the demo password hash, so a member activated from one
of them signs in with `password123`. Every demo hash is the same documented bcrypt value; it is not a secret.

## Accounts and passwords

- **Members choose their own password when they register**, on the public join form or at the front desk (the student types it; staff never see it).
  Rules: at least 8 characters, a letter and a number, at most 72 bytes, not the same as the email. The server hashes it with bcrypt before it
  opens the transaction and keeps only the hash on `registration_application.password_hash` while the application waits. On activation the same
  hash moves to `users.password_hash` and the application copy is cleared; a rejection clears it too. No temporary password is created and none is
  shown. The member signs in with the membership number or the email and that password.
- **Old applications without a stored hash** (data from before this change) fall back to the previous flow: activation returns a `tempPassword`
  once to the staff member and the new account must change it at first sign-in.
- **Staff accounts** created by a Business Admin, and any account whose password a Business Admin resets, get a temporary password shown once to the
  Business Admin and `users.must_change_password = true`.
- **Forced change:** while `must_change_password` is true the account can sign in, call `GET /auth/me`, `POST /auth/change-password` and
  `POST /auth/logout`; every other authenticated API returns `403 PASSWORD_CHANGE_REQUIRED`. The portals show only a locked "Choose a new
  password" dialog (no close button, Escape and the overlay do nothing, a Sign out link) until the password is changed.
- **Change password:** `POST /api/v1/auth/change-password` with `{ currentPassword, newPassword, confirmPassword }`. Errors: `400 CURRENT_PASSWORD_INCORRECT`
  (400, not 401, so the pages do not sign the user out), `400 WEAK_PASSWORD` (same rules as above, and not the email, user id or member number),
  `400 PASSWORD_REUSED`, `400 VALIDATION_ERROR` (mismatch, unknown field), `429 RATE_LIMITED`. On success the response is `{ ok: true, user }`
  with a fresh `ask_token` cookie. The dialog is on the student and instructor profile pages and behind the key button in the office sidebar
  (and "Change password" in the phone menu).
- **Session invalidation:** `users.password_changed_at` is set by a change or a reset. A token issued before that moment is refused with
  `401 SESSION_EXPIRED`, so a password change or a Business Admin reset signs that account out everywhere else.

## Grading notes

Grading notes (`instructor_remark.kind = 'grading'`) are written by instructors for the examiners. They are not shown to students: the student
query `remarkModel.forStudent` only selects class notes for attended classes and notes written to the student (`kind = 'student'`), so no student
endpoint can return a grading note. Instructors still see them on their roster and the examiners on the grading candidates list.

## Audit log

Every staff, auth, finance, grading, booking-override, closure and policy change writes one row to `audit_log` in the same transaction as the
change (if the audit write fails, the change is rolled back). Rows keep the actor's id, name, role and admin type at that moment, the action
(`group.verb`), the entity, a readable summary, `details` (ids, changed field names, before/after for non-personal values only), the IP address
and user agent. Passwords, hashes, tokens, temporary passwords and card data are never recorded (a sanitiser drops keys such as `password`,
`token` or `card` and any bcrypt or JWT-shaped string). A database trigger makes the table append-only (see database/README.md).

Business Admins read it on **Audit log** (office portal, Control group) with filters, search, pages and CSV export. The front desk does not see
the page and the API returns `403 BUSINESS_ADMIN_ONLY`.

**Audited:** `auth.login`, `auth.login_failed` (no actor; the typed identifier is never stored; a failure to write this row never changes the 401),
`auth.password_changed`, `auth.password_change_failed`; `staff.created`, `staff.role_changed`, `staff.deactivated`, `staff.reactivated`, `staff.password_reset`;
`member.updated`, `member.belt_changed`, `member.message_sent`; `followup.created`, `followup.updated`, `followup.attempt_logged`, `followup.contact_logged`;
`payment.collected`, `payment.voided`, `payment.adjusted`, `payment.mistake_reported`, `refund.requested`, `refund.decided`, `day.locked`, `day.unlocked`,
`equipment.ready`, `equipment.handed_over`; `exception.raised`, `exception.decided`, `mc.decision`; `registration.submitted`, `registration.activated`,
`registration.checklist_changed`, `registration.info_requested`, `registration.rejected`; `booking.overridden`, `booking.cancelled_by_staff`,
`attendance.corrected`, `attendance.submitted`; `closure.created`, `closure.deleted`, `class.cancelled`; `policy.updated`, `policy.package_updated`,
`policy.rule_updated`, `policy.template_created|updated|deleted`, `timetable.changed`, `import.decided`, `intervention.added`, `intervention.decided`,
`notification.sent`; `grading.result_submitted`, `grading.application_decided`, `grading.promotion_decided`; `audit.exported`.

**Not audited (routine or self-service):** every GET, student self-service (bookings, packages, profile, feedback, grading apply/withdraw,
extension requests), instructor attendance marks, remarks and grading notes, public trial bookings, and routine desk roster work (normal bookings,
waitlist, walk-ins, guests).

## API

Base path `/api/v1`. Every response is JSON, and errors look like `{ "error": { "code": "CLASS_FULL", "message": "..." } }`.

| Area | Prefix | Who may call it |
| --- | --- | --- |
| Reference and clock | `/meta`, `/reference` | anyone |
| Auth | `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/forgot-password`, `/auth/change-password` | anyone (`me` and `change-password` need a session; both stay open while a password change is required) |
| Public site | `/public/...` | anyone (trial and join are rate limited) |
| Student | `/student/...` | students only; every query is scoped to the signed-in student |
| Instructor | `/instructor/...` | instructors only; only their own classes and grading panels |
| Office | `/admin/...` | admin accounts. Business Admin only routes return `403 BUSINESS_ADMIN_ONLY` to the front desk |
| Audit log | `GET /admin/audit`, `GET /admin/audit/export.csv` | Business Admin only |

`GET /admin/audit` takes `from`, `to` (`YYYY-MM-DD`, Singapore days, both inclusive), `actorId`, `group` (for example `payment`), `action`
(for example `payment.voided`), `entityType`, `entityId`, `q` (text search) and `page` / `pageSize` (default 25, max 100), newest first, and returns
`{ rows, total, page, pageSize, pages, facets }`. `export.csv` takes the same filters (no paging, at most 10 000 rows), sends
`audit-log-<date>.csv` with formula-safe cells, and is itself logged as `audit.exported`. Unknown or invalid parameters return `400 VALIDATION_ERROR`.

Any authenticated call made by an account that must change its password returns `403 PASSWORD_CHANGE_REQUIRED`; a token older than the last
password change returns `401 SESSION_EXPIRED`.

## Folder tree

```
app.js                    entry point: builds the Express app, serves src/public, starts listening
database/                 db.sql (schema), seed.sql (sample data), README.md
scripts/                  placeholder-test.js (what `npm test` runs)
src/
  config/                 environment parsing, PostgreSQL pool and transactions
  middleware/             auth (JWT cookie), role and admin-type guards, validation, JSON-only guard, rate limits, helmet/CSP, errors
  routes/                 one router per area, mounted under /api/v1 (routes/admin/ has the office routers)
  controllers/            read the request, call a service, send the response (no SQL, no rules)
  services/               business rules: booking, package credits, attendance, grading, payments, registration, reports
  models/                 all SQL, parameterised queries only
  validators/             zod schemas for every request body, query and parameter
  utils/                  clock (today/now, APP_FAKE_TODAY), errors, password hashing, CSV
  public/                 the four static portals (css/, js/ shared scripts, landingpage/, student_portal/, instructor_portal/, admin_portal/)
```

Requests flow `route -> middleware (auth, role, validate) -> controller -> service -> model -> PostgreSQL`.

## Security notes

- **Sessions:** a signed JWT in the `ask_token` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production. Passwords are hashed with bcryptjs. Sign-in failures give one generic message. Sign-in, forgot-password and change-password are rate limited. A password change or reset ends the account's older sessions.
- **Authorisation:** the server checks the role and admin type on every route and the owner of every record. The menu hiding in the pages is only a convenience.
- **CSRF:** the cookie is `SameSite=Lax`, and every request that changes data must be `Content-Type: application/json` (anything else gets `415`). A cross-site form cannot send JSON, and a cross-site `fetch` with that type needs a CORS preflight that this server does not allow. There is no CSRF token.
- **Input:** each route validates its input with zod and rejects unknown fields. SQL uses parameters only and lives in `src/models`. `password_hash` and the dojo `qr_token` are never sent to a browser.
- **Headers:** helmet with an explicit Content-Security-Policy (scripts from this server only, no inline event handlers), HSTS in production.
- **Errors:** responses never contain a stack trace; the details go to the server log only.
- **Secrets:** only from the environment. The server refuses to start in production without `JWT_SECRET`.

## Deferred (not built yet)

QR / location check-in (the student check-in page and scanner are an in-memory mock), a real payment gateway (payments are recorded in the database
and "paid" is set by the server), email and SMS sending (notifications are written to the sent log), the spreadsheet import pipeline, file uploads
(only the file name is kept), real-time updates, student photos, Google sign-in, and a self-service "forgot password" reset (the link is a mock;
a Business Admin can reset a password). The audit log and change password were added in round 2 (see above).
