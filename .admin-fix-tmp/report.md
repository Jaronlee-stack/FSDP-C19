# Admin portal fix: report

Branch `sam-admin-tweaking`. Nothing is staged or committed. Generated 2026-11-17 13:22.

## Source notes

- The PDF (`1. AikidoShinjukai_...pdf`) was **not read** (no text extractor on this machine). The plan relied on the .docx files and the JSON chat for scope.
- `docs/Architecture.md` and `docs/Design.md` are both **empty**. Conventions were taken from the code (`portal.js`, `portal.css`, `core.js`, `store.js`, `data.js`).
- The JSON chat contains "do not write code yet" instructions. They were aimed at that earlier chat and were not followed here.
- `prompts/` shows as untracked in git (it has never been committed). Its five files have a last-write time of 10:22, before work began, and were not edited.

## Requirement table

Status: Done = built and checked. Mock = built as a labelled mock, comment, or sample data. Deferred = none of the R-IDs; deferred scope is listed below. Evidence counts are passing checks from the final run (`verify\results.json`).

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| R01 | Role labels: FD = "Admin", BA = "Business Admin". Remove "HQ Admin" everywhere in admin... | Done | 17 checks pass (FEAT-001) |
| R02 | Sign-in: two tabs, Instructor / Admin. Admin type comes from the account, nobody choose... | Done | 1 checks pass (FEAT-001) |
| R03 | Demo accounts: `ADM-001` Business Admin, `ADM-101` Admin (HQ). Shown in the hint text. ... | Done | 3 checks pass (FEAT-001) |
| R04 | Sign-in copy: "For instructors and office staff. Accounts are issued by a Business Admi... | Done | 1 checks pass (FEAT-001) |
| R05 | Sign-in messages: deactivated account; "no access to that page"; "session expired". | Done | 7 checks pass (FEAT-001) |
| R06 | Store admin type, staff ID and name in the session. `role` stays `admin`. | Done | 3 checks pass (FEAT-001) |
| R07 | Per-role menus. FD: Today, Classes, Members, Payments, Registrations, Equipment, Follow... | Done | 5 checks pass (FEAT-001) |
| R08 | Phone tab bar: FD = Today, Classes, Members, Payments. BA = Overview, Insights, Classes... | Done | 2 checks pass (FEAT-001) |
| R09 | Page guard: BA-only pages redirect FD to their home with the message "That page is for ... | Done | 15 checks pass (FEAT-001) |
| R10 | BA-only buttons and sections are removed from the DOM for FD, not only hidden by CSS. | Done | 10 checks pass (FEAT-001,FEAT-002,FEAT-003) |
| R11 | Pages outside the menu (roster, member, register) highlight a parent item. | Done | no scripted check; see code (admin-shell.js / admin-*.js) |
| R12 | Sidebar shows role and the signed-in person's real name instead of "HQ Office". | Done | 2 checks pass (FEAT-001) |
| R13 | No centre switcher for FD or BA (both work only at HQ). | Done | 1 checks pass (FEAT-001) |
| R14 | Bell per role. FD: incomplete registrations, items to collect, follow-ups due, extensio... | Done | 2 checks pass (FEAT-001) |
| R15 | Hard-coded numbers come from data. | Done | 11 checks pass (FEAT-001) |
| R16 | Split `admin.js` by area. | Done | no scripted check; see code (admin-shell.js / admin-*.js) |
| R17 | Seed data for everything below, extending `SEED()` and `store.js` the same way as the e... | Done | 11 checks pass (FEAT-001) |
| R20 | FD home "Today · HQ Dojo · date". Buttons: New registration, Take payment, Find student... | Done | 5 checks pass (FEAT-002) |
| R21 | Four number cards: Sessions today, Attendance pending (highlighted `.alert`), Payments ... | Done | 4 checks pass (FEAT-002) |
| R22 | "Today's sessions" timeline: time, class colour, instructor, booked/capacity, waitlist,... | Done | 4 checks pass (FEAT-002) |
| R23 | "Waiting on you" list: expected arrivals with access warnings, items to collect, follow... | Done | 1 checks pass (FEAT-002) |
| R24 | No organisation-wide charts on FD home. | Done | 1 checks pass (FEAT-002) |
| R25 | Classes page, Rosters tab: day strip plus date picker, list of HQ classes with time, in... | Done | 7 checks pass (FEAT-002) |
| R26 | FD sees HQ classes only. | Done | 1 checks pass (FEAT-002) |
| R27 | Roster page `roster.html?class=<code>&date=<yyyy-mm-dd>`: header (class, date, time, in... | Done | 4 checks pass (FEAT-002) |
| R28 | Roster actions: Add walk-in, Book student (eligible only), Cancel booking (lesson credi... | Done | 9 checks pass (FEAT-002) |
| R29 | Corrections after submission open a modal asking for a reason. | Done | 3 checks pass (FEAT-002) |
| R30 | Ineligible or unbooked student: FD gets *Refer to Business Admin*; BA gets *Override wi... | Done | 7 checks pass (FEAT-002) |
| R31 | Walk-ins allowed only for guests holding a trial / day / week pass. Members must book. | Done | 2 checks pass (FEAT-002) |
| R32 | Walk-in guest quick record (name, mobile, email); mobile number detects repeat trials. | Done | 3 checks pass (FEAT-002) |
| R33 | A no-show uses the lesson unless an MC is approved. | Done | 1 checks pass (FEAT-002) |
| R34 | Debug-panel placeholder comment for moving the clock forward (Upcoming → Active → Finis... | Mock | 2 checks pass (FEAT-002); comment only |
| R35 | Payments, FD: *Take payment* flow: find student, choose what they owe (registration S$6... | Mock | 6 checks pass (FEAT-002); mock Stripe checkout |
| R36 | Payments number cards: Collected today, Outstanding, Processing. Tabs: Today, Outstandi... | Done | 10 checks pass (FEAT-002) |
| R37 | FD can only *Report a mistake* (sent to BA). BA can void or adjust with reason. | Done | 5 checks pass (FEAT-002) |
| R38 | FD can view refunds but cannot approve; can raise a refund request. BA approves. Button... | Done | 4 checks pass (FEAT-002) |
| R39 | Payments page also shows outstanding balances and payment failures to BA. | Done | 4 checks pass (FEAT-002) |
| R40 | Debug-panel placeholder comment for failed Stripe auto-payment (Payments or Revenue). | Mock | 1 checks pass (FEAT-002); comment only |
| R41 | Equipment page: To collect and Unpaid cards. Order table: member, item, size, payment s... | Done | 7 checks pass (FEAT-002) |
| R42 | Activating a registration creates the equipment request automatically (dogi, handbook, ... | Done | no scripted check; see code (admin-shell.js / admin-*.js) |
| R50 | Members: search by name, member no., phone, email, parent/guardian. Filters All, Active... | Done | 16 checks pass (FEAT-003) |
| R51 | Export CSV on Members is BA-only. | Done | 4 checks pass (FEAT-001,FEAT-003) |
| R52 | MC handling, two tickboxes *Return lesson* and *Extend expiry*, both ticked by default.... | Done | 16 checks pass (FEAT-003) |
| R53 | Unlimited plan: billing continues; MC is kept on record and the absence marked excused;... | Done | 2 checks pass (FEAT-003) |
| R54 | Compassion Guaranteed remains rule-based (up to 14 days on children's 1-month pass, no ... | Done | 2 checks pass (FEAT-003) |
| R55 | Registrations (`applications.html`): checklist per application (details complete, conse... | Done | 7 checks pass (FEAT-003) |
| R56 | FD actions: *Activate* (only when every auto-activation rule in Policies passes), *Requ... | Done | 9 checks pass (FEAT-003) |
| R57 | BA Exceptions tab: flagged registrations, extension requests beyond rule, access reques... | Done | 9 checks pass (FEAT-003) |
| R58 | Starting grade carried over is entered at registration and confirmed by BA once at acti... | Done | 4 checks pass (FEAT-003) |
| R59 | Assisted registration `register.html`: personal details (including **date of birth**), ... | Mock | 14 checks pass (FEAT-003); mock NS upload |
| R60 | 17–25 discount applied automatically from date of birth (no proof). 65+ gets 40%. NSF s... | Done | 5 checks pass (FEAT-003) |
| R61 | Student record `member.html?no=`: header (name, no., belt, centre, status chips, Adult/... | Done | 15 checks pass (FEAT-003) |
| R62 | FD can edit phone, email, emergency contact, guardian. FD sees belt, membership status ... | Done | 8 checks pass (FEAT-003) |
| R63 | Belt is read-only for everyone with the note "Changes through grading only". BA can cha... | Done | 8 checks pass (FEAT-003) |
| R64 | FD sees medical notes and MCs in full. NS papers and other sensitive documents: BA only... | Mock | 4 checks pass (FEAT-003); mock document preview |
| R65 | Student record shows 2-year re-registration status, package balance and expiry (max 2 p... | Mock | 4 checks pass (FEAT-003); seeded per-member record |
| R66 | Follow-ups page: tabs Newcomers not returned, Declining attendance (seen 14+ days), Ren... | Done | 5 checks pass (FEAT-003) |
| R67 | *Log contact* panel: method (call, WhatsApp, email, in person), outcome (reached, no an... | Done | 5 checks pass (FEAT-003) |
| R68 | Reminder text: declining attendance is a reason to get in touch, not proof about an ins... | Done | 1 checks pass (FEAT-003) |
| R69 | BA adds: create lists from criteria, assign people and due dates, reassign, review outc... | Done | 6 checks pass (FEAT-003) |
| R70 | "Low attendance flags" on BA Overview opens Follow-ups. | Done | 1 checks pass (FEAT-003) |
| R80 | BA Overview: period selector, switch Organisation / Today at HQ (second reuses FD layou... | Done | 9 checks pass (FEAT-004) |
| R81 | "Centres at a glance": occupancy, attendance trend, outstanding per centre; click opens... | Mock | 2 checks pass (FEAT-004); sample figures |
| R82 | "Waiting on you" for BA: exceptions, payment failures, import issues, promotion results... | Done | 2 checks pass (FEAT-004) |
| R83 | Business question cards: open another class here? / Why are newcomers leaving? / Which ... | Done | 2 checks pass (FEAT-004) |
| R84 | Classes, Timetable setup tab (BA): existing recurring-class table plus effective dates,... | Done | 11 checks pass (FEAT-002,FEAT-004) |
| R85 | Delete a Session keeps the Delete button. The confirmation shows upcoming bookings affe... | Done | 2 checks pass (FEAT-004) |
| R86 | Closures tab (BA): close HQ for a date range or cancel one class; shows affected studen... | Done | 8 checks pass (FEAT-004) |
| R87 | Insights (BA): shared filter bar (period, compare-to, centre, class type, time slot, ag... | Mock | 12 checks pass (FEAT-004); sample data |
| R88 | Revenue (BA): month's total received, breakdown by item, outstanding, failed payments l... | Done | 5 checks pass (FEAT-004) |
| R89 | Grading (BA): read-only list of grading applications and instructor results. Debug-pane... | Mock | 5 checks pass (FEAT-004); read-only list; demo apply button calls promote() |
| R90 | Reports (BA): date range and centre filters. Exports: attendance, progression, **real**... | Done | 8 checks pass (FEAT-004) |
| R91 | Policies (BA): tabs Packages & prices, Booking rules, Auto-activation rules for FD, App... | Done | 9 checks pass (FEAT-004) |
| R92 | Staff (BA): table of name, ID, role, status, last sign-in; drawer to change role, reset... | Done | 12 checks pass (FEAT-004) |
| R93 | Import issues (BA): list of failed or incomplete CSV imports (missing information, pipe... | Mock | 6 checks pass (FEAT-004); seeded rows, no pipeline |
| R94 | Notifications: FD sends approved templates to an HQ class or one student; no "All membe... | Done | 14 checks pass (FEAT-004) |
| R95 | FD never sees organisation-wide financial reports, prices editing, staff permissions, o... | Done | 8 checks pass (FEAT-004) |
| R96 | Debug-panel placeholder comments (five in total): grading pass/fail (`grading.html`), M... | Mock | 3 checks pass (FEAT-004); five comments only |
| R100 | Same visual design as existing portals: existing CSS classes, tokens, components, icon ... | Done | 31 checks pass (FEAT-001,FEAT-004) |
| R101 | 1280px and 390px both correct. | Done | 34 checks pass (FEAT-001,FEAT-002) |
| R102 | Relative data-root convention. | Done | no scripted check; see code (admin-shell.js / admin-*.js) |
| R103 | Student and instructor portals still work. | Done | 5 checks pass (FEAT-003) |
| R104 | Front end only, mock data, Express/Postgres later. A comment that role checks must be r... | Done | 2 checks pass (FEAT-001) |

## Decisions to confirm

| # | Issue | Reading used (as built) | Alternative |
|---|---|---|---|
| D1 | Centre switcher | None. Admin and Business Admin work at HQ only. Insights keeps a centre filter for imported non-HQ data. | Add a switcher if satellite staff get accounts. |
| D2 | Student-facing "Waiting for HQ" text | Left unchanged so the student portal is untouched. | Reword to "Waiting for the office". |
| D3 | Equipment stock and shortages | Not built (no stock tab, no shortage flag). | Add a stock tab later. |
| D4 | Grading is read-only, but promotions depend on `promote()` | Grading page has no Schedule or Approve controls. A per-result "Apply result (demo)" button calls the existing `promote()` so the student promotion demo still works. Starting-grade carry-over is confirmed by a Business Admin at activation and is disabled for the front desk. | Remove the button and apply results at submission from the instructor portal (needs an instructor change). |
| D5 | Delete session vs "End class from" | Delete is kept. The confirmation shows affected bookings and says lessons are returned. | "End from date". |
| D6 | JS split | `admin.js` kept for code edited in place. New areas are in `admin-shell.js`, `admin-desk.js`, `admin-members.js`, `admin-business.js`. | Full split later. |
| D7 | Sign-in tabs | Two (Instructor / Admin). The admin type comes from the account. | Three tabs. |
| D8 | MC approval limit for the front desk | 14 days, with an MC attached. Beyond that goes to Business Admin Exceptions. | A different limit. |
| D9 | Lessons returned per MC | +1 per approved MC, with a "Return lesson" and an "Extend expiry" tickbox, both on by default. Unlimited plans: neither applies and the absence is marked excused. | One lesson per missed booked class once a real attendance table exists. |
| D10 | Student bell text when expiry is not extended | Small additive edit in `portal.js`: shows "Lesson returned" or "Absence excused" instead of "Package extended". | Leave as before. |
| D11 | Audit log | No page. Reasons are stored on the record. | Add later. |
| D12 | Cost / ROI | Revenue tab only. | None. |
| D13 | Front desk notifications | An HQ class or one student, approved templates only. | None. |
| D14 | Refunds | Front desk views and raises requests. Business Admin approves. "Reject and refund" is now "Reject". | Remove refund requests. |
| D15 | Payment method | Stripe only, mock checkout at the desk, no QR image, no cash. | Add cash later. |

## Deferred

- Real authentication and server-side role checks (comment at top of `admin-shell.js`).
- CSV import pipeline and LLM conversion (Import issues is a list of seeded rows).
- Real Stripe (desk checkout and failed auto-payment are mocks).
- Real file upload and storage for NS proof, MC files and certificates (mock previews).
- Audit log, cost/ROI, stock tracking, newcomer conversion, QR and cash payments, reconciliation.
- The five debug panels themselves (placeholder comments only, starting `DEBUG PANEL (placeholder):`).
- `join.js` / `join.html` date of birth and NS upload (not changed).
- Optional inactivity sign-out for shared front desk computers.
- Student wording "Waiting for HQ" (D2).

## Additive edits to shared files

**`src/public/js/store.js`** (+48 / -3)
- `ADMIN` object read from `sessionStorage['ask-admin']`, `isBA()`, `signInAdmin()`.
- `signIn()` clears the admin session for other roles; `signOut()` also clears `ask-admin`.
- `admSeed` one-time migration for saved databases: 15 extra members, plus `mat`, `start`, `end`, `online` on each weekly class. Existing fields are not changed.

**`src/public/js/portal.js`** (+48 / -15)
- `ADMIN_PAGES` table and `adminPortal()` replace the fixed "HQ Admin" menu. Per-role labels, groups, phone tab list (`P.tabs`) and counts.
- `ADMIN_PARENT` map (roster, member, register highlight their parent).
- Guard: an admin session needs an admin type. A Business Admin page opened by the front desk redirects to `index.html?baonly`.
- Phone tab bar uses `P.tabs` when set. Rail renders group labels.
- Admin bell lists are computed per role. Student bell text handles `excused` and `extend === false`.

**`src/public/js/data.js`** (+112 / -1)
- New top-level SEED keys: `staff`, `ledger`, `refunds`, `exceptions`, `guests`, `equipment`, `followups` and the other office sample data. `checkIns` line only gained a trailing comma.

**`src/public/css/portal.css`** (+38 / -1)
- `.rail nav .grp` group labels and collapsed state, `.scan-pick > b` tweak.
- Front desk helpers: `.stat.alert` / `.stat.dark` in grids, `a.stat`, `.page-h .acts.wrap`, `.ag-item.desk`, `.desk-bar`, `.row-btn`, `.acts-inline`, `.sub-note` and a 640px rule.
- Members and records: `.chips`, `.tbl .who a`, `.rec-chips`, `.rec-sec`, `.mc-ticks`, `.row .grow .chips + .d`, disabled `.sbtn` in rows, a 640px rule.
- `.list-bar > .filters` so long tab rows scroll inside the bar on phones.
- All use existing colour and spacing variables. The one removed line is an edit of an existing rule.

Other changed files (not shared): `admin_portal/*.html`, `admin.js`, `staff-login.js`, and new `admin-shell.js`, `admin-desk.js`, `admin-members.js`, `admin-business.js`, `equipment.html`, `followups.html`, `imports.html`, `insights.html`, `member.html`, `policies.html`, `register.html`, `revenue.html`, `roster.html`, `staff.html`.

## Screenshot index

Folder: `c:\Users\CedrikHwang\FSDP-C19\.admin-fix-tmp\screens`. `fd-` = Admin (front desk), `ba-` = Business Admin. Suffix is the viewport width. All refreshed in the final run.

- `screens\ba-applications-exceptions-1280.png`
- `screens\ba-closures-1280.png`
- `screens\ba-closures-390.png`
- `screens\ba-dashboard-1280.png`
- `screens\ba-dashboard-390.png`
- `screens\ba-followups-1280.png`
- `screens\ba-grading-1280.png`
- `screens\ba-grading-390.png`
- `screens\ba-imports-1280.png`
- `screens\ba-imports-390.png`
- `screens\ba-insights-1280.png`
- `screens\ba-insights-390.png`
- `screens\ba-insights-pilot-1280.png`
- `screens\ba-member-1280.png`
- `screens\ba-notify-1280.png`
- `screens\ba-notify-390.png`
- `screens\ba-overview-1280.png`
- `screens\ba-overview-390.png`
- `screens\ba-overview-today-1280.png`
- `screens\ba-policies-1280.png`
- `screens\ba-policies-390.png`
- `screens\ba-policies-impact-1280.png`
- `screens\ba-reports-1280.png`
- `screens\ba-reports-390.png`
- `screens\ba-revenue-1280.png`
- `screens\ba-revenue-390.png`
- `screens\ba-sessions-390.png`
- `screens\ba-staff-1280.png`
- `screens\ba-staff-390.png`
- `screens\ba-staff-drawer-1280.png`
- `screens\ba-staff-drawer-390.png`
- `screens\ba-timetable-1280.png`
- `screens\fd-applications-390.png`
- `screens\fd-applications-drawer-390.png`
- `screens\fd-applications-extensions-1280.png`
- `screens\fd-applications-registrations-1280.png`
- `screens\fd-dashboard-1280.png`
- `screens\fd-dashboard-390.png`
- `screens\fd-equipment-1280.png`
- `screens\fd-equipment-390.png`
- `screens\fd-followups-1280.png`
- `screens\fd-followups-390.png`
- `screens\fd-member-1280.png`
- `screens\fd-member-390.png`
- `screens\fd-members-1280.png`
- `screens\fd-members-390.png`
- `screens\fd-notify-1280.png`
- `screens\fd-payments-1280.png`
- `screens\fd-payments-takepay-1280.png`
- `screens\fd-payments-takepay-390.png`
- `screens\fd-register-390.png`
- `screens\fd-register-done-1280.png`
- `screens\fd-roster-1280.png`
- `screens\fd-roster-390.png`
- `screens\fd-sessions-1280.png`
- `screens\fd-sessions-390.png`
- `screens\fd-today-1280.png`
- `screens\fd-today-390.png`

## Verification run

Command: `node .admin-fix-tmp\verify\verify-all.mjs` then `node .admin-fix-tmp\verify\regress.mjs` (Edge via playwright-core, local static server, external requests blocked).

| Script | Checks | Failed |
|---|---|---|
| FEAT-001 | 125 | 0 |
| FEAT-002 | 104 | 0 |
| FEAT-003 | 152 | 0 |
| FEAT-004 | 146 | 0 |
| REGRESS | 17 | 0 |

- Total in the final run: 544 checks, 0 failed. `verify-all.mjs` ended with "all scripts passed". `regress.mjs` was then run once more on its own: 17 of 17 passed.
- Regression covers instructor sign-in and gated grading, all six student pages, the student bell for "lesson returned" and "package extended", and no console errors.
- `results.json` is cumulative across runs. It still holds four older entries from earlier crashed runs (verify-feat2/3/4 and FEAT-001 "ran to completion"). They are from before fixes and are not part of the final run.
- Layout checks: no horizontal overflow at 1280 and 390 on all admin pages (R100/R101 checks), no console errors.

## Repository state (read-only git checks)

- `git diff --cached --name-only`: empty (nothing staged).
- Nothing modified in `.gitignore`, `app.js`, `database/` (`git diff` empty). No `.env*` changes. `prompts/` is untracked and was not touched (see Source notes).
- `.agents/` does not exist.