# Implementation Plan (round 2): member passwords, forced change, change-password, audit log, 29/36, hidden grading notes

Repo: `c:/Users/CedrikHwang/FSDP-C19`, branch `backend-integration`, NO worktree, all earlier work is uncommitted in the tree.
Stack: Node 20+/Express 5, `pg`, bcryptjs, jsonwebtoken (cookie `ask_token`), zod 4, MVC `route -> middleware -> controller -> service -> model`.
Static portals in `src/public` (vanilla JS, no build step, CSP blocks inline handlers).

## 0. Ground rules for every step (from the brief, they override any generic "commit" habit)

- NEVER run `git add / commit / push / reset / stash / checkout-restore`, never change git config. Read-only git (`status`, `diff`, `log`) is fine. Final check: `git log -1` still `769e384`, `git diff --cached` empty.
- Do not touch `.env` (names only), `.gitignore`, `prompts/`. No `.agents/` in the repo. No new repo deps beyond what `package.json` already has (bcryptjs, zod, express-rate-limit, pg are enough; `node:async_hooks` is built in).
- Edit source files only with read + str_replace / fs_write (never shell redirection, Set-Content, sed). Scratch and reports under `.be-tmp/`.
- Parameterised SQL only, SQL only in `src/models`, rules in `src/services`, thin controllers. Error JSON `{ error: { code, message } }`. Mutating requests stay JSON-only.
- IMPORTANT pool trap: the harness runs with `DB_POOL_MAX=1`. Inside a `withTx(tx => ...)` every query, including audit writes, MUST use `tx`. A pool query inside a tx deadlocks.
- Seed dates stay in 2025-11-06..2027-11-06 (except `dob`, `student_profile.joined_on`). Seed "today" is 2026-11-06 (`APP_FAKE_TODAY`).
- Payments stay mock. No Stripe, no real email/SMS. QR/check-in untouched.
- Never log, return or audit: passwords, hashes, tokens, JWTs, temp passwords (except the once-only response to staff for staff-created accounts), card data.

## 1. Findings that shape the plan (all read in the code)

| Topic | Today | Source |
| --- | --- | --- |
| Public registration | `registrationService.register()` inserts `registration_application`, then (if all enabled rules pass) calls `activate(tx, app, lines, ...)`, which generates `password.randomPassword()` and returns it only when `reveal` (desk). Public registrant gets no password. | `src/services/registrationService.js` |
| Staff activation | `applicationService.activate` -> `registrationService.activateApplication` -> same `activate()`; response `{ memberNo, tempPassword }`; modal `activatedModal()` in `admin-members.js` prints it. | `src/services/applicationService.js`, `src/public/admin_portal/admin-members.js` (lines ~269, ~486) |
| Desk registration | `applicationService.registerAtDesk` -> `register(..., { reveal: true, reviewerId, hold })`; validator reuses `publicV.registration` (check `validators/admin.js` for the desk schema; zod 4 refinements block `.extend()`, so export an un-refined base) | `src/validators/public.js`, `src/validators/admin.js` |
| Staff accounts | `staffService.create/resetPassword` generate `password.randomPassword()`, `userModel.insertUser/setPassword`. | `src/services/staffService.js`, `src/models/userModel.js` |
| Auth | `authService.login` -> JWT `{sub, role}`; `middleware/auth.js authenticate` re-reads account each request via `userModel.findAccount` and `accountService.toSession`. `/auth/me` returns `req.user`. No change-password endpoint. | `src/services/authService.js`, `src/middleware/auth.js`, `src/routes/auth.routes.js` |
| Rate limiting | `loginLimiter`, `publicWriteLimiter` in `middleware/rateLimit.js`; env in `config/index.js` (`loginRate`). | |
| Lervyn hours | `database/seed.sql` line 166: `('S-001','ASK-2025-1834', ..., '4k','ASK', 61, 34, 6, ...)` = total 61, accumulated 34, weapon 6. `gradingRules.sessionsCounted = floor(accumulated_hours)`. | `src/services/gradingRules.js` |
| Hard-coded 34 | `.be-tmp/verify/api-student.mjs` lines 46 and 209; `.be-tmp/verify/browser-student.mjs` lines 40 and 65 (`34 / 36`); `.be-tmp/report.md` decision 8. | |
| Grading notes leak | `src/models/remarkModel.js forStudent()` selects `r.kind IN ('student','grading') AND r.student_id = $1`; used by `studentService.home` (line 46). Student UI `NOTE_KIND` has a `grading` entry (`student.js` ~889) and `student-data.js` ~42 labels `Grading note`. Seed rows RM-01, RM-02 (S-002, S-004), RM-06 (S-001, lesson LS-20261030-1900-HQ-A). Instructor reads via `remarkModel.gradingNotesFor` (examiner candidate list) and `attendanceModel` roster `grading_note` (line 77): both stay. | |
| Modal | `core.js openModal(html, wide)` / `closeModal()`; Escape handler at line ~253 closes modal; overlay click closes. Student change-password is a fake modal in `student.js` (`#pwBtn`, ~1039, plus a global `submit` listener for `#pwForm`). Instructor profile has only "Forgot password" (`#forgotPw`, fake). | |
| Admin shell | `src/public/js/portal.js`: `ADMIN_PAGES` rows `[key, icon, label, group, baOnly]`; `ADM_BLOCKED` guard redirects front desk to `index.html?baonly`; `admin-shell.js showFlash()` shows the toast "That page is for Business Admins". Sidebar user block is `.rail-me` with a `data-logout` button; phone sheet uses `SM_LINKS` (`core.js` ~424 renders `data-logout` buttons). | |
| Page boot | `api.js` loads `/reference` + `/auth/me`, `data.js`, then the page's `data-then` scripts; admin pages also call `/admin/summary`, instructors `/instructor/grading` BEFORE page scripts, so a forced-change user would hit 403s unless boot short-circuits. | `src/public/js/api.js` |
| Transactions | Services use `withTx(async tx => ...)`; `nextId(tx, table, col, prefix, width)` for text ids. | `src/config/db.js`, `src/models/ids.js` |
| DB reset | `db.sql` DROPs every table (reverse dependency order) then recreates; `seed.sql` is one `BEGIN ... COMMIT` without TRUNCATE. So the append-only trigger does not break seeding or the "load twice" check. | `database/db.sql`, `database/seed.sql` |
| Harness | `.be-tmp/verify/run-all.mjs` (SUITES array, static checks), `lib.mjs` (`spawnApp(extraEnv)`, `client()`, `resetDb()`, `appEnv()`), `api-*.mjs`, `browser-*.mjs`, `browser-lib.mjs`, PGlite from `%TEMP%\askdb`, Edge via playwright-core from `%TEMP%\askpw`. | |

## 2. Decisions made here (one or two sentences each; shout if you disagree)

D1. **Hash at submission, store on the application.** `registration_application.password_hash VARCHAR(255)` (additive). Public/desk registration bcrypt-hashes before the transaction. `activate()` copies it into `users.password_hash`, and `markApproved`/`Rejected` set it to NULL. Rationale: the plain password never touches the DB and the stored hash lives only while the application is pending.
D2. **Legacy/seeded applications without a hash.** Seed APP-01..APP-0x gets the demo bcrypt hash (password123, same constant as users) so the existing harness can activate them and the new member signs in with `password123`. Defensive fallback in code: if the stored hash is NULL, `activate()` generates a temp password, sets `must_change_password = TRUE` and returns `tempPassword` once to staff (the old flow). Normal registrations never get a temp password.
D3. **must_change_password enforcement lives in `authenticate`** (strict by default; lenient variant for `/auth/me` and `/auth/change-password`). Logout is unauthenticated already. Error: 403 `PASSWORD_CHANGE_REQUIRED`. Rationale: a single choke point; every existing route already mounts `authenticate`.
D4. **Wrong current password returns 400 `CURRENT_PASSWORD_INCORRECT`** ("Current password is incorrect."), not 401, because `ASK.api` redirects to sign-in on any 401.
D5. **Session invalidation after a password change.** Add `users.password_changed_at TIMESTAMPTZ`. `authenticate` rejects a JWT whose `iat` (seconds) is less than `floor(password_changed_at)` in seconds with 401 `SESSION_EXPIRED`. The change-password and reset-password actions set it; change-password re-issues the cookie in the same request (its new `iat` is not less, so it stays valid). Rationale: a stolen cookie dies when the owner (or a BA reset) changes the password.
D6. **Rate limit for change-password**: `express-rate-limit`, keyed by `req.user.id`, `skipSuccessfulRequests: true`, default 5 failures per 15 min (`CHANGE_PW_RATE_MAX`, `CHANGE_PW_RATE_WINDOW_MS`); placed after authentication so the key is the account. The harness sets `CHANGE_PW_RATE_MAX=1000` by default and uses `5` only in the rate-limit test.
D7. **Audit ids**: `BIGINT GENERATED ALWAYS AS IDENTITY` (not `nextId`, which scans the table and takes an advisory lock; wrong for a hot log). pg's INT8 parser already returns numbers (`db.js`).
D8. **Append-only trigger and the FK.** `actor_user_id ... ON DELETE SET NULL` needs an UPDATE of that one column. The guard function allows exactly that transition (only `actor_user_id` non-null -> NULL, everything else equal) and raises for any other UPDATE, any DELETE and any TRUNCATE. A DBA can still `DROP TABLE audit_log` / `DROP TRIGGER`. Documented in `database/README.md`. Each row also snapshots `actor_name`, `actor_role`, `actor_admin_type`, so a row stays readable if the user is ever removed.
D9. **IP and user agent via AsyncLocalStorage.** New `src/middleware/requestContext.js` stores `{ ip, userAgent }` per request; `auditService` reads it. No service signature needs a `req`. `ip` stored as `VARCHAR(64)`, user agent truncated to 255.
D10. **Audit details policy.** `details` holds ids and changed field NAMES; for non-sensitive scalar fields (rank, status, dojo, amounts, counts, policy values) it holds before/after. For PII fields (phone, email, emergency contact, medical notes, names) it records the field names only. `sanitize()` additionally drops keys matching `/pass|hash|token|secret|jwt|authorization|cookie|card|cvv|otp/i`, replaces any string matching bcrypt `^\$2[aby]\$` or a JWT shape with `[removed]`, caps depth 3, arrays 20, strings 300.
D11. **Failed logins**: logged outside any tx with actor NULL, entity = the matched user id when the account exists, else NULL. The typed identifier is NOT stored (people paste passwords into the ID box). Details: `{ portal, reason: 'unknown_account'|'wrong_password'|'deactivated' }`. Failure to write this row is swallowed (`recordSafe`). Every other `record()` throws, so the action rolls back with it.
D12. **What is NOT audited** (state it in the README): all GETs, student self-service (bookings, packages, profile, feedback, grading apply/withdraw), instructor routine attendance marks/remarks/grading notes, public trial bookings. Staff bookings are audited only when they are overrides or cancellations with refund decisions; waitlist/walk-in/guest creation are not (routine). Everything else a staff member can change is audited (see section 6).
D13. **Audit export is itself logged** (`audit.exported`, details = filters + row count).
D14. **Join confirmation text has two variants** driven by `out.activated`: activated now -> "Sign in with your membership number or email and the password you chose"; waiting -> "Once HQ approves your registration, sign in with ...". Neither shows any password.
D15. **Lervyn totals**: accumulated 34 -> 29 and total 61 -> 56 (both lowered by 5, so the 27 earlier hours stay). Weapon 6 unchanged (`weapon <= accumulated <= total` CHECK holds). Lervyn's attendance rows do not feed the count (it comes only from `accumulated_hours`).
D16. **Account control in the admin portal**: a "Change password" key button in the sidebar `.rail-me` block next to the logout button on every admin page, plus a "Change password" item in the phone menu sheet. Student: existing profile button. Instructor: new button on `profile.html`. All call one function, `ASK.openChangePassword({ forced })`, defined in a new `src/public/js/account.js` that `api.js` loads for any signed-in portal page (so no page `data-then` lists change).
D17. **Forced flow**: when `/auth/me` says `mustChangePassword`, `api.js` loads `account.js` only (no data calls, no page scripts), marks the body `ok`, opens a LOCKED dialog (no close button, Escape and overlay ignored; "Sign out" link only). On success it reloads the page. A stale page that gets 403 `PASSWORD_CHANGE_REQUIRED` from any call does the same.
D18. **Coders do not commit** (brief overrides the generic per-FEAT commit step).

## 3. Schema (database/db.sql) — additive, inline, re-runnable

Edit `database/db.sql` (it drops and recreates, so inline columns are the repo's pattern, e.g. `payment.note`):

1. Header comment: table group 2 "Accounts" unchanged; add group line `8 Audit  audit_log`. Add design note `D5 audit_log is append-only (trigger)`.
2. DROP list (top, before `DROP TABLE IF EXISTS users`): add
   `DROP TABLE IF EXISTS audit_log CASCADE;` and `DROP FUNCTION IF EXISTS audit_log_guard() CASCADE;`.
3. `users`: add `must_change_password BOOLEAN NOT NULL DEFAULT FALSE`, `password_changed_at TIMESTAMPTZ`.
4. `registration_application`: add `password_hash VARCHAR(255)` with comment "bcrypt hash while the application is pending; cleared on approve/reject. Never returned by an API."
5. New section `8. AUDIT LOG` at the end:

```sql
CREATE TABLE audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(255), actor_role VARCHAR(20), actor_admin_type VARCHAR(20),
    action VARCHAR(60) NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
    entity_type VARCHAR(40), entity_id VARCHAR(255),
    summary TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip VARCHAR(64), user_agent VARCHAR(255)
);
CREATE INDEX idx_audit_time ON audit_log(occurred_at DESC, id DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE FUNCTION audit_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;                         -- only the FK ON DELETE SET NULL may touch a row
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();
COMMENT ON TABLE audit_log IS 'Append-only history of staff, auth, finance, grading and policy actions. A DBA can still DROP the table or trigger.';
```
(The coder must check the guard function works for the TRUNCATE case: `OLD`/`NEW` are unassigned there, but the `IF TG_OP = 'UPDATE' AND ...` short-circuit keeps them unread. If PGlite or PG complains, split into two functions.)

Verify: load `db.sql` then `seed.sql` twice (PGlite via harness `resetDb`), `SELECT count(*) FROM v_grading_conflict` = 0; `UPDATE/DELETE/TRUNCATE audit_log` each raise.

## 4. Seed (database/seed.sql)

- Line 166 Lervyn: `61, 34, 6` -> `56, 29, 6`. Update the header notes (say "Lervyn: 29 of 36 sessions toward 3rd Kyu, matches the prototype").
- `users` insert: add nothing (defaults give `must_change_password FALSE`).
- `registration_application` seed INSERT: add `password_hash` column; set the demo hash `'$2b$10$T88/9UZzmA2kWCyjDC44VObKDgRfr0bt1x5Fk0u3gqnD4Q8Q5UBTu'` (password123) on every OPEN application (status Submitted / Under review / Needs info); NULL for Approved/Rejected rows. Comment: "demo only, cleared when the application is activated".
- New block at the end (before COMMIT): `INSERT INTO audit_log (occurred_at, actor_user_id, actor_name, actor_role, actor_admin_type, action, entity_type, entity_id, summary, details, ip, user_agent) VALUES ...` about 14 rows, all between 2026-09-15 and 2026-11-05, actors from seeded staff (ADM-001 Grace Lim business, ADM-101 Daniel Ong frontdesk, INS-0042 instructor): `auth.login` (ADM-001, ADM-101), `auth.login_failed` (actor NULL, entity users/ADM-101), `staff.created`, `staff.role_changed` (ADM-102 -> frontdesk), `staff.deactivated` (ADM-102), `payment.collected` (L-1012 by ADM-101), `payment.voided`, `refund.requested`/`refund.decided`, `exception.decided`, `registration.info_requested` (APP-03 by ADM-101, 2026-11-05 15:00 to match the seeded review), `grading.result_submitted` (INS-0042, GR-20260315), `grading.promotion_decided` (ADM-001), `policy.updated`, `closure.created`, `attendance.corrected`, `booking.overridden`, `day.locked`. Only ids that exist in the seed. `ip` like `10.0.0.12`, fake user agents. No secrets.

## 5. Backend change list by decision

### 5.1 Password rules and registration passwords (user decision 1)

- `src/utils/password.js`: add `checkStrength(plain, { avoid = [] })` returning an error string or null: length >= 8, at least one letter and one digit, `Buffer.byteLength(plain, 'utf8') <= 72`, case-insensitive not equal to any `avoid` value (email, member no, user id, local part of email). Reuse in validators and in change-password.
- `src/validators/public.js`: factor `registrationBase` (strictObject without refinements) + add `password` and `confirmPassword` fields; `registration = registrationBase.superRefine(passwordRules)` where `passwordRules` checks strength via `checkStrength(password, { avoid: [email] })` and `password === confirmPassword` (message "Passwords do not match." on path `confirmPassword`). Export `registrationBase` and `passwordRules`.
- `src/validators/admin.js`: the desk registration schema must `registrationBase.extend({ carryGrade: ... }).superRefine(passwordRules)` (open the file, find the real name; adapt).
- `src/validators/auth.js`: add `changePassword = strictObject({ currentPassword: string 1..200, newPassword: string 1..200 (strength checked in service/superRefine without the account), confirmPassword: string optional })` with mismatch refine.
- `src/models/applicationModel.js`: `insert` adds `password_hash` (new param `a.passwordHash`); `markApproved` and a new `clearPasswordHash(id, db)` (or fold into `markStatus` for Rejected and `markApproved`) set `password_hash = NULL`. Do NOT add the column to `LIST_COLS`.
- `src/services/registrationService.js`:
  - `register()`: `const passwordHash = await password.hash(input.password)` BEFORE `withTx`; pass in `app.passwordHash`; remove `reveal`'s `tempPassword` from the response (keep the `reveal` flag only if still used for something else, otherwise delete it); response never includes a password.
  - `activate(tx, app, ...)`: `const hash = app.passwordHash || ...fallback`: if no stored hash, generate temp + `mustChange = true` and return `tempPassword`; else use the stored hash, `mustChange = false`, return no `tempPassword`. `userModel.insertUser({..., mustChangePassword})`.
  - `activateApplication()`: add `passwordHash: row.password_hash` to the `app` object. `markApproved` clears the hash (same transaction).
- `src/services/applicationService.js`: `activate` returns `{ memberNo }` plus `tempPassword` only for the fallback; `reject` clears the hash (`applicationModel.markStatus(..., 'Rejected')` path); `registerAtDesk` passes through; make sure `shape()` and `detail()` never spread a raw row.
- `src/models/userModel.js`: `insertUser` takes `mustChangePassword = false`; `findAccount` selects `u.must_change_password, u.password_changed_at`; new `findCredentialsById(id, db, lock)` (selects `id, role, email, password_hash`, optional `FOR UPDATE`); `setPassword(id, hash, { mustChange, at }, db)` sets `password_hash`, `must_change_password`, `password_changed_at`.
- `src/services/accountService.js` `toSession`: add `mustChangePassword: !!row.must_change_password` to every role's session (base object).
- `src/services/staffService.js`: `create` -> `insertUser(..., mustChangePassword: true)`; `resetPassword` -> `setPassword(id, hash, { mustChange: true, at: clock.now() })`. Response unchanged (temp password once to the BA).

### 5.2 must_change_password enforcement (middleware design)

`src/middleware/auth.js` becomes a factory:

```
function build({ allowPasswordChange }) {
  return async function authenticate(req, res, next) {
    ... existing token + findAccount + toSession + deactivatedReason ...
    // new: token issued before the last password change is dead
    if (row.password_changed_at && payload.iat < Math.floor(new Date(row.password_changed_at).getTime() / 1000)) { clearAuthCookie(res); throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED'); }
    req.user = session;
    if (session.mustChangePassword && !allowPasswordChange)
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must set a new password before you can continue.');
    next();
  };
}
module.exports = { authenticate: build({ allowPasswordChange: false }), authenticateAllowingPasswordChange: build({ allowPasswordChange: true }), setAuthCookie, clearAuthCookie, COOKIE };
```
- `src/routes/auth.routes.js`: `/me` and `/change-password` use `authenticateAllowingPasswordChange`; `/logout` stays unauthenticated; every other router keeps `authenticate` (strict), so student/instructor/admin APIs are blocked while the flag is true. `/auth/login` still succeeds and returns the session with `mustChangePassword: true`.
- `src/middleware/rateLimit.js`: add `changePasswordLimiter` (D6) using `config.changePwRate`. `src/config/index.js`: add `changePwRate: { windowMs: int(env.CHANGE_PW_RATE_WINDOW_MS, 15*60*1000), max: int(env.CHANGE_PW_RATE_MAX, 5) }`. `.env.example`: add the two names with placeholders only (it is already modified in the tree; this file is NOT `.env`).

### 5.3 Change password (user decision 5a)

- Route: `POST /api/v1/auth/change-password` = `authenticateAllowingPasswordChange, changePasswordLimiter, validate({ body: v.changePassword }), ctrl.changePassword`.
- `src/services/authService.js` `changePassword(user, { currentPassword, newPassword })`, inside `withTx`:
  1. `findCredentialsById(user.id, tx, true)`; `compare(currentPassword, hash)` false -> `AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect.')`.
  2. `checkStrength(newPassword, { avoid: [email, user.id, user.memberNo, local part] })` -> 400 `WEAK_PASSWORD` with the specific message.
  3. `compare(newPassword, hash)` true -> 400 `PASSWORD_REUSED` ("Choose a password different from your current one.").
  4. `setPassword(user.id, await hash(newPassword), { mustChange: false, at: clock.now() }, tx)`.
  5. `auditService.record(tx, user, { action: 'auth.password_changed', entityType: 'user', entityId: user.id, summary: 'Changed own password', details: { forced: user.mustChangePassword } })`.
  6. return fresh session (`findAccount` + `toSession`), token via a new exported `issueToken(session)` (extract from `signToken`).
- `authController.changePassword`: `setAuthCookie(res, token); res.set('Cache-Control','no-store'); res.json({ ok: true, user: session })`.
- Failed attempts: wrong current password is also counted by the limiter (`skipSuccessfulRequests`). Optionally log `auth.password_change_failed` via `recordSafe` (outside tx is impossible inside the tx that rolls back; so log it AFTER the transaction, in the controller path/service wrapper, with `recordSafe`). Keep it simple: log it in the service's catch of that specific AppError after `withTx` rejects.
- `authService.login`: after success `auditService.recordSafe`-or-`record(pool)` `auth.login` (actor = session, entity user/id; failure here should not block sign-in? Brief: audit failure on login_failed must not break the response; for success treat it as sensitive and let it throw). On `INVALID`/deactivated paths, write `auth.login_failed` (D11) before rethrowing. Use a small helper so the generic 401 body stays identical (no account-existence leak in the response).

### 5.4 Hide grading notes from students (user decision 4)

- `src/models/remarkModel.js` `forStudent`: change the second predicate to `(r.kind = 'student' AND r.student_id = $1)`; update the doc comment (grading notes are for instructors/examiners only; never selected here). `gradingNotesFor` and `attendanceModel` roster `grading_note` stay.
- Defence in depth: `studentService.home` maps remarks; add `.filter(r => r.kind !== 'grading')` is NOT needed (the query is the control), but add a code comment and do not add UI-only filtering.
- UI cleanup: `student_portal/student.js` `NOTE_KIND` drop the `grading` entry; `student-data.js` fallback label 'Grading note' removed (label for a null date becomes 'Note').

### 5.5 Seed 29/36 (user decision 2): see section 4. Then update expectations (section 9).

### 5.6 Audit infrastructure (user decision 5b)

New files:
- `src/middleware/requestContext.js`: AsyncLocalStorage store `{ ip, userAgent }`; `requestContext(req,res,next)` runs `next` inside `als.run`; export `current()`. Mount first in `src/routes/index.js` (before `requireJson`) so every API request has it.
- `src/models/auditModel.js`: `insert(row, db)`; `search(filters, { limit, offset }, db)` returning rows + `total` (`COUNT(*) OVER()` or a second query); `searchForExport(filters, limit, db)`; `facets(db)` (distinct actors `{id, name}`, distinct action groups = `split_part(action,'.',1)`, distinct entity types). Filters are bound params only: `from`/`to` as local dates in `APP_TZ` (`occurred_at >= ($1::date::timestamp AT TIME ZONE $tz)`, `to` inclusive via `+ interval '1 day'`), `actorId`, `group` (`action LIKE $n || '.%'` with the group validated against an enum), `action`, `entityType`, `entityId`, `q` (`ILIKE` on summary, action, actor_name, entity_id with `%`/`_` escaped). Order `occurred_at DESC, id DESC`.
- `src/services/auditService.js`:
  - `record(db, actor, { action, entityType = null, entityId = null, summary, details = {} })` — `db` is a tx client (or `undefined` for the pool). Builds the snapshot (`actor.id/name/role/adminType`; `actor === null` for system/anonymous), sanitises details (D10), truncates summary to 500 chars, reads ip/UA from `requestContext.current()`. Throws on failure.
  - `recordSafe(...)`: same, but catches and `console.error('[audit] write failed')` with no payload.
  - `ACTIONS` catalogue and `GROUPS` (`auth, staff, member, payment, refund, exception, registration, attendance, booking, closure, class, policy, timetable, grading, mc, day, followup, notification, equipment, import, intervention, audit`).
  - `list(user, query)` and `exportCsv(user, query)`: assert `user.adminType === 'business'` (403 `BUSINESS_ADMIN_ONLY`) as a second line of defence; map rows to `{ id, at, actor: { id, name, role, adminType }, action, group, entityType, entityId, summary, details, ip }`; response `{ rows, total, page, pageSize, pages, facets }`. Page size default 25, max 100. Export: max 10 000 rows, columns `Time (SGT), Actor ID, Actor, Role, Action, Entity type, Entity ID, Summary, Details`, built with `utils/csv.js toCsv` (formula-safe), filename `audit-log-<today>.csv`; then `record(... 'audit.exported' ...)`.
- `src/controllers/auditController.js`, `src/routes/admin/audit.routes.js` (`GET /audit`, `GET /audit/export.csv`, both `requireAdminType('business')`, `validate({ query: v.auditQuery })`), mounted in `src/routes/admin/index.js`. `src/validators/admin.js`: `auditQuery = strictObject({ from: day.optional(), to: day.optional(), actorId: id.optional(), group: z.enum(GROUPS).optional(), action: z.string().regex(/^[a-z_]+\.[a-z_]+$/).optional(), entityType: id.optional(), entityId: id.optional(), q: z.string().trim().max(100).optional(), page: num(1, 100000).optional(), pageSize: num(1, 100).optional() })` + `from <= to` refine. CSV responses use the same headers pattern as `memberController.exportCsv` (`Cache-Control: no-store`).

## 6. Mutation sites to instrument (call `auditService.record(tx, user, ...)` INSIDE the existing `withTx`)

Grep `withTx(` in `src/services` and confirm each row; if a service has no `user`, thread `req.user` through controller -> service (signature change listed).

| File : function | Action | entity_type / entity_id | details (ids / non-PII) |
| --- | --- | --- | --- |
| authService.login (success, pool) | `auth.login` | user / user id | portal |
| authService.login (failures, pool, `recordSafe`) | `auth.login_failed` | user / id if known else NULL | portal, reason |
| authService.changePassword | `auth.password_changed` | user / id | forced flag |
| staffService.create | `staff.created` | staff / new id | type, danGrade (no email value; `emailSet: true`) |
| staffService.update (type) | `staff.role_changed` | staff / id | before/after type |
| staffService.update (status) | `staff.deactivated` or `staff.reactivated` | staff / id | before/after status |
| staffService.resetPassword | `staff.password_reset` | staff / id | `{ mustChange: true }` only |
| memberService.patch | `member.updated` (field names; before/after for status, dojo) and `member.belt_changed` (before/after rank id) | member / member no | fields[], reason |
| memberService.message | `member.message_sent` | member / member no | title length only |
| followupService.logContact / addAttempt / create / update | `followup.contact_logged`, `followup.attempt_logged`, `followup.created`, `followup.updated` | followup or member / id | kind, method, outcome (no free text) |
| paymentService.takePayment | `payment.collected` | payment / id | item, amount, method |
| paymentService.collect | `payment.collected` | payment / id | amount, method |
| paymentService.voidOrAdjust | `payment.voided` (or `payment.adjusted` when `adjustTo`) | payment / id | amount before/after, reason length |
| paymentService.reportMistake | `payment.mistake_reported` | payment / id | reason length |
| paymentService.requestRefund | `refund.requested` | refund / id | payment id |
| paymentService.decideRefund | `refund.decided` | refund / id | decision |
| paymentService.lockDay / unlockDay | `day.locked`, `day.unlocked` | day / date | date |
| paymentService.markReady / handOver (add `user`) | `equipment.ready`, `equipment.handed_over` | equipment / id | collectedBy name omitted, flag only |
| exceptionService.create / decide | `exception.raised`, `exception.decided` | exception / id | kind, decision |
| mcService.decide | `mc.decision` | mc_request / id | decision, days |
| applicationService.setChecklist | `registration.checklist_updated` | application / id | rule id, done |
| applicationService.activate | `registration.activated` | application / id | member no, starting grade id, `passwordSource: 'member'|'temporary'` |
| applicationService.reject | `registration.rejected` | application / id | note length |
| applicationService.requestInfo | `registration.info_requested` | application / id | |
| registrationService.register (public, actor null; desk, actor staff) | `registration.submitted`; if auto-activated also `registration.activated` (actor null / staff) | application / id | member no, `source: 'public'|'desk'` |
| deskService.addBooking (override only) | `booking.overridden` | lesson / lesson id | member no, reason |
| deskService.cancelBooking | `booking.cancelled_by_staff` | lesson / lesson id | member no, refund bool |
| deskService.setAttendance | `attendance.corrected` | lesson / lesson id | member no, status before/after, reason |
| deskService.submit | `attendance.submitted` | lesson / lesson id | present, noShow counts |
| closureService.create / remove (add `user`) | `closure.created`, `closure.deleted` | closure / id | range, dojo, lessons affected |
| closureService.cancelClass | `class.cancelled` | lesson / lesson id | |
| policyService.update / updatePackage / updateRule / createTemplate / updateTemplate / deleteTemplate (add `user`) | `policy.updated` (keys with before/after), `policy.package_updated`, `policy.rule_updated`, `policy.template_created|updated|deleted` | policy / key or id | |
| timetableService.create / update (add `user`) / remove | `timetable.changed` | timetable / template id | `change: created|updated|removed`, day/time/type |
| importService.decide (add `user`) | `import.decided` | import / id | status |
| reportService.addIntervention / decideIntervention (add `user`) | `intervention.added`, `intervention.decided` | intervention / id | |
| notificationService.send | `notification.sent` | notification / template id | audience type, recipient count |
| gradingService.submitResult | `grading.result_submitted` | grading_candidate / `${sessionId}:${userId}` | result, score, promotion status (no remarks text) |
| gradingService.decideApplication | `grading.application_decided` | grading_application / id | decision, session |
| gradingService.decidePromotion | `grading.promotion_decided` | grading_candidate / `${sessionId}:${userId}` | decision, from/to rank |
| auditService.exportCsv | `audit.exported` | audit / NULL | filters, count |

Controllers to change for the added `user` argument: `businessController.js` (policy*, timetable create/patch, closureDelete, importDecide, decideIntervention), `financeController.js` (equipmentReady, equipmentHandover). Callers inside services that pass positional args must be updated together.

## 7. Front end change list

1. **`src/public/js/api.js`**: after `/auth/me`, if `me && me.mustChangePassword` and the page has `data-portal`: `await loadScript(dir + 'account.js')`, `document.body.classList.add('ok')`, call `ASK.openChangePassword({ forced: true })`, `coreReady()` and return (skip `data.js`, summary, panels, `then`). Otherwise, if `me`, load `account.js` before the `then` list. In `ASK.api` error path: `if (res.status === 403 && er.code === 'PASSWORD_CHANGE_REQUIRED') ASK.forcePassword()` (reload to trigger forced mode). Keep "nothing in browser storage".
2. **`src/public/js/account.js` (new)**: `ASK.openChangePassword({ forced = false })`: modal with Current / New / Confirm password fields, show/hide toggle per field (reuse the sign-in page's toggle markup if it exists; otherwise a small `button.pw-eye` styled in `forms.css`), live rule hints (8+ chars, a letter, a number), inline `.err` messages, submit -> `ASK.post('/auth/change-password', ..., { noRedirect: true })`; server errors shown inline (`CURRENT_PASSWORD_INCORRECT`, `WEAK_PASSWORD`, `PASSWORD_REUSED`, 429). Success: toast "Password updated"; forced -> `location.reload()`, else `closeModal()`. All dynamic text through `esc()`. Fields cleared on close; `autocomplete="current-password"/"new-password"`.
3. **`src/public/js/core.js`**: `openModal(html, wide = false, opts = {})` with `opts.locked` -> module flag `modalLocked`, `.modal.locked` class hides `.modal-x`; `closeModal()` returns early while locked; Escape/overlay paths go through `closeModal` already. Add `closeModal(true)` / `unlockModal()` for the success path. Phone sheet: `SM_LINKS` entries with a third value `'account'` render `<button data-account>`; global click handler in `account.js` opens the dialog. CSS in `src/public/css/portal.css` or `base.css` for `.modal.locked .modal-x { display:none }` and the eye toggle.
4. **Student**: `student_portal/student.js` replace the `#pwBtn` fake modal and the global `#pwForm` submit listener with `$('#pwBtn').addEventListener('click', () => ASK.openChangePassword())`. `profile.html` unchanged (button exists). Remove `grading` from `NOTE_KIND`; `student-data.js` label fallback.
5. **Instructor**: `instructor_portal/profile.html` add a `Change password` button (`id="pwBtn"`, same classes/icon as the student one) beside `#forgotPw`; `instructor.js renderProfile()` binds it to `ASK.openChangePassword()`. Leave the mock "Forgot password" alone.
6. **Admin shell**: `portal.js buildShell()` rail-me block gains `<button data-account aria-label="Change password" title="Change password">${icon('lock')}</button>` before the logout button (admin only; keep student/instructor shells unchanged); `SM_LINKS` gets `['Change password', null, 'account']` for the admin portal. CSS for the two-button `.rail-me`, check collapsed sidebar and 390px.
7. **Join page** (`landingpage/join.html`, `js/join.js`): new `rgroup` "Create your password" in step 1 after "Emergency contact": two inputs `r-pw`, `r-pw2` with the show/hide toggle, `autocomplete="new-password"`, hint "At least 8 characters with a letter and a number. You will sign in with your membership number or email and this password." `validateStep(1)` checks strength + match (messages as `.err` spans). `completeRegistration()` sends `password` and `confirmPassword`; clear both inputs after the call; never put them in `reg.done`, the review step or the mock emails. Update `#doneEmail` paragraph, the welcome mail text and the receipt-free copy per D14; keep the mock email code step untouched.
8. **Desk registration** (`admin_portal/register.html`, `admin-members.js`): new card "Sign-in password" after "Personal details": note "The student types their own password. Staff never see or note it." fields `rg-pw`, `rg-pw2` + toggles; validation in the existing submit handler; `ASK.act.deskRegister` payload gets `password`/`confirmPassword`; result view (~line 486) drops the temporary password block, shows member no. and "The student signs in with their member number or email and the password they just chose" (or "after a Business Admin confirms the grade" when held). `activatedModal()` (~line 269) shows the temp password block only when `out.tempPassword` exists (legacy fallback). Clear password inputs after submit.
9. **Staff page** (`admin-business.js` ~389-437): copy on create/reset: "must change it at first sign-in".
10. **Audit page** (BA only):
    - `src/public/js/portal.js`: add `['audit', '<icon>', 'Audit log', 'Control', true]` right after the `staff` row in `ADMIN_PAGES` (pick an existing `i-` symbol from `core.js` such as `clock`; add a new symbol only if none fits). The existing `ADM_BLOCKED` guard and `showFlash()` then redirect the front desk with the "That page is for Business Admins" toast. Server returns 403 independently.
    - `src/public/admin_portal/audit.html` (copy `staff.html`; `data-page="audit"`; `data-then` = same list as staff plus `admin-audit.js`). Markup: `.page-h` with title "Audit log" + subtitle + `Export CSV` button (`data-ba`); filter bar: from/to dates (reuse the date input pattern from `reports.html`/`revenue.html`), actor `<select>`, action group `<select>`, entity type `<select>`, search `<input type="search">`; `.tbl-wrap > table.tbl` columns Time, Actor (name + role pill), Action, Entity, Summary, expander; pager (Prev / Next, "Page x of y · N events") copying the Members page pager.
    - `src/public/admin_portal/admin-audit.js` (new): `runPage({ audit })` pattern; state `{ page, pageSize, filters }`; debounce search 250 ms; every request via `ASK.load.baAudit(params)`; rows drawn with `esc()`; expandable details row shows key/value pairs of `details` plus IP (escaped, `textContent`-safe), empty state, loading and error state; CSV via `ASK.csv('/admin/audit/export.csv?...', 'audit-log.csv')` with the same filters; at <= 600px rows render as stacked cards (copy the members/staff responsive CSS approach in `portal.css`).
    - `admin-data-business.js`: `ASK.load.baAudit = params => ASK.get('/admin/audit?' + new URLSearchParams(params))` following the file's existing helper style.
    - Escape everything; no inline handlers (CSP).
11. **Sign-in pages** (`student_portal/login.js`, `admin_portal/staff-login.js`): no change needed beyond making sure a login response with `mustChangePassword` still redirects to the portal home (the forced dialog appears there). Verify.

## 8. Docs

- `README.md`: endpoint list (change-password, audit), env vars (`CHANGE_PW_RATE_MAX`, `CHANGE_PW_RATE_WINDOW_MS`), auth section (must_change_password, PASSWORD_CHANGE_REQUIRED, session invalidation), registration section (member sets own password, no temp password), grading-notes decision (hidden from students, enforced in `remarkModel.forStudent`), demo passwords note (seeded applications use the demo hash), "what is audited" list (D12), append-only note.
- `database/README.md`: table list gets `audit_log`; "Schema changes for the backend" gets round-2 items (users.must_change_password, users.password_changed_at, registration_application.password_hash, audit_log + trigger + how a DBA drops it); seed notes (Lervyn 29/36, seeded audit rows, seeded applications' demo hash).
- `.be-tmp/report.md` section 11 decisions 1, 2, 8 and section 12 deferred (audit log and change-password removed): update; write the round-2 summary to `.be-tmp/task2/report2.md` at the end.

## 9. Verification harness (`.be-tmp/verify/`)

Changes to existing files:
- `lib.mjs appEnv`: add `CHANGE_PW_RATE_MAX: '1000'`.
- `api-student.mjs` lines 46 and 209: `34` -> `29`, `'34 / 36'` -> `'29 / 36'`; add: no remark with `kind === 'grading'` in `/student/home`; JSON of every student GET does not contain the RM-06 body ("On track for the next grading"); insert a fresh grading remark by SQL for S-001 and re-check; instructor endpoint (`/instructor/grading/.../candidates` or roster) still shows grading notes.
- `browser-student.mjs` lines 40 and 65: `34` -> `29`; assert the home "Notes from your instructors" list has no "Grading note" chip; profile page change-password dialog works.
- Every suite that posts a registration (`api-public`, `api-admin-desk`, `browser-login`, any `deskRegister` call, `api-sqli`) needs `password`/`confirmPassword` in the payload; every assertion on `tempPassword` for registrations/activations changes (activation now returns no `tempPassword`; staff create/reset still do).
- `run-all.mjs`: add the new suites to `SUITES`; new static checks: no `tempPassword` in `publicController`/`registrationService.register` response path, `password_hash` not in `LIST_COLS`, `audit.html` and `account.js` exist, no new `localStorage`/`sessionStorage` keys.

New suites:
1. `api-account.mjs`: public registration with password -> row has bcrypt hash, response/any endpoint never contains the hash or password; weak (short, no digit, no letter, >72 bytes, equals email, mismatch, missing) -> 400; auto-activation path and staff `activate` path -> user row uses the SAME hash, `registration_application.password_hash` is NULL afterwards, member logs in with member no and with email + own password and NOT with a guess; desk registration (FD) same incl. `hold` (carry grade) then BA activation; rejected application clears the hash; seeded application activation uses fallback demo hash; staff created -> `mustChangePassword` true on login, every other endpoint 403 `PASSWORD_CHANGE_REQUIRED` for each portal role (instructor, front desk), `/auth/me` and change-password allowed, flag cleared after change and APIs work; BA reset-password sets flag + `password_changed_at`, old cookie of the target now 401; change-password for student, instructor, front desk, BA: success (new cookie `Set-Cookie`, old password fails, new works), wrong current, reused, weak, mismatch, unauthenticated 401, JSON-only 415, rate limit (own app instance with `CHANGE_PW_RATE_MAX=5`: 5 failures then 429, success not counted); audit rows for each.
2. `api-audit.mjs`: drive every action in section 6 through the API and assert one `audit_log` row each (action, actor id/role/admin type, entity type/id, summary non-empty, `occurred_at` within a minute); atomicity (force a failing action, e.g. a refused void, and assert no audit row; and an action that audits then fails rolls back); secrets scan across all rows (keys/values: bcrypt `\$2[aby]\$`, JWT `eyJ`, any temp password captured from responses, keys matching `/pass|hash|token|secret/i` in details); trigger: UPDATE, DELETE, TRUNCATE each fail with the append-only message, while `INSERT` works and deleting a user is not part of the app; endpoints: 401 anonymous, 403 student/instructor/front desk (both list and export), 200 BA; filters (from/to, actorId, group, action, entityType, entityId, q), pagination (`page/pageSize`, totals consistent), validation errors 400, CSV headers/content type/disposition, formula-injection cell escaped, `audit.exported` logged; seeded rows present and inside the date window; `auth.login_failed` writes with actor NULL and does not store the identifier; audit failure on login_failed does not break the 401 (simulate with a temporary `DROP`/rename of a column on a scratch copy, or by unit-calling `recordSafe` with a failing db stub).
3. `browser-account.mjs` (Edge at 1280 and 390): join page shows password fields + toggle, mismatch/weak errors, full registration, new confirmation text, no password anywhere in the DOM after submit; desk register page same; forced dialog for an instructor, a front desk user and a student (set the flag by SQL for the test), dialog cannot be closed with Escape/overlay, after success page loads normally; change-password dialog in student profile, instructor profile and admin sidebar (desktop and phone sheet); zero console errors, zero failed requests (403 PASSWORD_CHANGE_REQUIRED on forced pages must not happen because boot short-circuits).
4. `browser-audit.mjs`: ADM-001 opens `audit.html` at 1280 and 390, rows load, filters/search/pager/expand/CSV button work, no console errors, no failed requests, screenshots to `.be-tmp/screens/audit-1280.png`, `audit-390.png`; ADM-101 opening it is redirected to `index.html` and sees the "That page is for Business Admins" toast; nav item absent for FD, present for BA.
5. Existing browser suites keep covering "every page at 1280/390, zero console errors/failed requests, no business data in storage, QR mock untouched"; `browser-login.mjs`'s page list must include `audit.html`.

Final run: `node .be-tmp/verify/run-all.mjs` (all suites + static checks, exit 0), then `db.sql`+`seed.sql` twice and `v_grading_conflict` = 0 (already part of `resetDb`; add an explicit double-load check in `api-audit.mjs` or a small `db-reload.mjs`), `npm ci` then `npm test -- --runInBand` exit 0, secret scan of changed/new files (regex for bcrypt hashes other than the documented demo hash, `JWT_SECRET=`, long random strings), `git log -1` unchanged, `git diff --cached --stat` empty, `git status` shows no `.env`/`.gitignore`/`prompts/` changes beyond what was already modified before this round (compare with the status captured at the start: `.be-tmp/task2/git-status-before.txt`). Stop all servers and the PGlite scratch process.

## 10. Ordered steps (each leaves the app buildable)

- [ ] 1. Schema + seed. Edit `database/db.sql` (section 3) and `database/seed.sql` (section 4: Lervyn 56/29/6, application hashes, audit seed rows). Capture `git status --short` to `.be-tmp/task2/git-status-before.txt` first.
      Verify: harness `resetDb()` twice without error (`node .be-tmp/verify/reset-db.mjs` with PGlite running via `db.mjs`, or the first suite); `v_grading_conflict` 0 rows; manual UPDATE/DELETE/TRUNCATE on `audit_log` fail.
- [ ] 2. Audit foundation (D7-D13): `requestContext.js`, `auditModel.js`, `auditService.js` (record/recordSafe/sanitize), mount context in `routes/index.js`. Verify: `node -e` smoke through the harness DB or the later api-audit suite; `npm start` boots (config loads).
- [ ] 3. Password policy + registration passwords + userModel/accountService/staffService changes (5.1) with their audit calls (`registration.*`, `staff.*`).
      Verify: api-account registration section passes (written in step 8, use a quick ad-hoc script until then).
- [ ] 4. `authenticate` factory, `PASSWORD_CHANGE_REQUIRED`, `changePassword` service/route/limiter/config, login auditing (5.2, 5.3). Verify with ad-hoc requests against a spawned app.
- [ ] 5. Grading notes hidden (5.4).
- [ ] 6. Instrument the remaining mutation sites (section 6) and thread `user` into the services listed; add audit routes/controller/validators (5.6). Verify: run the existing api suites quickly (`api-admin-desk`, `api-admin-business`) after fixing registration fixtures to confirm nothing regressed.
- [ ] 7. Front end (section 7): api.js, account.js, core.js, portal.js, student/instructor/admin changes, join, desk register, audit page. Verify by loading pages in the browser suites later; at minimum `node --check` on every edited JS file and a manual Edge smoke.
- [ ] 8. Harness: update existing suites, add the four new suites, update `run-all.mjs` (section 9). Verify: each new suite on its own, then `node .be-tmp/verify/run-all.mjs`.
- [ ] 9. Docs (section 8). Verify: README/DB README mention every new endpoint, env var, table and decision.
- [ ] 10. Convergence: full `run-all.mjs`, `npm ci`, `npm test -- --runInBand`, git/secret checks, screenshots to `.be-tmp/screens/`, stop servers and scratch DB, write `.be-tmp/task2/report2.md`.

## 11. Decisions to confirm (assumptions already applied, easy to flip)

1. Seeded pending applications carry the demo password hash (members activated from them sign in with `password123`). Alternative: leave the hash NULL and use the temporary-password fallback.
2. Lervyn's total hours drop from 61 to 56 together with accumulated 34 -> 29.
3. Wrong current password is HTTP 400 (`CURRENT_PASSWORD_INCORRECT`), not 401.
4. Changing or resetting a password signs out that account's other sessions (JWT `iat` check). Tell me if you do not want this.
5. Items not audited (D12). Waitlist/walk-in/guest and instructor routine marks are the main ones; say if you want them logged.
6. `audit.exported` and `auth.password_change_failed` are logged too.
7. Failed-login rows never store the typed identifier.
8. The join confirmation has two variants (activated now vs waiting for HQ), neither shows a password.
9. A BA-created staff/instructor still gets a temporary password the BA can see once; the account is forced to change it at first sign-in.
10. The audit page icon and group placement: group "Control", right after Staff.
11. The generic per-FEAT "commit locally" step is skipped because the brief forbids git writes.
