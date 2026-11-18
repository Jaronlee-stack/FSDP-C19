# ASK backend and front-end rewire: final report

Branch `backend-integration`, HEAD `769e384` (unchanged). Nothing is committed or staged; all work is uncommitted in the tree.

## 1. Architecture overview

One Express 5 server (`app.js`) serves the REST API under `/api/v1` and the static portals from `src/public`. `/` redirects to the public site.
MVC layering: `route -> middleware (authenticate, requireRole, requireAdminType, validate, requireJson) -> controller -> service -> model -> PostgreSQL`.
All SQL is in `src/models` (parameterised). Business rules are in `src/services`. Controllers only read the request and send the response.
Dependencies: express, pg, bcryptjs, jsonwebtoken, cookie-parser, dotenv, helmet, express-rate-limit, zod 4.

```
app.js
database/            db.sql, seed.sql, README.md
scripts/             placeholder-test.js
src/
  config/            index.js (env), db.js (pool, withTx)
  middleware/        auth, roles, validate, requireJson, rateLimit, security (helmet/CSP), error
  routes/            index, meta, auth, public, student, instructor, admin/{index,desk,members,finance,business,grading,staff}
  controllers/       auth, meta, public, student, instructor, desk, member, finance, business, gradingAdmin, staff
  services/          29 files: booking, package, attendance, grading, registration, payment, policy, closure, timetable, report, ...
  models/            36 files, one per table group
  validators/        auth, public, student, instructor, admin (zod)
  utils/             clock, errors, password, csv
  public/            css, js (core, api, data, store, portal, ben), landingpage, student_portal, instructor_portal, admin_portal
```

Front end: every page loads `core.js` then `api.js`. `api.js` fetches `/reference` and `/auth/me`, loads `data.js` (fixed labels), fills those constants in place, then loads the page's own scripts. Each portal has a data module (`public-data.js`, `student-data.js`, `instructor-data.js`, `admin-data-desk.js`, `admin-data-business.js`) with `ASK.load.*` (GET into the in-memory `DB`) and `ASK.act.*` (write, then reload the slice).

## 2. Endpoint catalogue (as built, prefix `/api/v1`)

Guards: **A** anyone, **S** student, **I** instructor, **FD** any admin, **BA** Business Admin only. Every mutating request must be JSON.

**Meta and auth (A)**: `GET /meta`, `GET /reference`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (session), `POST /auth/forgot-password` (202, always the same answer).

**Public (A)**: `GET /public/dojos`, `/public/classes`, `/public/packages`, `/public/sessions?date=`; `POST /public/trial-bookings`, `POST /public/registrations` (both rate limited).

**Student (S)**: `GET /student/home`, `/profile`, `/packages`, `/timetable`, `/bookings`, `/attendance`, `/payments`, `/payments/:id`, `/grading`; `PATCH /student/profile`; `POST /student/packages`; `POST /student/packages/:id/extension-requests`; `DELETE /student/extension-requests/:id`; `POST /student/bookings`; `DELETE /student/bookings/:lessonId`; `POST /student/grading/applications`; `DELETE /student/grading/applications/:id`; `POST /student/feedback`.

**Instructor (I)**: `GET /instructor/profile`, `/schedule`, `/students`, `/sessions/:lessonId`, `/grading`, `/grading/sessions/:id/candidates`; `PUT /instructor/sessions/:lessonId/attendance/:userId`; `POST /instructor/sessions/:lessonId/end`; `PUT /instructor/sessions/:lessonId/remarks`; `PUT /instructor/students/:userId/grading-note`; `POST /instructor/grading/sessions/:id/candidates/:userId/result`.

**Office, desk (FD)**: `GET /admin/summary`, `/today`, `/rosters`, `/rosters/:lessonId`, `/guests`, `/followups`, `/notifications`, `/notifications/audience`, `/members`, `/members/:memberNo`, `/payments`, `/equipment`, `/applications`, `/applications/:id`;
`POST /admin/rosters/:lessonId/{bookings,walk-ins,waitlist,submit}`, `DELETE .../bookings/:userId`, `DELETE .../waitlist/:userId`, `POST .../waitlist/:userId/offer`, `PUT .../attendance/:userId`;
`POST /admin/followups/:id/attempts`, `POST /admin/notifications/send`, `PATCH /admin/members/:memberNo`, `POST /admin/members/:memberNo/{messages,contact-attempts}`;
`POST /admin/payments`, `/payments/day/lock`, `/payments/:id/collect`, `/payments/:id/mistake`, `POST /admin/refunds`, `POST /admin/equipment/:id/{ready,handover}`;
`PATCH /admin/applications/:id/checklist`, `POST /admin/applications/:id/{activate,reject,request-info}`, `POST /admin/registrations`, `POST /admin/mc-requests/:id/decision`, `POST /admin/exceptions`.

**Office, Business Admin (BA)**: `POST/PATCH /admin/followups`, `POST /admin/payments/:id/void`, `POST /admin/refunds/:id/decision`, `POST /admin/exceptions/:id/decision`, `DELETE /admin/payments/day/lock/:date`, `GET /admin/members/export.csv`;
`GET /admin/overview`, `/insights`, `/revenue`, `/reports`, `/reports/:kind.csv`, `/policies`, `/timetable`, `/closures`, `/closures/preview`, `/imports`, `/grading`, `/staff`;
`POST /admin/insights/interventions`, `PATCH .../interventions/:id`; `PATCH /admin/policies`, `/policies/packages/:id`, `/policies/auto-activation/:id`; `POST/PATCH/DELETE /admin/policies/templates[/:id]`; `POST/PATCH/DELETE /admin/timetable[/:id]`; `POST /admin/closures`, `DELETE /admin/closures/:id`, `POST /admin/classes/:lessonId/cancel`; `PATCH /admin/imports/:id`; `POST /admin/grading/applications/:id/decision`, `POST /admin/grading/candidates/:sessionId/:userId/promotion`; `POST /admin/staff`, `PATCH /admin/staff/:id`, `POST /admin/staff/:id/reset-password`.
Some rules inside desk routes are BA only and checked in the service (belt, status or dojo change, booking override, starting grade on activation): `403 BUSINESS_ADMIN_ONLY`.

## 3. Page-to-endpoint map

| Page(s) | Endpoints used |
| --- | --- |
| landingpage: index, about, class, classes, dojo, dojos, fees | `/reference` (dojos, packages, timetable, instructors, policies) |
| landingpage/trial | `/public/sessions`, `POST /public/trial-bookings` |
| landingpage/join | `/reference`, `POST /public/registrations` |
| student_portal/login, admin_portal/signin | `/auth/login`, `/auth/forgot-password` |
| student: index (home) | `/student/home`, `/student/feedback` |
| student: book | `/student/timetable`, `/student/bookings` (POST, DELETE) |
| student: packages | `/student/packages` (GET, POST), `/student/packages/:id/extension-requests`, `/student/extension-requests/:id` |
| student: payments | `/student/payments`, `/student/payments/:id` |
| student: grading | `/student/grading`, `/student/grading/applications` |
| student: profile | `/student/profile` (GET, PATCH) |
| student: checkin | none (in-memory mock) |
| instructor: index | `/instructor/schedule`, `/instructor/sessions/:id` and its attendance, end and remarks routes, `/instructor/students` |
| instructor: grading | `/instructor/grading`, `.../candidates`, `.../result` |
| instructor: profile | `/instructor/profile` |
| admin: index (desk), sessions (desk), roster | `/admin/summary`, `/today`, `/rosters...` |
| admin: members, member | `/admin/members...` |
| admin: payments, equipment | `/admin/payments...`, `/refunds`, `/equipment...` |
| admin: applications, register | `/admin/applications...`, `/mc-requests`, `/exceptions`, `/registrations` |
| admin: followups, notify | `/admin/followups...`, `/notifications...` |
| admin: index (BA), insights, revenue, reports | `/admin/overview`, `/insights`, `/revenue`, `/reports` |
| admin: sessions (BA tabs), policies | `/admin/timetable`, `/closures`, `/classes/:id/cancel`, `/policies...` |
| admin: grading, staff, imports | `/admin/grading...`, `/admin/staff...`, `/admin/imports...` |

## 4. Auth design

- `POST /auth/login {portal, identifier, password}`: students sign in with member number or email, instructors with `INS-nnnn`, office staff with `ADM-nnn`. bcryptjs compares against `users.password_hash`. One generic `INVALID_CREDENTIALS` message for an unknown account or wrong password. Deactivated accounts get `ACCOUNT_DEACTIVATED` (403 at sign-in, 401 on a live session). `users.last_login_at` is updated.
- The server signs a JWT (`JWT_SECRET`, `JWT_EXPIRES_IN`) and sets it in the `ask_token` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production. The account is re-read from the database on every request, so deactivation and role changes apply at once.
- `requireRole(...)` and `requireAdminType('business')` enforce roles. Ownership is enforced by scoping every student and instructor query to `req.user.id`.
- Sign-in and forgot-password are rate limited (default 10 per 15 minutes per address; env tunable). `JWT_SECRET` is mandatory in production (verified: `NODE_ENV=production` without it exits with an error).
- CSRF: `SameSite=Lax` plus JSON-only mutating requests (`415 JSON_REQUIRED` otherwise); no CORS is enabled, so a cross-site page cannot send a JSON request with the cookie.
- The front end gets the role and admin type from `/auth/me`; the menu gating is only a convenience.

## 5. Business rules implemented (server side)

- Booking: HQ classes only online; eligibility by kids/Ladies/SG50/Intermediate (4th Kyu+)/Advanced (1st Kyu+); capacity; double booking and time clash; booking window from policies (min 1 day, 1 month ahead); needs an active membership and a lesson credit.
- Credits: lesson taken from an Unlimited plan first, else the pack that expires first; pack at 0 becomes Used up; maximum 2 packages held; cancel at least 4 hours before returns the lesson, later keeps it, after the start is refused.
- Extensions: MC or Compassion requests; front desk approves up to 14 days, longer goes to the Business Admin exceptions queue.
- Attendance: instructor window opens 30 minutes before the class and closes at its end; marking Attended credits the class length once to total and accumulated hours (plus weapon hours for Weapons); no double counting; Attended cannot be undone; end class turns leftover Booked into No-Show; desk corrections need a reason.
- Grading: eligibility checklist (sessions per rank, months in rank, months as member, fees paid); fee from the target belt; examiner window from 15 minutes before to the end of the panel, examiners only; six criteria scored 0 to 3 (Pass at 70%, Retake at 50%); Pass makes a promotion pending; the Business Admin approves or declines it; promotion changes rank, resets accumulated hours, writes grading history.
- Registration: quote (registration, annual dues, dogi, package, best of senior or student discount); guardian rule for children; activation re-checks every enabled auto-activation rule (`RULES_NOT_MET`); creates user, profile, membership, package, payments, equipment order and sent-log rows.
- Payments: mock collect; void is BA only; refund requests raised by the front desk and decided by the BA; day lock; refund or void of a package payment retires the package and cancels its upcoming bookings; annual dues renew membership by 12 months.
- Closures: closing a day or class cancels the lessons and returns them; deleting a closure reopens exactly its lessons; moving or deleting a weekly class with bookings is refused or returns lessons.
- Staff: BA creates staff and instructors, changes admin type, deactivates, resets passwords; cannot change or deactivate themselves; last active BA is protected.
- Feedback: class ratings never store the student; a separate prompt table remembers who answered.
- Notifications: write `sent_log` rows only; the front desk has a limited audience, the BA a wider one.
- Reports and Insights are computed in SQL (occupancy, retention, revenue, attendance, progression).

## 6. Schema changes (all additive, `db.sql` re-runnable, `seed.sql` unchanged)

1. New table `class_waitlist`.
2. `class_attendance.booked_via`.
3. `grading_candidate.result` also allows `Retake`.
4. `guest_pass.pass_type` also allows `single`, `month`, `private`; new `guest_pass.amount_paid`.
5. New table `class_feedback_prompt`.
6. `payment.note`.
7. `exception_request.decision_note`, `mc_request.decision_note`.
8. `followup.kind` also allows `newcomer`.
9. `class_session.closure_id` (FK `class_closure`, `ON DELETE SET NULL`).
10. `import_issue.matched_user_id` (FK `student_profile`).
11. `instructor_profile.status`.
12. `policy_setting.value_text` widened from `VARCHAR(255)` to `TEXT`.
13. Indexes `idx_waitlist_user`, `idx_feedback_prompt_user`; the DROP list and header table list were updated.

Described in `database/README.md`, section "Schema changes for the backend". Loading `db.sql` and `seed.sql` twice gives no `v_grading_conflict` rows.

## 7. Environment variables

`NODE_ENV`, `PORT`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_MAX`, `DB_SSL`, `JWT_SECRET` (required in production), `JWT_EXPIRES_IN`, `APP_TZ`, `APP_FAKE_TODAY` (development only), `LOGIN_RATE_MAX`, `LOGIN_RATE_WINDOW_MS`, `TRUST_PROXY`. Documented in `README.md`. `.env.example` has placeholders for `JWT_SECRET` and `JWT_EXPIRES_IN` only. **Add `JWT_SECRET` to your own `.env`** (it was not edited).

## 8. How to run

```
npm install
createdb ask_dojo
psql -d ask_dojo -f database/db.sql
psql -d ask_dojo -f database/seed.sql
# .env: DB_*, JWT_SECRET, and APP_FAKE_TODAY=2026-11-06 to match the seed
npm start        # http://localhost:3000
```

Demo password for every seeded account: `password123` (student `ASK-2025-1834`, instructor `INS-0042`, Business Admin `ADM-001`, front desk `ADM-101`).

## 9. Git-ignore status of package files

`package.json` and `package-lock.json` are **not** git-ignored (`git check-ignore` exits 1; `.gitignore` only lists `node_modules/` and `.env`). They show as untracked and should be committed. `.gitignore` was not touched.

## 10. Verification (all run, final run)

`node .be-tmp/verify/run-all.mjs` starts PGlite over a socket, resets the database for each suite, runs every suite against its own app instance, then runs static checks.

| Suite | Checks |
| --- | --- |
| api-auth | 68/68 |
| api-public | 40/40 |
| api-student | 115/115 in the final run (118/118 earlier; 3 cancel-window fixtures skip themselves within 2 h of midnight Singapore time) |
| api-instructor | 98/98 |
| api-admin-desk | 273/273 |
| api-admin-business | 313/313 |
| api-sqli | 92/92 |
| browser-login (4 sign-ins, guards, every page of every portal at 1280 and 390, zero console errors) | 162/162 |
| browser-student | 67/67 |
| browser-instructor | 60/60 |
| browser-admin-desk | 145/145 |
| browser-admin-business | 118/118 |

Static checks: no `SEED(`, `save(`, `DB_KEY`, `demoOn`, `simulateTaps`, `ask-role`, `ask-admin`, `ask-last-id`, `ask-prototype`, `sessionStorage` in `src/public`; `localStorage` only for `ask-rail`, `ask-home-view`, `ask-sound`; no SQL outside `src/models`; `qr_token` and `password_hash` not handled in controllers, routes, middleware or validators; production start without `JWT_SECRET` fails.
`npm ci && npm test -- --runInBand` exits 0 (placeholder test, no framework). Screens for all four portals are in `.be-tmp/screens/` (the browser suites overwrite them on each run).

Hardening done in this step: removed `SEED()`, `fallbackExtras`, the `save()` stub, `fallbackSeed`, the "Reset prototype data" footer link, unused data.js helpers and dead admin-shell helpers; admin badge and bell counts now come only from the server; CSP `script-src-attr` is now `'none'` (image fallbacks use `data-fallback`, handled in `core.js`).
Harness fixes in this step: two suites were made clock-tolerant (the fake date is 6 Nov but the clock is real, so a 19:00 seed class is over after 20:00 Singapore time); the browser helper no longer counts `net::ERR_ABORTED` (requests the browser cancels when the Business Admin page guard redirects the front desk) as failures, while HTTP errors are still counted; the redirect checks now wait for the target page to finish loading. The final `run-all.mjs` exited 0 with 1551/1551 suite checks and 5/5 static checks. PGlite and every app process were stopped afterwards.

Git: nothing staged, HEAD unchanged, `.env`, `.gitignore`, `prompts/` untouched, no `.agents/`. A secret scan of new and changed files found no secret value; the only match is the clearly named development fallback prefix in `src/config/index.js`.

Process slips to disclose: in FEAT-003 one new service file (`instructorService.js`) and in FEAT-004 one new file (`admin-data-desk.js`) were edited through a PowerShell string replace. Both were new files of this task, and all other edits used the edit tools.

## 11. Decisions to confirm

1. ~~New students (public join form) get no password.~~ **Resolved in round 2 (2026-11-18), user decision:** members create their own password during registration (join form and desk register); activation uses that bcrypt hash and returns no temporary password. Staff accounts created or reset by a Business Admin still get a one-time temporary password and must change it at first sign-in (`must_change_password`).
2. ~~Grading notes written by instructors are visible to the student.~~ **Resolved in round 2 (2026-11-18), user decision:** grading notes are hidden from students (`remarkModel.forStudent` never selects `kind = 'grading'`); instructors and examiners still see them.
3. A grading result of Retake is stored as a failed grade attempt with no promotion.
4. Guest pass columns (`pass_type` values, `amount_paid`) and the `class_feedback_prompt` table were added.
5. Level-ups on the student home are derived (attended in the last 24 hours, promotions in the last 7 days), so they reappear on reload for that period.
6. Promotion approval is done by the Business Admin on the Grading page.
7. Interventions on Insights are stored as one JSON `policy_setting` value; none exist until a BA logs one.
8. Student grading sessions count is derived from accumulated hours. **Resolved in round 2 (2026-11-18), user decision "show 29":** the seed now has Lervyn at 29 accumulated / 56 total hours, so the portal shows 29 / 36 like the prototype.
9. A BA booking override also bypasses a full class.
10. The timetable form has no "effective from/until" because the table has no such columns.
11. The student profile name is read-only and the "Emergency mobile" field was removed (one `emergency_contact` column).
12. `join.html` still shows a mock email verification code step ("the code is 123456") that is not checked by the server.

## 12. Deferred

QR and location check-in (check-in page and scanner stay an in-memory mock; no endpoint; `dojo.qr_token` unused), a real payment gateway, email and SMS sending, the CSV import pipeline, file uploads (only file names are kept), real-time updates, student photos, Google sign-in, a self-service forgot-password flow, and unit tests (the test script is a placeholder). Payments stay a mock (no Stripe, no real email).

Updated 2026-11-18: round 2 resolved two items that were listed here: the **audit log** (append-only `audit_log`, Business Admin Audit log page with filters and CSV export) and **change password** for signed-in users (student, instructor and office portals, plus the forced change for temporary passwords).
