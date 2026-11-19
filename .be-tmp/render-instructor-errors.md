# Render instructor page errors: investigation

Read-only. No files edited, no servers started, no external services called.

## 1. Summary answer

**Yes, it is a real bug in our code, and it is not specific to Render or Docker.** It would happen the same way on `http://localhost:3100` or plain `node app.js`.

`src/public/instructor_portal/index.html` is the only portal page that still uses the old script list. It loads `core.js, data.js, store.js, portal.js, vendor/qrcode.js, instructor.js` directly, and it **never loads `js/api.js`**. `ASK` is declared only in `api.js` (`const ASK = {...}`, api.js line 14). With no `api.js`, `store.js:10` (and `instructor.js:6`) reference an undefined global.

| # | Console error | Cause | Ours? |
|---|---|---|---|
| 1 | CSP `connect-src 'self'` blocks `data:text/plain;base64,...` | Browser extension or GPU upscaler (GPUOpen FidelityFX CAS shader) | No, noise |
| 2 | `store.js:10 ASK is not defined` | `api.js` is not in the page | Yes, root cause |
| 3 | `portal.js:23 isBA is not defined` | Knock-on: `store.js` threw at line 10, so `isBA` (line 15) never got defined | Yes, same root cause |
| 4 | `instructor.js:6 ASK is not defined` | Same as 2 | Yes, same root cause |

Fix: one line in `instructor_portal/index.html` (section 5, fix 1).

## 2. Error 1: the data: URL

Decoding the visible start of the base64 gives:

```
// https://github.com/GPUOpen-Effects/FidelityFX-CAS
// v3
uniform shader iChunk;
uniform float2 iMouse;
```

This is an AMD FidelityFX Contrast Adaptive Sharpening shader, the kind that video or image upscaler browser extensions inject. The tail of the string (`RGX3(xy, strength)`, `RGX2(xy).rgb`) is the same shader.

Nothing in this repo creates it. A search of `src` for `data:text`, `new WebSocket`, `EventSource` and `connect(` found only `src/config/db.js:19`, which is the pg `Pool` config, unrelated to the browser. The page makes no `fetch` to a `data:` URL.

The CSP that blocked it is in `src/middleware/security.js`. `'connect-src': ["'self'"]` is correct for this app, because every API call is same-origin (`/api/v1`). Other directives: `script-src 'self'` plus hashes of inline `<script>` blocks, `script-src-attr 'none'`, `img-src` includes `data:`, `font-src` includes `data:`, and `upgrade-insecure-requests` plus HSTS are added only when `NODE_ENV=production`.

Error 1 is harmless and unrelated. Do not loosen `connect-src`. To confirm, open the page in an Incognito window with extensions disabled and the message disappears (needs runtime check).

## 3. Errors 2 to 4: script load order

### What the instructor index page loads
`src/public/instructor_portal/index.html`, lines at the bottom:

```
<script src="../js/core.js"></script>
<script src="../js/data.js"></script>
<script src="../js/store.js"></script>
<script src="../js/portal.js"></script>
<script src="../js/vendor/qrcode.js"></script>
<script src="instructor.js"></script>
```

### What every other page loads
Every other portal page (all admin, student, landing pages and the instructor `grading.html` and `profile.html`) uses:

```
<script src="../js/core.js"></script>
<script src="../js/api.js" data-then="../js/store.js,instructor-data.js,../js/portal.js,instructor.js"></script>
```

A scan of every `.html` under `src/public` that loads `core.js` found exactly one without `api.js`: `instructor_portal/index.html`.

### How the boot works (src/public/js/api.js)
- `api.js` declares `const ASK` (line 14). It then runs an IIFE (boot section at the bottom).
- Boot: `Promise.all([GET /reference, GET /auth/me])`, then loads `data.js`, fills the constants, loads `account.js` if signed in, then loads the `data-then` scripts in order with `async=false`, then `coreReady()`.
- If any step fails, `ASK.ready.catch(bootFailed)` shows "This page could not load its data. Please refresh..." and loads no page scripts. That path does not produce `ASK is not defined`.

So with `api.js` present, `store.js` can never run before `ASK` exists, because it is injected only after `ASK` is defined. Failure modes (i) to (iii) from the brief do not apply:
- (i) Static script ordering: only applies to the instructor index, where `api.js` is missing altogether, so the order is irrelevant.
- (ii) `api.js` failing to load (404, MIME, CSP, syntax error): no, `api.js` is not requested on this page. The same file works for the other 30+ pages.
- (iii) Boot aborting and a fallback that still loads `store.js`: no fallback exists. `bootFailed` loads nothing.

### Where the line numbers come from
- `store.js:10`: `const AUTH = { role: ASK.me ? ASK.me.role : null };`
- `store.js:14-15`: `let ADMIN = ASK.me && ...` and `const isBA = () => ...`. These come after the throw, so they never execute. The script aborts at line 10, so `isBA` is never declared.
- `portal.js:22-23`: `function adminPortal() { const ba = isBA(), ...`. `portal.js:49` is `admin: adminPortal()` inside the `PORTALS` object literal, which is evaluated eagerly for every portal, including the instructor one. So `isBA()` is called on every portal page load, guarded by nothing. It is harmless when `store.js` loaded correctly (`ADMIN` is null, `isBA()` returns false), so this is not a separate bug. It only throws here because `store.js` died first.
- `instructor.js:6`: `const MY_INS = ASK.me ? ASK.me.name : '';`

### Why it happens: history
`git log` shows the instructor index was migrated to `api.js` in commit `50bc1b7` ("Backend integration finished") and on `origin/backend-integration`. Merge `dd8d754` ("Merge branch 'fix/my-changes' into database-integration") brought back the old script list for this file (it came from the QR check-in and instructor live card work in `f28161d`). That merge is the last commit to touch the file, and it is now on `main`.

`git diff 50bc1b7 HEAD --stat` over `instructor_portal` and `js` shows the file changed in the merge, along with `api.js`, `core.js`, `portal.js`, `vendor/qrcode.js`.

Note: the brief says branch `backend-integration`, but the working tree is on **`main`** (HEAD `e292f3f`, same as `origin/main`, clean). `origin/backend-integration` (6dbf1d0) still has the correct `index.html` with `api.js`, but it is not an ancestor of `main`, and it lacks the later `main` commits. If Render deploys `main`, it gets the broken page.

How Render surfaces it: the user logs in on `/admin_portal/signin.html`. The sign-in page itself works (it uses `api.js`), then redirects instructors to `/instructor_portal/`, which is the broken page. Login succeeding therefore tells us the database, JWT and cookies are fine on Render.

## 4. Render versus local: production-only differences

Because the root cause is a static HTML mistake, none of these explains the errors. They are the checklist for the next problem. None was run (needs runtime check).

- **Cookie**: `src/middleware/auth.js:12` sets `httpOnly, sameSite: 'lax', secure: config.isProd`. Behind Render's HTTPS this is fine. Login succeeding on Render shows it works.
- **JWT_SECRET**: `src/config/index.js` throws at startup if `NODE_ENV=production` and `JWT_SECRET` is missing. The service would not boot, so not the case here.
- **TRUST_PROXY**: `config.trustProxy` is false unless the env var is set (`app.js:13`). Behind Render's proxy, `req.ip` is then the proxy's address, so every user shares one rate-limit bucket. `express-rate-limit` ^8.7.4 also logs a validation error (`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`) on requests that carry `X-Forwarded-For`. In v8 these are logged to the console and do not throw. The limiters are mounted only on `POST /auth/login`, `POST /auth/forgot-password`, `POST /public/trial-bookings`, `POST /public/registrations` (`auth.routes.js:9,14`, `public.routes.js:13-14`), not on all of `/api`. So it cannot break `/reference` or `/auth/me`. It does mean all users share the 10-per-15-minute login limit. Set `TRUST_PROXY=1`.
- **PORT**: `config.PORT` reads `env.PORT` (default 3000), `app.js:34` listens on it. Render injects `PORT`, so this is fine. The Dockerfile `EXPOSE 3000` is informational.
- **DB SSL**: `src/config/db.js` builds the `Pool` from `config.db`; `ssl` is on only if `DB_SSL=true` (`config/index.js`, with `rejectUnauthorized:false`). Render Postgres requires SSL for external connections, so set `DB_SSL=true` when using the external URL. A wrong or missing DB makes every query fail and `/reference` return 500, which would show `bootFailed`, not these errors.
- **Empty database**: `docker-compose.yml` loads the schema and seed only into the compose Postgres, through `./database/docker:/docker-entrypoint-initdb.d`. `.dockerignore` excludes `database/docker`, and Render does not use compose. A fresh Render Postgres has no tables. Login only works if `database/db.sql` and `database/seed.sql` were loaded by hand (for example with `psql`). The user got as far as logging in, so the database was loaded, or login would have failed. If not, they would see 500 errors, not these.
- **CSP/HSTS**: `upgrade-insecure-requests` and HSTS only in production (`security.js`). All assets are same-origin, so no change. Google Fonts are allowed in `style-src` and `font-src`. A `preconnect` to fonts is just a hint.
- **Image contents**: `.dockerignore` excludes `node_modules, .env, .git, .claude, docs, tests, Ben Bot, database/docker, *.log`. `src/public/**` is not excluded, so `api.js` and all page scripts are in the image. (Also, `.env` is not in the image, so all configuration must come from Render env vars. `Ben Bot` is not in the image either, so the Ben vault would be missing.) `Dockerfile` runs `COPY . .` as user `node`.
- **APP_FAKE_TODAY**: ignored in production (`config/index.js`) with a warning. The seed is anchored on 2026-11-06, so on Render the "today" is the real date and the seeded classes and sessions will not line up with today. The instructor Today page may look empty. This is expected, not a bug.

## 5. Recommended fixes (ordered by likelihood)

1. **`src/public/instructor_portal/index.html`**: replace the six bottom `<script>` lines with the pattern used by the sibling pages:
   ```
   <script src="../js/core.js"></script>
   <script src="../js/api.js" data-then="../js/store.js,instructor-data.js,../js/portal.js,../js/vendor/qrcode.js,instructor.js"></script>
   ```
   `vendor/qrcode.js` was added on `main` for the QR work. The `data-then` list must keep `instructor-data.js` before `portal.js`, as `grading.html` and `profile.html` do. Check whether `instructor.js` uses `qrcode.js`; keep it before `instructor.js` if so. Also check that `instructor-data.js` still matches what `instructor.js` expects (needs runtime check, since `main` has changed `instructor.js`).
   Then commit, push, and redeploy on Render.
2. **Check what Render deploys.** The branch must contain the fix. `main` has the broken file, `origin/backend-integration` has the old working version but lacks later `main` work.
3. **Render environment variables**: `NODE_ENV=production`, `JWT_SECRET` (long random), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL=true`, `TRUST_PROXY=1`. Leave `PORT` to Render. Do **not** set `APP_FAKE_TODAY`. Optional: `BREVO_API_KEY`, `TELEGRAM_*`.
4. **Database**: load `database/db.sql` then `database/seed.sql` into the Render Postgres once (for example `psql "<external URL>" -f database/db.sql -f database/seed.sql`). Needs runtime check whether this was done. Note that the seed is anchored on 2026-11-06, so classes will not match today's date.
5. Ignore error 1, or test in Incognito.
6. Optional hardening (not needed now): a small test or script that asserts every `.html` that loads `core.js` also loads `api.js`, so a merge cannot reintroduce this.

## 6. What could not be verified

- **Local Docker repro**: `docker compose ps` returned no running containers and `http://localhost:3100` refused the connection, so the app was not up. No headless browser run was made, and no production-mode `node app.js` run was made.
- Because the cause is visible in the HTML itself (no `api.js` tag), a runtime reproduction would show the same errors 2 to 4 on any host. This is high confidence from static reading. Needs runtime check: open `/instructor_portal/` locally after the fix and confirm the console is clean apart from extension noise.
- `express-rate-limit` v8 behavior with an unexpected `X-Forwarded-For` (logs, does not throw) is from library knowledge, not run here. Needs runtime check.
- Render settings, the Render database state and which branch Render builds are not visible from the repo. Needs runtime check.
