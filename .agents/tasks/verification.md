# Verification

## Ran
Throwaway node script (deleted afterwards) that walked `src/public/**/*.html`, checked every local `href`/`src` exists relative to its file, asserted every page has `data-root="../"`, checked `portal.js` dirs, and checked every `url('...html')` / `__ROOT__...html` literal in the JS (including the student, instructor and admin login redirect targets and sign-out targets) exists under `src/public`.

## Results
252 references checked, 6 reported, none real:
- 5 are false positives from the inline `<base href>` script (`' + p + '/`), which is intended and unchanged.
- 1 is `landingpage/index.html -> mascot-still.webp`, a pre-existing missing asset (no webp exists anywhere in the repo or its git history). Not changed, not caused by the portal move.

Redirect targets now existing: student login -> `student_portal/index.html`; instructor -> `instructor_portal/index.html`; admin -> `admin_portal/index.html`; signed-out guard -> `admin_portal/signin.html?denied` (staff) or `landingpage/login.html` (student); sign-out -> `admin_portal/signin.html` (staff) or `landingpage/index.html`.

Not run: a browser/live-server click-through. `app.js` is empty and there is no `package.json`, so there is no Express server to start (out of scope).

## Changes
- `js/portal.js`: portal `dir`/`login` values now point at `student_portal/`, `instructor_portal/`, `admin_portal/`, `admin_portal/signin.html?denied`, `landingpage/login.html`. This fixes the reported `/src/staff/index.html` error.
- `js/store.js`: sign-out and reset-demo redirects use `admin_portal/signin.html` / `landingpage/index.html`.
- `js/core.js`: side-menu footer links and the `GO` map use `landingpage/...`.
- `landingpage/js/login.js`, `landingpage/js/public.js`, `admin_portal/staff-login.js`: redirects/"My portal" link go to `student_portal/`, `<role>_portal/`.
- `data-root="../"` on all admin/instructor pages (was `../../`) and added to the 6 landing pages.
- Relative paths only, matching the existing scheme.
