# ASK backend and front-end rewire

The change adds an Express 5 + PostgreSQL API under `/api/v1` (JWT in an httpOnly cookie, role and admin-type guards, zod validation, service/model layering). It also rewires all portals (landing, student, instructor, admin) to load data from the API instead of localStorage, and extends `database/db.sql` with the extra tables and columns the pages need. The QR check-in stays a mockup and the admin role split follows `ADMIN_PAGES`. I re-ran every suite and the browser run myself and read the auth, security, routing, model and service code.

Watch for: (1) `JWT_SECRET` in production only fails fast when it is missing, so the placeholder from `.env.example` would be accepted (possible, non-blocking). (2) `.vscode/settings.json` is an untracked IDE file and should not be committed (confirmed, non-blocking). (3) `npm test` is a placeholder; coverage lives only in `.be-tmp/verify` (confirmed, Deferred).

**Verdict**: APPROVED

## High-level view

Requests flow `route -> authenticate/requireRole/requireAdminType/validate -> controller -> service -> model`. All SQL sits in `src/models` with bound parameters. The only string interpolation is whitelisted (sort maps, column lists, validated identifiers in `nextId`). Business rules (ownership, waitlist, package sweep, Business-Admin-only checks inside desk routes) are in services and models, so they hold without the front end.

Sign-in uses a generic 401 for unknown account and wrong password, with a dummy bcrypt compare on the unknown-account path. The deactivated-account message appears only after the password is proven. The cookie is httpOnly and SameSite=Lax, and Secure only in production. Every request re-reads the account, so deactivation takes effect at once. Helmet runs with an explicit CSP (inline script allowed by hash, `script-src-attr 'none'`). Mutating API calls must be JSON (415 otherwise). Login and public writes are rate limited.

The browser side holds nothing but the three UI preferences (`ask-rail`, `ask-home-view`, `ask-sound`). Admin pages are gated by the same split as `ADMIN_PAGES` in `portal.js`, and the server enforces it with `requireAdminType('business')` on each Business Admin route.

`db.sql` stays re-runnable (DROP IF EXISTS first) and changes are additive or widening. `seed.sql` is untouched. The check-in page is still an in-memory mock and renders without errors.

<details>
<summary>Issues (3)</summary>

1. **JWT_SECRET placeholder accepted in production (possible)** — `config/index.js` rejects a missing secret but not `change_me_to_a_long_random_string` or a very short value. Reject known placeholders or enforce a minimum length when `NODE_ENV=production`.
2. **Untracked `.vscode/settings.json` (confirmed)** — IDE auto-approve setting, not part of the project. Leave it out of the commit.
3. **No real unit-test script (confirmed, Deferred)** — `npm test` runs a placeholder. The verification suite in `.be-tmp/verify` is outside the repo deliverable. Move it into `tests/` when the team wants CI.

</details>

<details>
<summary>Details</summary>

### Verification re-run

`node .be-tmp/verify/run-all.mjs` passed 12 of 12 suites (1551 checks) plus 5 static checks: no SEED/save/DB_KEY/demo leftovers, localStorage only for UI preferences, no SQL outside `src/models`, no `qr_token` or `password_hash` in controllers/routes/middleware, and production start without `JWT_SECRET` fails. `npm ci` found 0 vulnerabilities. `npm test -- --runInBand` ran the placeholder. The browser suites visit every page of the student, instructor, Business Admin and front desk portals at 1280 and 390 px and collect console errors, page errors, failed same-origin requests and HTTP >= 400. The only allow-list entries (403, 401, 409) cover refusals that the test provokes on purpose (front desk sent away from Business Admin pages, failed logins). My own grep of `src/public` found no data or auth use of storage. The remaining `seed` hits in `core.js` and `student.js` are pseudo-random generators for the QR picture and the demo chart.

### Role matrix

Business Admin pages (insights, revenue, grading, reports, policies, staff, imports) map to routes guarded by `requireAdminType('business')` in `business.routes.js` and `staff.routes.js`. The guard is on each route, so an unlisted path stays a 404. Desk routes sit behind `requireRole('admin')`. Belt, status, dojo, booking override and starting-grade actions are checked in the service and return `403 BUSINESS_ADMIN_ONLY`. The front-end sidebar and the page guard match the server.

### Secrets and git state

Nothing is staged, HEAD is still `769e384`, and `.env`, `.gitignore` and `prompts/` have no diff. `.env` is git-ignored (and absent). `.agents/` does not exist. The secret pattern scan only matched the placeholders in `.env.example`.

### Database script

The removals in the `db.sql` diff are widened CHECK lists and a column type widened from VARCHAR(255) to TEXT. No column or table is dropped beyond the existing DROP IF EXISTS header. The new tables are `class_waitlist` and `class_feedback_prompt`. `class_feedback` stays anonymous by keeping the answered-prompt state in a separate table.

</details>

<details>
<summary>File map</summary>

Backend (new): `app.js`, `src/config`, `src/middleware`, `src/routes`, `src/controllers`, `src/services`, `src/models`, `src/validators`, `src/utils`, `package.json`. Front end: every page in the four portals plus `js/api.js` and one data module per portal. Database: `database/db.sql`, `database/README.md`. Docs: `README.md`, `.env.example`. Full diff: `git status` / `git diff` on branch `backend-integration`.

</details>
