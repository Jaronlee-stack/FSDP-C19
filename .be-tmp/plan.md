# ASK backend + front-end rewire: implementation plan

Repo: `c:\Users\CedrikHwang\FSDP-C19`, branch `database-integration`. Read `.be-tmp/task.md` first (authoritative). The planner explored: `database/db.sql` (38 tables + view `v_grading_conflict`), `database/seed.sql`, `.db-tmp/report.md` + `report2.md`, `src/public/js/{core,data,store,portal,ben}.js`, `student_portal/{student,login}.js`, `instructor_portal/instructor.js`, `admin_portal/{admin,admin-desk,admin-members,admin-business,admin-shell,staff-login}.js`, `landingpage/js/*.js`, every page's `<script>` list, `.github/workflows/test.yml`.

Facts that shape the plan:
- Repo has no `package.json`; `app.js` is 0 bytes; `.gitignore` ignores only `node_modules/` and `.env` (so `package.json` and `package-lock.json` are NOT ignored; report this, do not edit `.gitignore`).
- CI (`.github/workflows/test.yml`, Node 25, Windows) runs `npm ci` then `npm test -- --runInBand`. The `test` script must ignore `--runInBand` and exit 0.
- `.env.example` has PORT, NODE_ENV, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD. Add only `JWT_SECRET` and `JWT_EXPIRES_IN` there (placeholders). Optional vars (`APP_FAKE_TODAY`, `APP_TZ`, `DB_POOL_MAX`, `DB_SSL`) are documented in README only.
- Node v24.15 and npm 11 are installed. Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (no Chrome). `%TEMP%\askdb` already holds `@electric-sql/pglite` + `bcryptjs`; `%TEMP%\askpw` holds `playwright-core`. `.db-tmp/browser-check.mjs` and `.db-tmp/serve.mjs` are working patterns for the browser run (launch Edge with `executablePath`, import playwright from `%TEMP%`).
- Today every page loads `core.js, data.js, store.js, [ben.js], portal.js, <page>.js` synchronously. `TODAY` is `const TODAY = startOfDay(new Date())` in `core.js`. `store.js` builds `DB = SEED()` merged with localStorage (`ask-prototype-v4`), auth is `sessionStorage` (`ask-role`, `ask-admin`). `portal.js` evaluates `ALLOWED`, `ADM_BLOCKED`, `GATED`, `P.me` at load. `save()` is called ~90 times across page scripts. No page uses `fetch` yet.
- Front-end aliases such as `const MY_PASSES = DB.passes` hold array references. Filling must therefore mutate in place (`arr.length = 0; arr.push(...)`), never reassign.

---------------------------------------------------------------------
## 1. Decisions (one or two sentences each)

D1. **API prefix `/api/v1`.** Versioned from day one; one constant `API_PREFIX` in `src/config/index.js`. Static front end stays at `/` (`src/public`), root `/` redirects (302) to `/landingpage/index.html`.

D2. **Server returns clean camelCase JSON; the front end adapts it to the legacy `DB` shapes.** The brief prefers minimal render changes. Adapters live in per-portal data modules (`student-data.js`, `instructor-data.js`, `admin-data.js`, `landingpage/js/public-data.js`) which expose `ASK.load.<name>()` (GET and fill DB slices in place) and `ASK.act.<name>()` (write, then reload the affected slice). Render functions stay; sync mutators that did `x.status = ...; save()` become `async` calls to `ASK.act`.

D3. **Boot loader instead of sync XHR.** Each HTML page keeps its markup but its script block becomes `core.js` + `api.js` with a `data-then="..."` list. `api.js` loads `GET /api/v1/reference` (public: server `today`/`now`, dojos, belts, packages, public policies, HQ + other-dojo timetable templates, instructors, grading fees) and, on portal pages, `GET /api/v1/auth/me`. Then it injects the remaining scripts in order (`async=false`). So `portal.js`, `store.js` and page scripts still run synchronously with data already present. `body.ok` gating in `portal.js` stays. No synchronous XHR (avoids deprecation warnings in the zero-console-error run).

D4. **Server date.** `src/utils/clock.js` exports `now()`, `today()` (ISO `YYYY-MM-DD`), `addDays`, `diffHours`, all in `APP_TZ` (default `Asia/Singapore`). If `NODE_ENV !== 'production'` and `APP_FAKE_TODAY=YYYY-MM-DD` is set, `now()` = that date + the real wall-clock time of day in `APP_TZ` (so time-window rules still work); in production the variable is ignored and a warning is logged at startup if set. SQL for business rules receives `$n` values from `clock` (no `CURRENT_DATE`/`now()` in rule queries; inserts pass explicit timestamps) so fake dates stay consistent with CHECK constraints. `GET /api/v1/meta` and `/reference` return `{ today, now, tz, fakeToday: bool }`. `api.js` sets `TODAY` (changed to `let` in `core.js`) from `meta.today` as a local-midnight Date, and keeps `ASK.skewMs = Date.parse(meta.now) - Date.now()`. `core.js` gets `const NOW = () => new Date(Date.now() + ASK.skewMs)`; every business-time use of `new Date()` / `Date.now()` in page scripts is replaced by `NOW()` (counts: student.js 17, admin-desk 11, admin-members 12, instructor 5, join 5, trial 2, portal 1, data 2, others 1).

D5. **Auth.** `POST /auth/login` verifies bcryptjs against `users.password_hash`, sets httpOnly cookie `ask_token` (JWT HS256, payload `{sub, role}`), `SameSite=Lax`, `Secure` only in production, `maxAge` from `JWT_EXPIRES_IN` (default `8h`). The `auth` middleware re-reads the user and role profile from the DB on every request (so deactivation and role changes apply at once) and attaches `req.user = { id, role, adminType, name, memberNo, dojoId }`. Login is per portal: `portal` in body decides the allowed role (`student`, `instructor`, `admin`); identifier = member no or email (student), `INS-xxxx` or email (instructor), `ADM-xxx` or email (admin). Failures use one generic 401 `INVALID_CREDENTIALS`; unknown users still run a dummy bcrypt compare. Inactive staff (`staff_profile.status='inactive'`) or `membership.account_status='Deactivated'` get 403 `ACCOUNT_DEACTIVATED` only after the password verified. Guests (`role='guest'`) cannot sign in. `users.last_login_at` is set from `clock.now()`. Login rate limit via `express-rate-limit` (10 per 15 min per IP, env-tunable, skipped nothing). CSRF: SameSite=Lax plus every non-GET/HEAD request must be `Content-Type: application/json` (middleware `requireJson` returns 415 `JSON_REQUIRED`); `api.js` always sends a JSON body (`{}` default), including DELETE.

D6. **Layering.** `routes` (path + middleware + controller binding only) → `controllers` (parse/validate via zod schemas, call a service or model, shape the response) → `services` (business rules, transactions, multi-model orchestration) → `models` (ALL SQL, parameterised only, one file per table group). Models take an optional executor `db` (pool or tx client). Transactions use `withTx(async tx => ...)` from `src/config/db.js`; inside a transaction every query must use `tx`, never the pool (pool max can be 1 under PGlite).

D7. **Validation: `zod` (v3).** One schema per endpoint in `src/validators/<area>.js`, `.strict()` objects (whitelist), coerced string lengths, enum lists copied from the db.sql CHECKs. Middleware `validate({ body, query, params })` writes parsed values to `req.valid`.

D8. **Errors.** `AppError(status, code, message, details?)` + `asyncHandler`. Error middleware returns `{ error: { code, message } }` (plus `details` for validation, 400 `VALIDATION_ERROR`). Unknown errors → 500 `INTERNAL` with a generic message and no stack in production; unknown `/api/*` → 404 `NOT_FOUND`. DB constraint errors map: 23505 → 409 `CONFLICT`, 23503 → 409 `REFERENCE`, 23514 → 400 `CONSTRAINT`.

D9. **pg type parsers (in `config/db.js`).** DATE (1082) → string `YYYY-MM-DD` (avoids timezone shifts); NUMERIC (1700) → float; INT8 (20) → int. TIME stays a string and serialisers cut to `HH:MM`. TIMESTAMPTZ → `Date` → ISO in JSON.

D10. **IDs.** Readable ids matching the seed (`L-1001`, `R-04`, `X-05`, `E-05`, `F-04`, `APP-07`, `GA-14`, `MC-03`, `INV-…`): `models/ids.js` `nextId(tx, table, column, prefix, width)` takes `pg_advisory_xact_lock(hashtext(table))` and returns max+1. Lesson ids keep the seed format `LS-YYYYMMDD-HHMM-<DOJOCODE>-<mat letter>`.

D11. **Schema changes: additive only, listed in the final report.** (a) `class_waitlist(lesson_id, user_id, created_at, PK(lesson_id,user_id))` for the roster waitlist; (b) `class_attendance.booked_via VARCHAR(20) NOT NULL DEFAULT 'online' CHECK IN ('online','desk','walk-in','waitlist')` for the roster "how" column; (c) widen `grading_candidate.result` CHECK to include `'Retake'` (the instructor rubric has Pass/Retake/Fail; `grading_history.grade=false` for Retake); (d) `guest_pass.pass_type` CHECK widened to `('trial','single','day','week','month','private')` and `guest_pass.amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0` (trial.js sells single, private and overseas month passes; guests have no `student_profile`, so `payment` cannot hold them); (e) `class_feedback_prompt(lesson_id, user_id, state 'rated'|'skipped', created_at, PK(lesson_id,user_id))` so the rating pop-up knows what the student already answered without storing identity in `class_feedback` (the feedback row gets `created_at` truncated to the day and no link). All five are inside `db.sql` as `CREATE TABLE` / modified definitions of the same re-runnable file (add to the DROP list too); seed unaffected (new columns default). `seed.sql` is only touched if a verification run proves a need.

D12. **Student check-in (QR) stays mock and in-memory.** `student.js` `handleDojoScan`, `openCheckIn`, `todaysBooking`, `checkin.html` keep working on the in-memory `BOOKINGS`/`ATTENDANCE` arrays that the data module fills; they must not call `save()` or touch storage. No endpoint, no `check_in` writes. Listed under Deferred.

D13. **UI-only preferences may stay in localStorage** (`ask-rail`, `ask-home-view`, `ask-sound`) and notification "seen" dot moves to a page-memory variable. The verification asserts there is no `ask-prototype*` / `ask-role` / `ask-admin` / `ask-last-id` key and no business data in either storage.

D14. **Google sign-in button** on student login (currently signs anyone in) is neutralised: shows a toast "Google sign-in is not available yet". **Forgot password** keeps its modal and calls `POST /auth/forgot-password` (always 202, writes nothing).

D15. **New student passwords.** The join form has no password. On activation (auto or manual) the server creates `users` with a random temporary password and returns it once in the activation response to the admin (and the join "done" screen only says the account will be activated); `sent_log` gets a mock "welcome" row. Student then signs in with member no + temp password. Confirm with the user (listed in report).

D16. **Staff create** returns a one-time temp password too; **reset password** (`POST /admin/staff/:id/reset-password`) sets a new random one and returns it once (mock "link sent" toast kept, plus the temp value shown in the drawer). BA only.

D17. **Roles on the server.** `requireRole('student')`, `requireRole('instructor')`, `requireRole('admin')`, and `requireAdminType('business')`. Business-only list is derived from `portal.js` `ADMIN_PAGES` flag `true`: insights, revenue, grading, reports, policies, staff, imports. Business-only actions inside shared pages (from admin-desk/members/business): void/adjust payment, approve/decline refund, approve/decline exceptions, BA override of a full class, belt change, member CSV export, create/assign follow-ups, wider notification audience, timetable CRUD, closures, staff management, policy edits. The front desk gets 403 `BUSINESS_ADMIN_ONLY`.

D18. **Remark/attendance windows (server rules).** A class is `later` before `start - 30 min` (no attendance, no remarks: 409 `CLASS_NOT_OPEN`), `open`/`live` from `start - 30 min`, `done` once `ended_at` is set or `now >= start + 1 h`. Remarks are allowed once open and stay editable after (kind class/student). Attendance changes are blocked after End class. Grading examiner access: `start - 15 min <= now <= end` of the `grading_session` (409 `GRADING_NOT_OPEN` otherwise; candidate names only inside the window, counts outside).

D19. **Hours credit.** Marking `Attended` is idempotent: it credits `+duration hours` (class end minus start, normally 1.0) to `total_accumulated_hours` and `accumulated_hours`, and also `weapon_hours` when `class_type='Weapons'`, only on the transition into `Attended` (never twice, never on re-marking). Marking `No-Show` credits nothing and the lesson stays used. A student with a lesson credit refund path: cancel on time returns the credit; late cancel and no-show do not. Reverting `Attended` is not allowed (409). Admin-desk roster submit and the instructor End-class use the same `attendanceService.mark()`; `marked_by` is set only for instructors (FK is to `instructor_profile`), admin marks leave it NULL and keep the reason in `class_attendance.remarks` (corrections, prefixed `Correction by ADM-xxx: <reason>`).

D20. **Package rules (service `packageService`).** Price from `package_def` only (never from the client); audience must match `student_profile.age_group`; max `policy_setting.max_packages` (2) Active, not-expired packages (unlimited counts); `expires_at` = `purchased_at + valid_months` or `+ valid_days` (`expiryFor`); a status sweep (`Active`→`Used up` when `lessons_left=0`, `→Expired` when `expires_at < today`) runs inside list/buy/book transactions. Buy = insert `student_package` + `payment` (kind `Package`, channel `online`, method from allowed list, status `Paid`, `paid_at = now`). Credit pick: Active pack with `lessons_left>0` (or unlimited) valid on the class date, earliest expiry first. Unlimited ignores `lessons_left`. Cancel on time (`hours >= cancel_hours`) returns 1 lesson (and reactivates a `Used up` pack that is not expired); late cancel does not.

D21. **Booking rules (service `bookingService`, constants in `src/services/classRules.js`).** Online booking only for HQ, non-private, non-cancelled sessions whose template (if any) has `online_bookable`; not on a closure day; session date between `today + booking_min_days` and `today + booking_ahead_months`; capacity counts rows in (`Booked`,`Attended`,`No-Show`); no duplicate or time-overlapping booking; membership `Active`; at least one valid credit. `kids_only` classes need `age_group='Child'`; Children may also take `Mixed`; Adults cannot take kids classes. `Ladies` needs `gender='Female'`; `SG50` needs age >= 50 on the class date; `Intermediate` needs `belt_rank.sort_order >= 3` (4th Kyu and above); `Advanced` needs `sort_order >= 6` (1st Kyu and above). Errors: 409 `CLASS_FULL`, 403 `NOT_ELIGIBLE` (with the `whyNot` text), 409 `NO_CREDIT`, 409 `ALREADY_BOOKED`, 409 `TOO_LATE`/`TOO_EARLY`, 409 `CLASS_CLOSED`. The same service powers desk booking (admin roster) with `source='desk'` and an override flag (BA only, reason required).

D22. **Grading rules (service `gradingService`).** `needSessions` by current rank: 6k 24, 5k 30, 4k 36, 3k 36, 2k 48, 1k 60 (from `SEED().students.need`); `needMonths` 6 in rank (from `GRADE`), member >= 3 months (`joined_on`), fees paid. Sessions counted = attended rows since `last_passed_grading_date` (FEAT-002 must confirm Lervyn = 29 of 36 against the seed; if the seed derivation differs, read `.db-tmp/agree.mjs` and record the chosen derivation in FEAT findings). Fee = `belt_rank.grading_fee` of the TARGET rank plus `grading_late_fee` when `today > grading_session.application_close_date`. Apply = `grading_application` (Submitted) + `payment` (Grading fee, Paid, mock) in one tx; BA approves/rejects the application; examiners submit results; result computed on the server from per-criterion band scores using the same rubric constants as `instructor.js` (copy `EXAM_BANDS/EXAM_RUBRIC/EXAM_PASS_PCT 0.7/EXAM_RETAKE_PCT 0.5` into `services/gradingRules.js`); Pass sets `promotion_status='Pending approval'`, inserts `grading_history`, sets `last_grading_date`; BA "promote" sets `Promoted`, `rank_id = to_rank_id`, `last_passed_grading_date`, resets `accumulated_hours`/`weapon_hours` to 0 (CHECK `weapon <= accumulated <= total`), and sets the student's `membership` untouched; "decline" sets `Declined`. Grading session never created from a class and always `dojo_id='hq'`.

D23. **Student home remarks.** Return `instructor_remark` kinds `class` (for classes the student attended), `student` (about them) and `grading` (about them), newest first, as `remarksForStudent` does today. Level-ups: attended rows marked within the last day plus promotions within 7 days (derived, no "seen" table). Rating queue: attended classes in the last 7 days with no `class_feedback_prompt` row.

D24. **CSV export (BA).** `GET /admin/members/export.csv` and report CSVs return `text/csv` with `Content-Disposition`, with CSV-injection protection (cells starting `= + - @` are prefixed with `'`).

D25. **CSP via helmet** configured explicitly (not defaults, which would block the app): `default-src 'self'`; `script-src 'self'` (add `'unsafe-inline'` only if an inline `<script>` exists: grep first); `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src https://fonts.gstatic.com`; `img-src 'self' data: blob: https://aikidoshinjukai.com.sg`; `frame-src https://www.youtube.com https://www.youtube-nocookie.com`; `connect-src 'self'`. Tune until the browser run shows zero CSP console errors. External logo/font hosts may be unreachable offline; the browser check ignores those (same as `.db-tmp/browser-check.mjs`).

---------------------------------------------------------------------
## 2. Backend layout

```
app.js                      entry: dotenv, create app, listen (exports app for tests)
package.json                scripts: start, dev, test
scripts/placeholder-test.js "test" target; prints a note, exits 0 (accepts --runInBand)
src/config/index.js         env parsing, JWT_SECRET fail-fast in production, API_PREFIX, APP_TZ, FAKE_TODAY guard
src/config/db.js            pg Pool (DB_POOL_MAX default 10, DB_SSL optional), type parsers, query(), withTx()
src/utils/clock.js          now(), today(), ymd helpers (APP_TZ aware, fake-today guarded)
src/utils/errors.js         AppError, asyncHandler
src/utils/csv.js            safe CSV writer
src/utils/password.js       hash/compare (bcryptjs), randomPassword()
src/middleware/             auth.js (cookie JWT, loads user), roles.js, validate.js, requireJson.js,
                            error.js (errorHandler + notFound), rateLimit.js, security.js (helmet+CSP)
src/validators/             auth.js, public.js, student.js, instructor.js, admin.js
src/routes/index.js         mounts under /api/v1: meta, auth, public, student, instructor, admin/*
src/routes/{meta,auth,public,student,instructor}.routes.js
src/routes/admin/{index,desk,members,finance,business,grading,staff}.routes.js
src/controllers/            one file per router area (thin)
src/services/               classRules, bookingService, packageService, attendanceService, gradingService,
                            gradingRules, registrationService, paymentService, closureService, reportService,
                            staffService, notificationService
src/models/                 userModel, studentModel, instructorModel, staffModel, referenceModel (dojo, belt_rank,
                            package_def, policy), packageModel, paymentModel, refundModel, exceptionModel,
                            equipmentModel, templateModel, sessionModel, attendanceModel, waitlistModel,
                            closureModel, feedbackModel, remarkModel, gradingModel, applicationModel (registration),
                            guestModel, mcModel, followupModel, notificationModel, importModel, policyModel,
                            reportModel (aggregate SQL), ids.js
src/public/                 existing front end (+ api.js, data modules)
```

Mount order in `app.js`: `helmet` → `cookie-parser` → `express.json({limit:'100kb'})` → `/api/v1` router (with `requireJson` on mutating methods) → API 404 → `express.static('src/public')` → `GET /` redirect → error handler. `trust proxy` configurable via env only if set.

---------------------------------------------------------------------
## 3. Endpoint catalogue

Legend: role `P` public, `A` any signed-in, `S` student, `I` instructor, `FD` any admin (front desk or Business Admin), `BA` Business Admin only. All paths relative to `/api/v1`. Mutating routes need JSON content type. Student routes use `req.user.id` only (never an id from the client): ownership by construction. Instructor routes check `class_session.instructor_id = req.user.id` or `grading_examiner`. Responses are JSON; errors `{ error: { code, message } }`. "Tables" lists the main tables touched.

### 3.1 Meta, reference, auth

| Method | Path | Role | Request | Response | Tables | Source |
|---|---|---|---|---|---|---|
| GET | /meta | P | - | `{ today, now, tz, fakeToday }` | - | all pages (boot) |
| GET | /reference | P | - | `{ today, now, tz, dojos[{id,name,short,code,region,addr,status}], belts[{id,g,c,order,fee}], packages{adult[],kids[]} (PKG shape fields: id,t,name,amt,unit,d,per,lessons|null,days,months,valid,best,compassion), policies{registration,annualDues,discounts,booking{aheadMonths,minDays,cancelHours,maxPackages},compassionDays,lateFee}, instructors[{id,name,dan,photo,chief}], timetable{hq[], other[]} (template rows: id,code,dojo,day,time,end,mat,type,ins,cap,kids,online) }` (no `qr_token`, no private lessons) | dojo, belt_rank, package_def, policy_setting, class_template, instructor_profile | boot of every page |
| POST | /auth/login | P (rate limited) | `{ portal:'student'\|'instructor'\|'admin', identifier, password }` | `{ user:{id,role,name,adminType,memberNo?} }` + cookie | users, student_profile, instructor_profile, staff_profile, membership | login.html, signin.html |
| POST | /auth/logout | A | `{}` | `{ ok:true }` clears cookie | - | portal rail logout |
| GET | /auth/me | A | - | `{ id, role, adminType, name, memberNo, rank, dojoId, group, gender, age, label }` (401 `UNAUTHENTICATED` if none) | users + profiles | portal.js guard |
| POST | /auth/forgot-password | P | `{ identifier }` | 202 `{ ok:true }` | - | login.html |

### 3.2 Public / landing

| Method | Path | Role | Request | Response | Tables | Source |
|---|---|---|---|---|---|---|
| GET | /public/dojos | P | - | dojos[] | dojo | dojos.html, dojo.html, index |
| GET | /public/classes | P | `?dojo=` | non-private template rows with instructor name | class_template, instructor_profile | classes.html, class.html, class.js |
| GET | /public/sessions | P | `?date=YYYY-MM-DD` (today..+30d) | HQ bookable sessions: `{lessonId,time,end,type,ins,cap,left,kids}` | class_session, class_attendance, class_closure | trial.js `sessionsFor` |
| GET | /public/packages | P | - | packages + fees (same as reference.packages/policies) | package_def, policy_setting | fees.html, join.js |
| POST | /public/trial-bookings | P (rate limited) | `{ name, mobile, email, passId:'trial'\|'single'\|'day'\|'week'\|'month'\|'private', overseas, who:'Adult'\|'Child', date, lessonId?, time?, waiverSigner }` (server re-derives price and validates class suitability: trial blocks Intermediate/Advanced/Weapons) | `{ reference, guestId, passId, amount, lessonId? }` | users(role guest), guest_profile, guest_pass, class_attendance (booked_via 'walk-in'? no: 'online') | trial.js |
| POST | /public/registrations | P (rate limited) | join form: `{ name, dojoId, group, age, gender, nationality, phone, email, emergencyContact, priorExperience, previousMember, medical, dogi{choice,size}, packageId, signer, signatureProvided, dob? }` (fees recomputed server side: registration + package + dues + discounts) | `{ applicationId, memberNo, status, activated, total }` | registration_application, application_checklist, auto_activation_rule, (on auto-activate) users, student_profile, membership, student_package, payment, equipment_order | join.js `completeRegistration` |

Auto-activation (`registrationService`): checklist rows for every `auto_activation_rule` (enabled): `details` (all required fields present), `consent` (signature + signer), `paid` (amount_paid >= fee), `medical` (declaration answered, null = "No"), `guardian` (children: signer is guardian). If every enabled rule is done, status `Approved` and the account is created in the same tx (member no `ASK-<year>-<4 digits unique>`; `joined_on = today`; membership `Active`, expiry = today + 1 year; package row; payments Registration/Annual dues/Package/Dogi). Otherwise `Submitted` and the desk finishes it (FD `PATCH /admin/applications/:id/checklist` then `POST .../activate`, which re-checks the rules and returns 409 `RULES_NOT_MET`).

### 3.3 Student (role S)

| Method | Path | Request | Response | Tables | Source |
|---|---|---|---|---|---|
| GET | /student/home | - | `{ profile{name,memberNo,rank,rankId,dojoId,group,gender,age,joinedOn,hours{total,accumulated,weapon}}, packages[], unlimited, credits, upcoming[bookings], lastAttendance[], nextBelt{target,sessions,needSessions,monthsInRank,needMonths,date,close}, remarks[], rateQueue[], levelUps[], notices }` | student_profile, membership, student_package, class_attendance, class_session, instructor_remark, grading_session, class_feedback_prompt | index.html (home) |
| GET | /student/profile | - | profile + membership `{status, expiry, lastRenewedAt}` + emergency/guardian/medical + email | student_profile, membership, users | profile.html |
| PATCH | /student/profile | `{ contactNo?, email?, emergencyContact?, medicalNotes?, guardianName?, guardianContact? }` (whitelist; no name/rank/hours) | updated profile | student_profile, users | profile.html |
| GET | /student/packages | - | `{ defs(audience filtered), mine[{id,name,total,left,bought,expires,status}], unlimited:{until}\|null, maxPackages, mcRequests[] }` | package_def, student_package, mc_request | packages.html, home |
| POST | /student/packages | `{ packageId, method:'Stripe'\|'PayNow'\|'Visa' }` | `{ package, payment }` (409 `PACKAGE_LIMIT`) | student_package, payment | packages.html `openBuy` |
| POST | /student/packages/:id/extension-requests | `{ kind:'MC'\|'Compassion', days, documentRef? }` (Compassion only for `compassion_eligible` packs, <= 14 days; MC needs a document name) | mc_request | mc_request | packages.html `initMC` |
| GET | /student/timetable | `?weekStart=YYYY-MM-DD` | `{ weekStart, sessions[{lessonId,date,time,end,type,ins,cap,booked,left,kids,state:'open'\|'full'\|'booked'\|'blocked'\|'closed'\|'past',whyNot,closure}] , policies{aheadMonths,minDays,cancelHours} }` | class_session, class_template, class_attendance, class_closure | book.html |
| POST | /student/bookings | `{ lessonId }` | `{ booking, package{id,left} }` | class_attendance, student_package | book.html `openBooking` |
| DELETE | /student/bookings/:lessonId | `{}` | `{ refunded:boolean, package }` | class_attendance, student_package | home/book `confirmCancel` |
| GET | /student/bookings | - | upcoming bookings | class_attendance, class_session | home, book |
| GET | /student/attendance | `?limit=` | history rows `{lessonId,date,time,type,ins,status}` | class_attendance, class_session | home |
| GET | /student/makeups | - | makeup_class rows | makeup_class | home notices |
| GET | /student/payments | - | `[{ id, invoiceNo, item, date, method, amount, status }]` | payment | payments.html |
| GET | /student/payments/:id | - | one payment (receipt PDF still built client-side) | payment | payments.html |
| GET | /student/grading | - | `{ target, targetLabel, checks[{label,value,met}], eligible, session{id,date,close,label}\|null, fee{lines[],total}, application\|null, history[], feedback[{from,to,date,by,result,well,next,status}] }` | belt_rank, grading_session, grading_application, grading_candidate, grading_history | grading.html |
| POST | /student/grading/applications | `{ sessionId }` (eligibility enforced: 403 `NOT_ELIGIBLE`; one open application) | `{ application, payment, fee }` | grading_application, payment | grading.html `initGradingApp` |
| DELETE | /student/grading/applications/:id | `{}` (own, status Submitted only) | `{ ok }` status `Withdrawn` | grading_application | grading.html |
| POST | /student/feedback | `{ lessonId, rating 1-5, tags[], note?, skipped? }` (must have attended that lesson; one per lesson) | `{ ok }` (anonymous: `class_feedback` row has no user, `created_at` truncated to the day; `class_feedback_prompt` records only that this student answered) | class_feedback, class_feedback_prompt | student.js `openRating` |
| GET | /student/remarks | - | included in /student/home; separate for the profile page | instructor_remark | home |

### 3.4 Instructor (role I)

| Method | Path | Request | Response | Tables | Source |
|---|---|---|---|---|---|
| GET | /instructor/profile | - | `{ name, id, dan, photo, chief, stats{classes,students}, feedback{avg,count,distribution,tags,recent[]} }` (anonymous, no student ids) | instructor_profile, class_feedback | profile.html |
| GET | /instructor/schedule | `?from=&to=` (<= 62 days) | `{ sessions[{lessonId,date,time,end,mat,type,dojoId,booked,cap,state,private,studentName?,ended}], grading[{id,label,date,from,to,lead,examiners[],candidateCount,left,state,locked}], closures[] }` | class_session, class_template, class_attendance, class_closure, grading_session, grading_examiner, grading_candidate | instructor index.html |
| GET | /instructor/sessions/:lessonId | - | roster `{ session, rows[{userId,name,memberNo,rank,photo,seen,status,remark,goingForGrading,gradingNote}], classRemark, state }` (own class only: 403 `NOT_YOUR_CLASS`) | class_attendance, student_profile, instructor_remark | roster card |
| PUT | /instructor/sessions/:lessonId/attendance/:userId | `{ status:'Attended'\|'No-Show'\|'Booked' }` (409 `CLASS_NOT_OPEN`, 409 `CLASS_ENDED`, 409 `ALREADY_COUNTED`) | `{ status, hours }` | class_attendance, student_profile | roster tick |
| POST | /instructor/sessions/:lessonId/end | `{ present:[userId], noShow:[userId] }` | `{ present, noShow, ended_at }` (marks listed users through `attendanceService`, remaining Booked rows → No-Show; 409 if already ended) | class_session, class_attendance, student_profile | `endClassFlow` |
| PUT | /instructor/sessions/:lessonId/remarks | `{ kind:'class'\|'student', studentId?, body }` (empty body deletes; 409 `CLASS_NOT_OPEN` for a later class) | remark \| `{deleted:true}` | instructor_remark | roster remarks |
| PUT | /instructor/students/:userId/grading-note | `{ lessonId?, body }` (student must be in a grading application or candidate list) | remark | instructor_remark, grading_application, grading_candidate | `remarkSection` |
| GET | /instructor/students | - | students who booked or attended this instructor's classes `{userId,name,rank,seen,hours,status,goingForGrading}` | student_profile, class_attendance | students list, declining notice |
| GET | /instructor/grading | - | active/upcoming panels where I am an examiner `{ session, window{opensAt,start,end,state}, candidates[]? (only inside window), counts }` | grading_session, grading_examiner, grading_candidate | grading.html, schedule block |
| GET | /instructor/grading/sessions/:id/candidates | - | candidates `{userId,name,from,to,done,result,score}` (403 `NOT_EXAMINER`, 409 `GRADING_NOT_OPEN`) | grading_candidate, student_profile | grading.html |
| POST | /instructor/grading/sessions/:id/candidates/:userId/result | `{ scores:{criterionKey:0-3}, well, toImprove, signature }` (server computes total and result; one result per candidate, 409 `ALREADY_SCORED`) | `{ result, score, promotion:'Pending approval'\|'n/a' }` | grading_candidate, grading_history, student_profile | `submitResult` |

### 3.5 Admin: desk (FD unless stated)

| Method | Path | Role | Request | Response | Tables | Source |
|---|---|---|---|---|---|---|
| GET | /admin/today | FD | - | `{ classes[], counts, paymentsToday, pendingRefunds?, applicationsWaiting, equipmentToCollect, followupsDue, mcPending }` (FD gets desk figures; BA gets the same plus exception count) | class_session, class_attendance, payment, registration_application, equipment_order, followup, mc_request | dashboard |
| GET | /admin/rosters | FD | `?date=` | HQ + other dojo sessions that day with booked/capacity/ended/closure | class_session, class_attendance, class_closure | sessions.html |
| GET | /admin/rosters/:lessonId | FD | - | `{ session, rows[{userId,memberNo,name,rank,how,status}], waitlist[], corrections[], submitted }` | class_attendance, class_waitlist, student_profile, guest_profile | roster.html |
| POST | /admin/rosters/:lessonId/bookings | FD | `{ memberNo, override?:true, reason? }` (rules from D21; full/ineligible → 409/403; `override` + reason BA only; FD uses refer) | `{ row }` | class_attendance, student_package | `addBooking` |
| DELETE | /admin/rosters/:lessonId/bookings/:userId | FD | `{ refund:boolean, reason }` | `{ refunded }` | class_attendance, student_package | `cancelBooking` |
| POST | /admin/rosters/:lessonId/walk-ins | FD | `{ guestId }` (guest with unused/valid pass; trial pass is consumed) | row | guest_pass, class_attendance | `walkInModal` |
| POST | /admin/rosters/:lessonId/waitlist | FD | `{ memberNo }` / DELETE `/:userId`, POST `/:userId/offer` (books if a seat is free) | waitlist | class_waitlist | roster |
| PUT | /admin/rosters/:lessonId/attendance/:userId | FD | `{ status, reason? }` (correction after submit needs a reason) | row | class_attendance | `setAttendance` |
| POST | /admin/rosters/:lessonId/submit | FD | `{ rows:[{userId,status}] }` | `{ present, noShow }` (through `attendanceService`; no double counting) | class_attendance, class_session | `submitAttendance` |
| GET | /admin/guests | FD | - | guests with pass and used flags | guest_profile, guest_pass | walk-in picker |
| GET | /admin/members | FD | `?q=&status=&dojo=&rank=&source=&page=&pageSize=` (parameterised ILIKE, whitelist sort) | `{ rows[{no,name,rank,dojoId,hours,status,joined,joinedAt,source,kind,expiry,left,dues}], total }` | student_profile, membership, student_package | members.html |
| GET | /admin/members/:memberNo | FD | - | member record: profile, contact, medical, packages, payments, attendance, bookings, progress, equipment, followups | many | member.html |
| PATCH | /admin/members/:memberNo | FD (BA for `rank`) | `{ phone?, email?, emergencyContact?, guardianName?, guardianContact? }`; `{ rankId }` BA only (403 for FD) | updated | student_profile, users | member.html |
| GET | /admin/members/export.csv | BA | `?filters` | text/csv | student_profile, membership | members export |
| GET | /admin/payments | FD | `?q=&status=&from=&to=` | `{ ledger[{id,no,name,item,amt,method,date,st,by,inv,note}], refunds[], dailySummary{ date,paid,count,locked } , exceptions? }` | payment, refund_request, student_profile | payments.html |
| POST | /admin/payments | FD | `{ memberNo, item, kind, amount?, discount?, method:'Stripe' }` (mock take payment: price re-derived for packages/dues/registration/grading/dogi from policy; marks Paid; Package kind creates the student_package) | payment | payment, student_package, membership | `takePayment` |
| POST | /admin/payments/:id/void | BA | `{ reason, adjustTo? }` (`adjustTo` = corrected amount; else status `Voided`) | payment | payment | void/adjust modal |
| POST | /admin/payments/:id/mistake | FD | `{ reason }` | creates `exception_request` kind `mistake` | exception_request | report a mistake |
| POST | /admin/refunds | FD | `{ paymentId, reason }` | refund_request pending | refund_request | refund modal |
| POST | /admin/refunds/:id/decision | BA | `{ decision:'approved'\|'declined' }` (approve sets payment `Refunded`, frees credits if package) | refund_request, payment | payments revenue |
| POST | /admin/payments/day/lock | FD | `{ date }` daily summary lock: stored as `policy_setting` key `ledger_lock_YYYY-MM-DD`; after lock new payments for that date 409 `DAY_LOCKED` (BA may unlock via DELETE) | policy_setting, payment | daily summary |
| GET | /admin/equipment | FD | `?q=` | equipment[] | equipment_order | equipment.html |
| POST | /admin/equipment/:id/ready | FD | `{}` | order Ready at HQ | equipment_order | equipment |
| POST | /admin/equipment/:id/handover | FD | `{ collectedBy }` | order Handed over | equipment_order | `eqGo` |
| GET | /admin/applications | FD | `?status=` | `{ apps[], mcRequests[], exceptions[]? (BA only) }` | registration_application, application_checklist, mc_request, exception_request | applications.html |
| GET | /admin/applications/:id | FD | - | full application + checklist (register.html) | registration_application, application_checklist | register.html |
| PATCH | /admin/applications/:id/checklist | FD | `{ ruleId, done }` | checklist | application_checklist | register.html |
| POST | /admin/applications/:id/activate | FD | `{}` activates only when every enabled rule is done | `{ memberNo, tempPassword }` | users, student_profile, ... | register.html |
| POST | /admin/applications/:id/reject | FD | `{ note }` | app | registration_application | register |
| POST | /admin/mc-requests/:id/decision | FD | `{ decision, days? , reason? }` (FD approves `days <= 14`; longer → 409 `NEEDS_BUSINESS_ADMIN` and the UI files an exception; BA approves any; approve extends `student_package.expires_at` and sets `days_granted`; `excused` MC keeps the lesson) | mc_request, student_package | applications.html |
| POST | /admin/exceptions | FD | `{ kind, subjectName, memberNo?, detail }` | exception (pending) | exception_request | refer to BA |
| POST | /admin/exceptions/:id/decision | BA | `{ decision }` (kind `extension` links to the mc_request and applies it; `refund` links to a refund) | exception | exception_request | applications.html BA view |
| GET | /admin/followups | FD | - | followups with attempts and owner | followup, followup_attempt | followups.html |
| POST | /admin/followups | BA | `{ memberNo, kind, ownerId, dueDate }` | followup | followup | create |
| PATCH | /admin/followups/:id | BA | `{ ownerId?, dueDate?, status? }` | followup | followup | assign |
| POST | /admin/followups/:id/attempts | FD | `{ method, outcome, note }` | attempt | followup_attempt | log attempt |
| GET | /admin/notifications | FD | - | `{ templates[], sentLog[], audiences[] (FD: own HQ classes only; BA: also all members, a dojo, lapsed, etc.) }` | notification_template, sent_log | notify.html |
| POST | /admin/notifications/send | FD | `{ templateId?, title, body, audience }` (audience whitelist by role, 403 `AUDIENCE_NOT_ALLOWED`; writes `sent_log`) | sent row | sent_log | `nfInit` |

### 3.6 Admin: business (BA)

| Method | Path | Request | Response | Tables | Source |
|---|---|---|---|---|---|
| GET | /admin/overview | `?period=week\|month\|quarter` | KPIs (revenue, new members, active, lapsed, occupancy, collection), alerts, exceptions count | payment, student_profile, membership, class_session, class_attendance | dashboard `bzOverview` |
| GET | /admin/insights | `?tab=&from=&to=` | occupancy by slot, attendance trend, cohorts (monthly joiners/kept from `joined_on` + attendance), declining members, interventions | class_session, class_attendance, student_profile | insights.html |
| GET | /admin/revenue | `?from=&to=` | revenue by item/day, outstanding, failed, refunds | payment, refund_request | revenue.html |
| GET | /admin/reports | `?kind=` | report aggregates | many | reports.html |
| GET | /admin/reports/:kind.csv | - | text/csv | many | reports.html |
| GET | /admin/policies | - | `{ registration, annualDues, packages[], discounts, booking, autoActivation[], methods, templates, followTriggers }` | policy_setting, package_def, auto_activation_rule, notification_template | policies.html |
| PATCH | /admin/policies | `{ key:value ... }` whitelist of known keys with type validation | policies | policy_setting | policies.html |
| PATCH | /admin/policies/packages/:id | `{ price?, isActive? }` | package | package_def | policies |
| PATCH | /admin/policies/auto-activation/:id | `{ enabled }` | rule | auto_activation_rule | policies |
| POST/PATCH/DELETE | /admin/policies/templates[/:id] | `{ name, body }` | template | notification_template | policies |
| GET | /admin/staff | - | staff + instructors `{ id, name, type:'business'\|'frontdesk'\|'instructor', status, last }` | staff_profile, instructor_profile, users | staff.html |
| POST | /admin/staff | `{ name, type:'business'\|'frontdesk'\|'instructor', email, danGrade? }` (id generated `ADM-0nn`/`INS-nnnn` per `stfNextId`) | `{ staff, tempPassword }` | users, staff_profile / instructor_profile | `stfCreate` |
| PATCH | /admin/staff/:id | `{ type?, status? }` (409 `SELF_CHANGE_FORBIDDEN` for own account, 409 `LAST_BUSINESS_ADMIN`; instructors keep role) | staff | staff_profile | `stfDrawer` |
| POST | /admin/staff/:id/reset-password | `{}` | `{ tempPassword }` | users | staff drawer |
| GET | /admin/timetable | `?dojo=` | templates + sessions window | class_template, class_session | sessions.html timetable tab |
| POST/PATCH/DELETE | /admin/timetable[/:id] | template fields `{ dojoId, weekday, start, end, mat, type, instructorId, capacity, kidsOnly, onlineBookable, private?, studentMemberNo? }`; checks mat clash, instructor clash incl. grading (view `v_grading_conflict` logic), HQ-only online; creating/updating generates `class_session` rows for the next 12 weeks, DELETE cancels future sessions with bookings (returns lessons) | class_template, class_session | `openSessionForm` |
| GET | /admin/closures | - | closures | class_closure | sessions.html |
| POST | /admin/closures | `{ dojoId, from, to, note }` closes the days: affected `class_session` → `Cancelled`; every `Booked` row → `Cancelled` with the credit returned; writes `sent_log` row from template T-1/T-3 | class_closure, class_session, class_attendance, student_package, sent_log | `clInit` |
| DELETE | /admin/closures/:id | `{}` reopens sessions that were cancelled by that closure | class_closure, class_session | clInit |
| POST | /admin/classes/:lessonId/cancel | `{ note }` class-scope cancellation (the 3 Nov sample) returns lessons and writes `sent_log` | class_session, class_attendance, student_package | closure drawer |
| GET | /admin/imports | `?status=` | issues | import_issue | imports.html |
| PATCH | /admin/imports/:id | `{ status:'fixed'\|'dismissed' }` | issue | import_issue | impInit |
| GET | /admin/grading | `?tab=apps\|props` | `{ apps[], proposals[] }` (grading_application Submitted; grading_candidate Pending approval) | grading_application, grading_candidate, grading_session | admin grading.html |
| POST | /admin/grading/applications/:id/decision | `{ decision:'approved'\|'rejected', sessionId? }` | app | grading_application | grading approvals |
| POST | /admin/grading/candidates/:sessionId/:userId/promotion | `{ decision:'promote'\|'decline' }` | candidate | grading_candidate, student_profile | `promote` |

The brief's "read-only grading list for BA" is extended with the approve/disapprove actions the user asked for in message 2 ("just make HQ either approve or disapprove the items").

---------------------------------------------------------------------
## 4. Front-end shared modules

`src/public/js/api.js` (loaded right after `core.js`, replaces the data/store bootstrap role):
- `ASK.api(method, path, body)`: `fetch('/api/v1' + path, { method, credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: method==='GET' ? undefined : JSON.stringify(body ?? {}) })`; parses JSON; on `!ok` throws `ApiError{status, code, message}`; 401 → `ASK.toLogin()` (student → `student_portal/login.html`, instructor/admin → `admin_portal/signin.html?expired`); `ASK.get/post/put/patch/del` helpers; `ASK.csv(path)` for downloads.
- `ASK.boot()`: `GET /reference` (always) and `GET /auth/me` (portal pages; 401 handled by the guard), set `TODAY`, `ASK.skewMs`, `ASK.me`, fill reference constants in place (`DOJOS`, `PKG`, `CLASSES`, `OTHER_DOJO_CLASSES`, `INSTRUCTORS`, `BELTS`, `GRADING_FEE`, `DB.policies` fields, `HQ`); then append the scripts in `data-then` (comma list, page-relative) with `async=false`, and resolve `ASK.ready`.
- Date helpers `ASK.d('YYYY-MM-DD') → local-midnight Date`, `ASK.ts(iso) → Date`, `ASK.iso(date)`, `ASK.fill(target, items)` (in place), `ASK.errToast(e)` (maps `e.message` into `toast(..., 'bad')`).
- `ASK.load = {}` and `ASK.act = {}` are populated by the per-portal data modules.

`src/public/js/data.js`: keep fixed reference constants (their values become boot-time fallbacks overwritten from `/reference`), keep CURRICULUM, DOGI_SIZES, `whyNot` (UX hint only; the server is the authority), delete `SEED()` in FEAT-006 after the last page is converted. `core.js`: `let TODAY`, add `NOW()`.

`src/public/js/store.js` (rewritten): no storage. `AUTH = { role }` and `ADMIN = {id,name,type}` come from `ASK.me`; `isStaff`, `isBA` keep their meaning. `signIn/signInAdmin` removed (sign-in pages call the API); `signOut()` = `POST /auth/logout` then redirect. `DB` = `emptyDB()` (same top-level keys as SEED, all empty) filled by loaders; the aliases (`MY_PASSES`, `STUDENTS`, `APPS`, `MEMBERS`, `SESSIONS`, `GRAD_APPS`, `PROPOSALS`, `CANDIDATES`, `PAYS`, `GRADE`, `FEEDBACK`, `BOOKINGS`, `ATTENDANCE`, `GRADE_FB`, `MC_REQS`) keep pointing at those arrays/objects (filled in place). Removed: `DB_KEY`, `reviveDates`, `admSeed` block, `rmSeed`/`fbSeed` migrations, `save()` (remove all ~90 calls), `resetDemo` and the `[data-reset]` handler (remove any `data-reset` buttons too if present), `recordMyAttendance` (server does it). Kept: `remarksForStudent`, `hqClosedOn` (reads `DB.closures` filled from API), `myStudent`.

`src/public/js/portal.js`: `ALLOWED`, `ADM_BLOCKED`, `GATED` computed from `ASK.me` (`ASK.me.role === PORTAL`, `ASK.me.adminType`); `PORTALS.*.me` built from `/me` (`[initials, name, label]`); instructor `GATED` = no active examiner panel from `ASK.me`/`/instructor/grading` summary (`examinerShift()` becomes data from the schedule load; the `demoOn` toggle is removed). Notification bell builds rows from DB slices (unchanged) with the seen flag in memory. `[data-page-link]` handler drops `save()`.

Per-portal data modules (script lists set per page in `data-then`):
- `student_portal/student-data.js`: `ASK.load.home/packages/timetable(weekStart)/payments/grading/profile` and `ASK.act.buy/book/cancel/extension/applyGrading/withdrawGrading/rate/updateProfile`.
- `instructor_portal/instructor-data.js`: `load.schedule(from,to)/roster(lessonId)/students/profile/grading()`, `act.mark/end/remark/gradingNote/submitResult`.
- `admin_portal/admin-data.js`: all admin loaders and actions (split into `admin-data-desk.js` and `admin-data-business.js` so FEAT-004/005 do not collide).
- `landingpage/js/public-data.js`: `load.sessions(date)`, `act.trial`, `act.register`.

---------------------------------------------------------------------
## 5. Per-page data-loading plan

Legend: LOAD = what the page calls on start (after `ASK.ready`), ACT = writes. Re-render after each ACT by reloading the same slice.

### Landing (`src/public/landingpage/`)
| Page | LOAD | ACT |
|---|---|---|
| index.html, about.html, dojos.html, dojo.html | reference only (dojos, packages, instructors filled by boot) | - |
| classes.html, class.html (`class.js`) | reference timetable (HQ + other) | - |
| fees.html (`public.js`) | reference packages/policies | - |
| trial.html (`trial.js`) | `GET /public/sessions?date=` when the date changes (replace `CLASSES.filter` in `sessionsFor`) | `POST /public/trial-bookings` in the slide-to-pay completion; remove `new Date()` ticket ref logic, use returned `reference` |
| join.html (`join.js`) | reference packages/policies/dojos | `POST /public/registrations` in `completeRegistration`; use returned `memberNo`; drop `APPS.unshift` and `sessionStorage ask-last-id` (the done screen shows the returned member ID) |

### Student (`src/public/student_portal/`)
| Page | LOAD | ACT |
|---|---|---|
| login.html (`login.js`) | none (boot only, no guard) | `POST /auth/login {portal:'student'}`; drop `ask-last-id`; Google button toast; forgot calls `/auth/forgot-password` |
| index.html (home, game/plain views) | `ASK.load.home()` → fills `MY_PASSES, DB.unlimited, ATTENDANCE, BOOKINGS, GRADE, DB.remarks, DB.rateQueue, DB.levelUps, ME` | rate class (`/student/feedback`), cancel booking, curriculum modal stays static |
| book.html | `ASK.load.timetable(weekStart)` per week navigation; `renderBook` builds slots from API sessions (`left`, `state`, `whyNot`) instead of `CLASSES` + `c.booked` | `ASK.act.book`, `ASK.act.cancel`; remove `seedBookings`, `checkEnded`'s local queueing |
| packages.html | `ASK.load.packages()` | `ASK.act.buy` (replaces `openBuy` local push), `ASK.act.extension` (replaces `MC_REQS.push`) |
| payments.html | `ASK.load.payments()` → `PAYS` | receipt PDF client-side from the row |
| grading.html | `ASK.load.grading()` → `GRADE`, `GRADE_FB`, history | `ASK.act.applyGrading`; remove `gaDemo` demo toggles |
| profile.html | `ASK.load.profile()` | `ASK.act.updateProfile` |
| checkin.html | `ASK.load.home()` (so arrays exist); scan stays a mock on memory only, no `save()` | none |

### Instructor (`src/public/instructor_portal/`)
| Page | LOAD | ACT |
|---|---|---|
| index.html (schedule) | `ASK.load.schedule(weekRange)` (from/to follows the view: day/week/month), roster per opened class `ASK.load.roster(lessonId)`, students list | `act.mark` (tick), `act.end`, `act.remark`, `act.gradingNote`; remove `simulateTaps`, `inst.sim`, `DB.classEnded`, client `slotKey` storage (use `lessonId`) |
| grading.html | `ASK.load.grading()` (403/409 → redirect `index.html?nograding`, as `GATED` does today) | `act.submitResult` (replaces `PROPOSALS.unshift`, `GRADE_FB.unshift`, `save`); remove `demoOn` |
| profile.html | `ASK.load.profile()` | - |

`MY_INS` constant is replaced by `ASK.me.name`.

### Admin (`src/public/admin_portal/`)
| Page | LOAD | ACT |
|---|---|---|
| signin.html (`staff-login.js`) | none | `POST /auth/login {portal:'instructor'\|'admin'}`; remove `findStaff`/`showHint` lookups (static hint text only), `acct.last` |
| index.html (dashboard) | FD: `/admin/today`; BA also `/admin/overview` | links only |
| sessions.html | `/admin/rosters?date=`; BA tabs: `/admin/timetable`, `/admin/closures` | timetable CRUD, closures (BA) |
| roster.html (`?date&cls`) | `/admin/rosters/:lessonId` + `/admin/guests` | add booking, cancel, walk-in, waitlist, attendance, submit |
| members.html | `/admin/members` | - |
| member.html (`?no=`) | `/admin/members/:memberNo` | patch contact, belt (BA), follow-ups |
| applications.html | `/admin/applications` | MC decision, exceptions (BA) |
| register.html | `/admin/applications/:id` | checklist, activate |
| payments.html | `/admin/payments` | take payment, void/adjust (BA), mistake, refund request/decision (BA), day lock |
| equipment.html | `/admin/equipment` | ready, handover |
| followups.html | `/admin/followups` | attempt (FD), create/assign (BA) |
| notify.html | `/admin/notifications` | send |
| insights.html, revenue.html, reports.html | `/admin/insights`, `/admin/revenue`, `/admin/reports` | CSV |
| grading.html | `/admin/grading` | approve/reject applications, promote/decline |
| policies.html | `/admin/policies` | PATCH endpoints |
| staff.html | `/admin/staff` | create, role, deactivate, reset |
| imports.html | `/admin/imports` | fixed/dismissed |

The legacy `DB.rosters`, `DB.memberInfo`, `DB.interventions`, `DB.cohorts` are filled from the matching loaders (derived from attendance/profile columns as `.db-tmp/report2.md` explains: no stored blobs). Interventions have no table: show the section from `insights` aggregate only, and keep the "log an intervention" form disabled with a note OR (preferred) store it as `policy_setting` JSON key `interventions` (BA only); the FEAT-005 coder picks the policy_setting approach and records it in findings.

---------------------------------------------------------------------
## 6. Ordered feature decomposition

Features run sequentially, each ends with the app buildable, `npm test -- --runInBand` green, its verification scripts passing, and the pages it owns browser-clean. Pages not yet converted keep working on the in-memory SEED (no persistence).

**FEAT-001 foundation** (type feat). `package.json` (+ `npm install` for express, pg, bcryptjs, jsonwebtoken, cookie-parser, dotenv, helmet, express-rate-limit, zod; scripts start/dev/test), `scripts/placeholder-test.js`, `.env.example` (add JWT_SECRET, JWT_EXPIRES_IN), `app.js`, `src/config`, `src/utils`, `src/middleware`, meta/reference/auth routes+controllers+models, schema additions D11 in `db.sql` (kept re-runnable, loaded with seed in PGlite without error), `api.js`, `store.js`/`portal.js`/`core.js` rewrite per section 4, all HTML script blocks switched to the boot loader (mechanical, every portal), the two sign-in pages wired, student/instructor/admin guards driven by `/me`, verification harness (`.be-tmp/verify/db.mjs`, `reset-db.mjs`, `lib.mjs`, `api-auth.mjs`, `browser-lib.mjs`, `browser-login.mjs`), commit nothing. Done when: sign in as the four demo accounts works in the browser, guard redirects work, localStorage has no `ask-prototype`/`ask-role`/`ask-admin`, 401 without cookie, 403 wrong role, SQLi login string safe.

**FEAT-002 public + student** (type feat). Models/services/controllers/routes for sections 3.2 and 3.3 (packages, bookings, timetable, grading apply, feedback, MC, payments, profile, trial, registration + auto-activation service shared later with admin). Student pages and landing pages per section 5 including `student-data.js`, `public-data.js`. Verification: `api-public.mjs`, `api-student.mjs` (booking rules, max 2 packages, credits, cancel window with a session starting in 3 h vs 6 h inserted for the scratch DB, ownership: student A cannot read B), `browser-student.mjs` (book + cancel flow, packages credits 18 left for Lervyn, every student and landing page at 1280/390 with zero errors).

**FEAT-003 instructor** (type feat). Section 3.4: attendance service, remark rules, grading examiner window, results, profile/feedback, schedule. `instructor-data.js`, convert `instructor.js` (remove `simulateTaps`, `demoOn`, `MY_INS`, `classEnded`). Verification: `api-instructor.mjs` (Bob sees only own classes; +1 once; future class 409; examiner window using a grading_session inserted by the script around now; non-examiner 403), `browser-instructor.mjs` (mark attendance, end class, result submission).

**FEAT-004 admin desk** (type feat). Section 3.5 and the pages `index` (desk part), `sessions` (rosters), `roster`, `members`, `member`, `applications`, `register`, `payments`, `equipment`, `followups`, files `admin-desk.js`, `admin-members.js`, `admin.js` payments part, `admin-data-desk.js`, `admin-shell.js`. Registration activation shared with FEAT-002. Verification: `api-admin-desk.mjs` (FD vs BA matrix: void 403 for FD, refund decision BA only, MC 14-day limit, exception queue, walk-ins, CSV 403 for FD, SQL injection on member search), `browser-admin-desk.mjs` (front desk takes a mock payment; BA approves a refund; roster flows).

**FEAT-005 admin business** (type feat). Section 3.6 and pages `index` (overview), `sessions` (timetable, closures), `insights`, `revenue`, `reports`, `policies`, `staff`, `imports`, `grading`, `notify` (wider audiences), file `admin-business.js`, `admin.js` grading/sessions, `admin-data-business.js`. Verification: `api-admin-business.mjs` (matrix versus `ADMIN_PAGES`: every business route 403 for ADM-101; staff self-protection and last-BA; closure returns lessons and cancels sessions; timetable clashes), `browser-admin-business.mjs` (staff page role change; policy edit; closure).

**FEAT-006 hardening, docs, cleanup** (type chore). Remove `SEED()` and leftovers (grep gates: no `localStorage`/`sessionStorage` except the three UI prefs, no `save()`, no `SEED`, no `DB_KEY`, no `ask-role`, no `demoOn`, no `simulateTaps`), CSP tune, rate-limit and error-handler review, confirm no SQL outside `src/models`, README (run steps, env vars incl. `APP_FAKE_TODAY` and `JWT_SECRET`, API prefix, security notes incl. CSRF stance), `database/README.md` additions for D11 columns/tables, write `.be-tmp/report.md` (sections required by the brief: architecture and folder tree, endpoint catalogue, page-to-endpoint map, auth design, business rules, schema changes, env vars, how to run, decisions to confirm, deferred), run the whole verification (`.be-tmp/verify/run-all.mjs`), screenshots to `.be-tmp/screens/`, confirm git state.

---------------------------------------------------------------------
## 7. Verification plan (must actually execute)

Tooling lives only in `%TEMP%` (never repo deps):
- `%TEMP%\askdb`: `npm i @electric-sql/pglite @electric-sql/pglite-socket pg` (bcryptjs already there). `%TEMP%\askpw`: `playwright-core` (present).
- Scripts in `c:\Users\CedrikHwang\FSDP-C19\.be-tmp\verify\` import those packages via `createRequire(path.join(process.env.TEMP,'askdb','package.json'))` / `pathToFileURL` (same trick as `.db-tmp/browser-check.mjs`).

Scripts (FEAT-001 creates the harness; later features add files):
1. `db.mjs`: starts an in-memory PGlite and `PGLiteSocketServer` on a free port (`maxConnections: 4` if supported; otherwise the app runs with `DB_POOL_MAX=1`), prints `PORT=<n>` to a file `.be-tmp/verify/.dbport`, stays alive until killed. `reset-db.mjs`: connects with `pg`, runs `database/db.sql` then `database/seed.sql` (simple query protocol, multi-statement), used before each suite so every run starts from the seed.
2. `server.mjs`: spawns `node app.js` with env set for this run only: `NODE_ENV=development`, `PORT=<free>`, `DB_HOST=127.0.0.1`, `DB_PORT=<dbport>`, `DB_NAME=postgres`, `DB_USER=postgres`, `DB_PASSWORD=x`, `DB_POOL_MAX=1`, `JWT_SECRET=<random for run>`, `APP_FAKE_TODAY=2026-11-06`. Never reads or prints `.env`; dotenv does not override already-set variables, and every DB_* is passed explicitly so the real `.env` values are not used.
3. `lib.mjs`: cookie-jar fetch client (`login(portal, id, pw)` returns a client), `expect(status, code)`, summary counters; non-zero exit on any failure.
4. API suites: `api-auth.mjs`, `api-public.mjs`, `api-student.mjs`, `api-instructor.mjs`, `api-admin-desk.mjs`, `api-admin-business.mjs`, `api-sqli.mjs`. Each reseeds first. Every endpoint: success, 401 without cookie, 403 wrong role or admin type, validation 400, ownership, plus the rules listed per feature. Time-sensitive cases (cancel window, attendance open window, grading window) insert fixture rows into the scratch DB through `pg` relative to the server clock (fake date + current time of day): e.g. a class_session today starting 3 h from now for Bob, a grading_session today around now with Bob as examiner and two candidates. Fixtures live in the scripts, not in `seed.sql`.
5. Browser suites with playwright-core and Edge (`executablePath` as above, headless): sign in through the real forms as Lervyn (`ASK-2025-1834`), `INS-0042`, `ADM-001`, `ADM-101`, all with `password123`; load EVERY page of every portal at 1280 and 390 px; collect `console` errors, `pageerror`, `requestfailed` on the app origin, HTTP >= 400 on the app origin (ignore only `favicon.ico` and external logo/font hosts); assert `localStorage`/`sessionStorage` contain no `ask-prototype*`, `ask-role`, `ask-admin`, `ask-last-id` and no business data; assert DB-sourced values (Lervyn's 25-lesson pack `left` equals the seed value, member counts equal `SELECT count(*)`, Bob's schedule equals seed `class_session` rows for the day); run the flows: student books a class then cancels, instructor marks attendance then ends the class, front desk takes a mock payment, BA approves a refund, staff page changes a role, grading candidate result inside the window; screenshots of the main pages into `.be-tmp/screens/`.
6. `run-all.mjs` (FEAT-006): starts db, resets, starts server, runs all suites, prints a table, stops both processes, deletes the scratch artefacts (`.dbport`). PGlite is in memory, so "dropping the scratch DB" = killing the process; any `dataDir` use is deleted.
7. Final checks: `git status --short` (nothing staged; only expected modified/untracked files; `.env`, `.gitignore`, `prompts/` untouched), `git log -1` unchanged, secret scan (`JWT_SECRET` value, any password) in all new files, `npm ci` + `npm test -- --runInBand` succeed from a clean `node_modules` copy of the lockfile.

Review loop gate: `.be-tmp/review.json` shape `{ "verdict": "APPROVED" | "CHANGES_REQUESTED", "findings": [...], "reviewDoc": "<path>" }`, written only by the reviewer each iteration.

---------------------------------------------------------------------
## 8. Risks and notes for implementers

- `store.js`, `portal.js`, `core.js`, `data.js` are shared by all four portals; after every change to them load at least one page per portal at 1280/390 (browser suite does it).
- Edit only with the edit tools (no shell redirection into source files). Do not commit/add/push/reset/stash, do not touch `.env`, `.gitignore`, `prompts/`. Do not create `.agents/`.
- NUMERIC values come back as numbers (D9); `Date` values for `DATE` columns never become JS Dates on the server (strings). Compare dates as `YYYY-MM-DD` strings.
- `class_attendance` PK is `(lesson_id, user_id)`: re-booking after a cancel reuses the row (UPSERT: status back to `Booked`, new `booked_at`, new package id).
- `payment.user_id` references `student_profile`: guests have no payment row; the trial purchase amount is in `guest_pass.amount_paid`.
- `grading_candidate` CHECK `(result='Pass') = (promotion_status <> 'n/a')`: Retake and Fail keep `promotion_status='n/a'`.
- `student_profile` CHECK `weapon_hours <= accumulated_hours <= total_accumulated_hours`: update all three in one statement.
- PGlite is single connection: tests use `DB_POOL_MAX=1`; transaction code must never open a second pool query while a tx is open.
- Deferred (list in report): QR/check-in, real Stripe, email/SMS, CSV import pipeline, file uploads (MC `documentRef` stores a name only), real-time, audit log, student photos (stand-in remains), non-HQ online booking, Google sign-in.
