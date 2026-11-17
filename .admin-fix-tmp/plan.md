# Admin portal fix: implementation plan

Branch `sam-admin-tweaking`. Static HTML/CSS/vanilla JS, no backend. Constraints from the brief apply throughout: nothing is committed or staged, `prompts/`, `.env*`, `.gitignore`, `app.js`, `database/` and `.agents/` are untouched, source files are edited only with file-edit tools, and shared JS/CSS changes are additive so the student and instructor portals keep working.

## 0. What I read and how to cite it

| Source | Notes |
|---|---|
| `Admin Roles Prompt.docx` (**RP**) | Read in full. Two roles: Front-desk Admin (FD) and Business Admin (BA, "previously HQ Admin", inherits FD). Capability tables, FD boundaries, FD home layout, BA dashboard questions. Footnote: "technically refunds are not allowed by the policy". |
| `Admin Web Page Structure Planning.json` (**J**) | An exported chat of 8 messages. **J1** = assistant page plan, **J2** = user answers, **J3** = assistant conflicts and defaults, **J4** = user answers, **J5** = assistant settled-decisions table, **J6** = user answers, **J7** = assistant final summary. J7 states that later turns override earlier ones. **J2, J4, J6 are the user's own words and win over assistant text (J1, J3, J5, J7) wherever they differ.** |
| `Main notes.docx`, `Info from website.docx` | Supporting context. Used for prices (S$60 registration, S$48 annual dues, packages), class types, the 4-hour cancellation rule, and 1 month / 1 day booking limits. |
| `1. AikidoShinjukai_...pdf` | Not extracted (no `pdftotext` on this machine). It is supporting context only. J3 and J5 already quote it for scope. Say so in the final report. |
| `docs/Architecture.md`, `docs/Design.md` | Both files are **empty (0 bytes)**. `docs/UX.md` (generic UX checklist) and `docs/writeup.md` (examiner-grading plan) are the only usable docs. The real conventions come from the code: `portal.js` shell, `portal.css` components, `core.js` helpers, `store.js` + `data.js` SEED. |
| Instruction-like text inside the documents | J1 first message says "Do not generate code ... Do not start coding until I tell you to", and J2/J4/J6 repeat "Do not create code until I tell you to". These were instructions to the chat that produced the plan. They conflict with this task (implement now), so they are ignored. Report this. |
| `.docx` text | Extracted on a copy under `%TEMP%\adm` (already done). `prompts\` was not modified. |

Current code facts the plan depends on:
- Admin pages (`src/public/admin_portal/`): `index, applications, members, sessions, grading, payments, notify, reports` share one `admin.js`; `signin.html` + `staff-login.js` is the staff login for instructors and admin.
- `portal.js` holds `PORTALS.admin` (one fixed 8-item menu, label "HQ Admin", `me = ['HQ','HQ Office','Administrator']`). It builds the sidebar, top bar, phone tab bar (first 4 + "More" when more than 5 pages), the bell, and guards the page with `AUTH.role === PORTAL`. The active page highlight falls back to the first page when `PAGE` is not in `pages` (this is the "parent page" problem from J1).
- `store.js` keeps `AUTH.role` in `sessionStorage['ask-role']` and the prototype DB in `localStorage['ask-prototype-v3']`. Load = `Object.assign(SEED(), saved)`, so **new top-level SEED keys appear automatically for users with an old saved DB, but new fields on existing arrays do not**. Existing migrations use flags (`rmSeed`, `fbSeed`). Follow that pattern (`admSeed`).
- Hard-coded values: `1,248` members (members.html, index.html stat, notify preview), `S$42,600` and the 6-row `pays` array (payments), `5 students not seen` (index.html), `data-count="4"`, `"23"`, `"7"`, `"3"`.
- Conflicts the JSON lists, all confirmed present in code: `openMember` lets any admin edit grade/status/dojo; "Reject and refund" in `openApp`; `Delete session`; hard-coded numbers; "HQ" wording; export and "All members" open to everyone; "Low attendance flags" links to `members`.
- Encoding: the HTML/JS files are UTF-8 (they contain `·`, `—`, `•`). PowerShell 5 shows them as mojibake. Edit tools must preserve UTF-8. Final check: read a changed file with `read_file` and confirm `·` still looks right.
- Student bell (`portal.js`) and student `student.js` read `MC_REQS` fields `status, days, newExp, passName, reason, no`. Instructor `submitExam` pushes into `PROPOSALS` and `GRADE_FB` with status `'Sent to HQ'`; student `student.js:454` pushes into `GRAD_APPS`. Admin `promote()` is what completes the student's promotion and level-up. **Keep those field names and that chain working.**

### Precedence rules used to read J
1. User answers (J2, J4, J6) override everything.
2. Later assistant tables (J5, J7) override earlier ones (J1, J3) where the user did not object.
3. "Default" in J4 and J6 means the user accepted the assistant default in the preceding message.

### Final scope after precedence (what the plan builds)

Roles: **Admin** (FD) and **Business Admin** (BA). Both work only at HQ. No centre switcher. FD manages HQ classes only.

| Page | File | FD | BA |
|---|---|---|---|
| Sign-in | `signin.html` | Instructor / Admin tabs | same |
| Home | `index.html` | "Today" | "Overview" |
| Classes | `sessions.html` | Rosters | Rosters, Timetable, Closures |
| Roster (no menu item) | `roster.html` | yes | yes + override |
| Members | `members.html` | yes, no export | yes, export |
| Student record (no menu item) | `member.html` | limited | full |
| Registrations | `applications.html` | Registrations, Extensions | + Exceptions |
| Assisted registration (no menu item) | `register.html` | yes | yes |
| Payments | `payments.html` | take payment, outstanding, daily summary | + failed, refunds approval |
| Equipment | `equipment.html` | yes | yes |
| Follow-ups | `followups.html` | work assigned lists | + create/assign/review |
| Notifications | `notify.html` | HQ class / one student, approved templates | + all members, by grade |
| Insights | `insights.html` | no | yes |
| Revenue | `revenue.html` | no | yes |
| Grading | `grading.html` | no | read-only |
| Reports | `reports.html` | no | yes |
| Policies | `policies.html` | no | yes |
| Staff | `staff.html` | no | yes |
| Import issues | `imports.html` | no | yes |

Dropped by the user: audit log page and all "logged" behaviour, cost/ROI, equipment stock, Newcomers tab / conversion / referral source, FD centre switching, QR/cash payments, reconciliation screen.

---

## 1. Requirement checklist

Columns: ID, requirement, source, approach (files), FEAT that implements it. FEAT-001 = shell and data, FEAT-002 = desk operations, FEAT-003 = members and registrations, FEAT-004 = business and control pages.

### A. Roles, sign-in, shell (FEAT-001)

| ID | Requirement | Source | Approach and files |
|---|---|---|---|
| R01 | Role labels: FD = "Admin", BA = "Business Admin". Remove "HQ Admin" everywhere in admin UI. "HQ" stays only as the dojo name. | J2 "Change 'HQ Admin' wording"; RP "Previously referred to as HQ Admin"; J1 §5.5 | `portal.js` admin label/`me`; `signin.html` tab text and copy; `applications.html` "waiting for HQ"; `notify.html` placeholder; `admin.js` strings; phone line "HQ office" becomes "the office". Student-facing "Waiting for HQ" copy in `student.js` is left (see D2). |
| R02 | Sign-in: two tabs, Instructor / Admin. Admin type comes from the account, nobody chooses their access level. | J1 §4 sign-in recommendation; J3 §4 "Sign-in"; J4 "Default" | `signin.html`, `staff-login.js`. Look up the ID in `DB.staff`. |
| R03 | Demo accounts: `ADM-001` Business Admin, `ADM-101` Admin (HQ). Shown in the hint text. Keep `ADM-###` format. | J1 §4; J3 §4 | `data.js` SEED `staff`; `staff-login.js` hint switches per typed ID. |
| R04 | Sign-in copy: "For instructors and office staff. Accounts are issued by a Business Admin." Remove HQ mentions. | J1 §4 | `signin.html`, `staff-login.js` `STAFF_ID` hints. |
| R05 | Sign-in messages: deactivated account; "no access to that page"; "session expired". | J1 §4 | `staff-login.js` reads `?denied`, `?expired`, `?deactivated`; `portal.js` redirects with these. |
| R06 | Store admin type, staff ID and name in the session. `role` stays `admin`. | J1 §2 | `store.js`: additive `ADMIN` object from `sessionStorage['ask-admin']`, `signInAdmin()`, `isBA()`; `signOut()` clears it. |
| R07 | Per-role menus. FD: Today, Classes, Members, Payments, Registrations, Equipment, Follow-ups, Notifications. BA: the same 8 (Home called Overview) under a "Front desk" group, plus Management (Insights, Revenue, Grading, Reports) and Control (Policies, Staff, Import issues). | J1 §3 (menus); J3 §4; J5 (audit dropped, Finance becomes Revenue); J7 (Import issues added next to Staff and Policies) | `portal.js`: `PORTALS.admin.pages` built per role by a function; group labels rendered in the rail (additive `.rail nav .grp` rule in `portal.css`). |
| R08 | Phone tab bar: FD = Today, Classes, Members, Payments. BA = Overview, Insights, Classes, Members. Rest under "More". | J1 §3 | `portal.js`: optional `P.tabs` array used by the tab bar. Additive. |
| R09 | Page guard: BA-only pages redirect FD to their home with the message "That page is for Business Admins" (not to sign-in). No admin type in session sends to sign-in with "session expired". | J1 §2 "Blocking pages" | `portal.js` guard; `admin-shell.js` shows the toast from `?baonly`. |
| R10 | BA-only buttons and sections are removed from the DOM for FD, not only hidden by CSS. | J1 §2 | `admin-shell.js` `stripBA()` removes `[data-ba]` before page scripts run; page scripts also check `isBA()` before rendering BA controls. |
| R11 | Pages outside the menu (roster, member, register) highlight a parent item. | J1 §2 | `portal.js` `PARENT = { roster:'sessions', member:'members', register:'applications' }`, used when computing `cur`. |
| R12 | Sidebar shows role and the signed-in person's real name instead of "HQ Office". | J1 §2 | `portal.js` `me` from `ADMIN`: e.g. "Admin · HQ Dojo" / "Business Admin". |
| R13 | No centre switcher for FD or BA (both work only at HQ). | J2 "FD and BA admins are only located at the HQ location"; J3 §1 #6; J5 | Nothing to build. BA Insights keeps a centre filter because imported non-HQ data exists. |
| R14 | Bell per role. FD: incomplete registrations, items to collect, follow-ups due, extension requests. BA: exceptions, payment failures, import issues, promotion results. | J1 §2 | `portal.js` `openNotifs()` admin branch, values computed from DB. |
| R15 | Hard-coded numbers come from data. | J1 §5.4; J2 "Hard-coded data will be replaced" | `admin-*.js` compute counts from `MEMBERS`, ledger, `APPS`, etc. |
| R16 | Split `admin.js` by area. | J2 "Split the JS files if you see fit"; J3 §4 | New `admin-shell.js` (role helpers, guards, wording, shared rendering), `admin-desk.js`, `admin-members.js`, `admin-business.js`. `admin.js` stays for existing code that is edited in place (see D6). Every admin page loads `core, data, store, portal, admin-shell` then its own scripts. |
| R17 | Seed data for everything below, extending `SEED()` and `store.js` the same way as the existing code. | Brief | `data.js` new SEED keys; `store.js` `admSeed` migration for new fields on existing arrays (more members, class fields). |

### B. Front desk core (FEAT-002)

| ID | Requirement | Source | Approach and files |
|---|---|---|---|
| R20 | FD home "Today · HQ Dojo · date". Buttons: New registration, Take payment, Find student, Walk-in guest. | J1 §4 Home FD; J3 §4 "Today (FD): HQ classes only. Add a Walk-in guest button." | `index.html`, `admin-desk.js` `renderToday()`. |
| R21 | Four number cards: Sessions today, Attendance pending (highlighted `.alert`), Payments needing attention, Incomplete registrations. Each opens its page. | J1 §4; RP "Home page Suggested Layout" | `.stat` cards computed from the day's classes, ledger, `APPS`. |
| R22 | "Today's sessions" timeline: time, class colour, instructor, booked/capacity, waitlist, status (Upcoming / Check-in open / Attendance pending / Done), *Open roster* button. | J1 §4; J3 "Class statuses"; Main notes (active from 30 min before, 1 hour) | `classState(date, cls, now)` helper in `admin-shell.js`. |
| R23 | "Waiting on you" list: expected arrivals with access warnings, items to collect, follow-ups due, incomplete registrations, compassion/MC extensions. | J1 §4; RP FD home layout | `admin-desk.js`. |
| R24 | No organisation-wide charts on FD home. | RP FD home layout | Keep FD home free of `.bars` and sparks. |
| R25 | Classes page, Rosters tab: day strip plus date picker, list of HQ classes with time, instructor, booked/capacity, waitlist, status. Week view with spaces left. | J1 §4 Classes | `sessions.html`, `admin-desk.js`. Reuse `.fpill` tabs, `.tbl`, `.sess`/`.ag-day` styles already in `portal.css`. |
| R26 | FD sees HQ classes only. | J4 "FD should only manage HQ classes. External classes are managed by their respective external parties." | Rosters filter `dojo === HQ`. Non-HQ appears only in BA Timetable. |
| R27 | Roster page `roster.html?class=<code>&date=<yyyy-mm-dd>`: header (class, date, time, instructor, access rule), strip Booked / Checked in / Walk-ins / Waitlist, table with Student + member no., Belt, Access check (Eligible / package expiring / dues unpaid / below grade), How booked, Present/No-show toggle. | J1 §4 roster; RP Attendance | New `roster.html`, `admin-desk.js`. Access rules from `CLASS_RULES` and `whyNot`. A parameterised `whyNotFor(person, cls)` is added in `admin-shell.js` (no change to `data.js` `whyNot`). |
| R28 | Roster actions: Add walk-in, Book student (eligible only), Cancel booking (lesson credit returned if at least 4 hours before), Waitlist in order with *Offer spot*, Submit attendance. | J1 §4; Main notes (booking window 1 month ahead / 1 day min, 4-hour refund) | `admin-desk.js`; state in `DB.rosters['<date>|<time>']`. |
| R29 | Corrections after submission open a modal asking for a reason. | RP "correct mistakes with a reason"; J1 §4 (audit log part dropped by J4/J5) | `openModal` with required textarea; reason stored on the roster record. |
| R30 | Ineligible or unbooked student: FD gets *Refer to Business Admin*; BA gets *Override with reason*. Nothing is bypassed silently. | RP "Refer exceptions rather than bypassing restrictions silently"; J3 §3 "Not booked" default; J4 "Default" | `admin-desk.js` roster; referrals go into `DB.exceptions`. |
| R31 | Walk-ins allowed only for guests holding a trial / day / week pass. Members must book. | J2 "walk-ins should not be allowed for regular students and only for trial/day pass guests"; J4 "How guest purchases the pass is out-of-scope" | Walk-in picker lists `DB.guests` with a valid pass only. |
| R32 | Walk-in guest quick record (name, mobile, email); mobile number detects repeat trials. | J3 §3; J5 "Guests (lighter record)" | `admin-desk.js` modal. Duplicate mobile on a used trial shows a warning. |
| R33 | A no-show uses the lesson unless an MC is approved. | J3 §4 Classes | Roster no-show note text; MC flow in R52. |
| R34 | Debug-panel placeholder comment for moving the clock forward (Upcoming → Active → Finished) in the roster/classes page. | J6 #7 "Yes, add placeholder comments"; J7 | HTML comment only. No UI. |
| R35 | Payments, FD: *Take payment* flow: find student, choose what they owe (registration S$60, annual dues S$48, package, grading fee, item), prices read-only from Policies, discounts applied by rule (age discount from date of birth), approved method only, receipt PDF. | J1 §4 Payments; RP In-person payments; J4 "Payments: Stripe only" | `payments.html`, `admin-desk.js`. Method = **Stripe Checkout at the desk** (mock). No cash, no QR code screens (J4 "QR code payment not required"). PDF from `makePDF()` in `core.js`. |
| R36 | Payments number cards: Collected today, Outstanding, Processing. Tabs: Today, Outstanding (with *Collect*), Daily summary (today's desk payments and total, submit and lock, PDF). | J1 §4; RP "daily collection summary"; J3 row 7 | `admin-desk.js`; ledger in `DB.ledger`. |
| R37 | FD can only *Report a mistake* (sent to BA). BA can void or adjust with reason. | J1 §4 Payments | FD button posts to `DB.exceptions`; BA button `data-ba`. |
| R38 | FD can view refunds but cannot approve; can raise a refund request. BA approves. Button wording separates "Lesson returned" (automatic) from "Money refund" (BA exception). | J2 "FD should be able to view the refund but not approve"; J3 §2 Refunds | `DB.refunds`; list shown on Payments for both roles, Approve/Decline `data-ba`. |
| R39 | Payments page also shows outstanding balances and payment failures to BA. | J4 "BA should also be able to review outstanding balances and payment failures"; RP Financial oversight | BA-only "Failed payments" tab. |
| R40 | Debug-panel placeholder comment for failed Stripe auto-payment (Payments or Revenue). | J6 #7; J7 | HTML comment. |
| R41 | Equipment page: To collect and Unpaid cards. Order table: member, item, size, payment status, status. Status flow Requested → Ready at HQ → Handed over. *Mark handed over* records collector name. | J1 §4 Equipment as amended by J2 ("full inventory out-of-scope ... FD updates when received/distributed"), J3 row 9, J5 | New `equipment.html`, `admin-desk.js`. **No stock tab, no low-stock, no shortage flag** (J3 row 9, J5 settled). |
| R42 | Activating a registration creates the equipment request automatically (dogi, handbook, belt). Satellite students collect at HQ. | J2 "the system automatically sends a request"; J3 §3 | Done in `approveApp` path (FEAT-003) pushing to `DB.equipment`. |

### C. Members, registrations, follow-ups (FEAT-003)

| ID | Requirement | Source | Approach and files |
|---|---|---|---|
| R50 | Members: search by name, member no., phone, email, parent/guardian. Filters All, Active, Lapsed, Expiring soon, Outstanding balance, New (90 days or less), Guests. Columns Member, Belt, Centre, Package (balance and expiry), Membership, Last seen. Row click opens `member.html?no=`. Quick-edit drawer removed. | J1 §4 Members; J3 §4 Members ("Guests" filter) | `members.html`, `admin-members.js`. Table uses `.tbl` (cards on phones via `autoLabelTables`). |
| R51 | Export CSV on Members is BA-only. | J2 "Lock down exports ... to BA-only" | Button has `data-ba`. |
| R52 | MC handling, two tickboxes *Return lesson* and *Extend expiry*, both ticked by default. Approve by FD or BA when an MC covers the dates and is 14 days or less; no MC, or more than 14 days, goes to BA (Exceptions). MC is only for HQ classes. | J4 "MC should return a missed class credit and also push back the expiry date"; J6 note, point 4 "Default"; J3 §2 "FD approving MCs"; J2 "FD and BA should be able to approve MC" | `applications.html` Extensions tab; rewrite `openMCReq` / `approveMC` in `admin-members.js` (moved from `admin.js`). Keep `MC_REQS` field names. Adds `returnLesson`, `extend`. |
| R53 | Unlimited plan: billing continues; MC is kept on record and the absence marked excused; no lesson to return, no expiry to extend. | J6 point 3 + J7 "My default" | In `approveMC`: if the pass is Unlimited (or absent), skip both effects and show a note in the drawer. |
| R54 | Compassion Guaranteed remains rule-based (up to 14 days on children's 1-month pass, no MC), FD can confirm. | J1 §4 Extensions; `data.js` `COMPASSION_DAYS` | Same drawer; kind `compassion`. |
| R55 | Registrations (`applications.html`): checklist per application (details complete, consent signed, paid, medical declared, guardian consent for minors, returning member / 2-year rule, grade carry-over). Status chips Ready to activate / Missing info / Needs review. | J1 §4 | `renderApps()` rewritten in `admin-members.js`. Uses existing `.pill`. |
| R56 | FD actions: *Activate* (only when every auto-activation rule in Policies passes), *Request missing info*, *Flag for review* (reason). No refund button: "Reject and refund" becomes just "Reject". | J1 §4; J3 §2 Refunds; RP "Front-desk Admin should not ... approve discretionary refunds" | `openApp` edited. Flagged items go to BA Exceptions. |
| R57 | BA Exceptions tab: flagged registrations, extension requests beyond rule, access requests, mistakes reported, refund requests. Approve or decline with a reason. | J1 §4 Exceptions; RP Policies and exceptions | `data-ba` tab; `DB.exceptions`. |
| R58 | Starting grade carried over is entered at registration and confirmed by BA once at activation; belt is not editable otherwise. | J3 §1 row 3; J2 "Belt grade should not be editable by FD and BA. Only through grading." | Activation drawer: grade select is disabled for FD with the text "Confirmed by Business Admin". See D4. |
| R59 | Assisted registration `register.html`: personal details (including **date of birth**), consent (PDPA and terms), on-screen signature (`signaturePad()` in `core.js`), dogi size, package, Stripe payment (mock), **NS proof upload (mock)**. Finds an existing External member and adds ASK membership (S$60 + annual dues). | J1 §4 `register.html`; J6 point 1, 6; J7 "External and ASK members are separate"; J7 "Join form" | New `register.html`, `admin-members.js`. Built with `forms.css` fields. `join.js` is **not** changed (J6: "and to join.js if that file is changed"). |
| R60 | 17–25 discount applied automatically from date of birth (no proof). 65+ gets 40%. NSF shows verified label; FD cannot open NS papers. | J6 point 5; Info from website (Discounts); J4 "NS ... only visible to BA" | `discountFor(dob, nsVerified)` in `admin-shell.js`, used by register and take-payment. |
| R61 | Student record `member.html?no=`: header (name, no., belt, centre, status chips, Adult/Child with guardian), buttons Book a class, Take payment, Log contact, Send message, tabs Overview, Bookings, Attendance, Payments, Progress, Equipment, Follow-ups, Contact. | J1 §4 | New `member.html`, `admin-members.js`. Tabs reuse `.fpill` pattern. |
| R62 | FD can edit phone, email, emergency contact, guardian. FD sees belt, membership status and principal dojo read-only. | J2 "Make FD read-only for belt info, membership status, and dojo"; J5 data table | `openMember` replaced. Home address is "not collected" (J5), so no address field. |
| R63 | Belt is read-only for everyone with the note "Changes through grading only". BA can change membership status and principal dojo with a reason. | J2 "Belt grade should not be editable"; J3 §4 Student record | BA drawer with required reason field. |
| R64 | FD sees medical notes and MCs in full. NS papers and other sensitive documents: BA only (FD sees "Verified" / "On file"). | J2 "FD should be able to see the full note"; J4 "FD can see medical notes and MCs only"; J5 table | `data-ba` document buttons; mock document modal. |
| R65 | Student record shows 2-year re-registration status, package balance and expiry (max 2 packages), unlimited plan dates, payment history with receipt reprint, outstanding, class ratings only as totals. | J5 data table | Seeded `DB.memberInfo[no]` with a deterministic default generator in `admin-members.js` so every member has a record. |
| R66 | Follow-ups page: tabs Newcomers not returned, Declining attendance (seen 14+ days), Renewals coming up (dues/package within 30 days), Assigned to me. Row: student, reason, last seen, phone, attempts, due date. | J1 §4; RP Student follow-up | New `followups.html`, `admin-desk.js`. Declining uses `isDeclining` and `STUDENTS`. |
| R67 | *Log contact* panel: method (call, WhatsApp, email, in person), outcome (reached, no answer, booked a class, will return, not returning with reason), notes, next date. | J1 §4; RP "Record contact attempts, reasons and outcomes" | Drawer, writes `DB.followups`. |
| R68 | Reminder text: declining attendance is a reason to get in touch, not proof about an instructor. | J1 §4; RP side note | `.note` under tabs. |
| R69 | BA adds: create lists from criteria, assign people and due dates, reassign, review outcomes. | J1 §4; RP Retention management | `data-ba` controls. |
| R70 | "Low attendance flags" on BA Overview opens Follow-ups. | J2 "Change the 'low attendance flags' link"; J1 §5.7 | `index.html`/`admin-business.js` link target `followups`. |

### D. Business and control pages (FEAT-004)

| ID | Requirement | Source | Approach and files |
|---|---|---|---|
| R80 | BA Overview: period selector, switch Organisation / Today at HQ (second reuses FD layout). Four cards: Active members, New members (no conversion %), 90-day retention, Collected vs outstanding. | J1 §4 Overview; J3 §4 Overview; J5 (Newcomers dropped); RP BA dashboard | `index.html` renders by role. Shared `renderToday()` reused. |
| R81 | "Centres at a glance": occupancy, attendance trend, outstanding per centre; click opens Insights filtered to centre. | J1 §4 | `admin-business.js`; uses `DOJOS`, `CLASSES`, seeded per-dojo figures labelled sample. |
| R82 | "Waiting on you" for BA: exceptions, payment failures, import issues, promotion results, follow-up outcomes to review. | J1 §4 (audit/sensitive-changes dropped) | `admin-business.js`. |
| R83 | Business question cards: open another class here? / Why are newcomers leaving? / Which classes need attention? / Did an intervention work? Each with main number and *Explore* to the matching Insights tab. **"Why are newcomers not joining?" is removed.** | RP dashboard questions; J2 "no longer needs to answer 'Why are newcomers not joining?'"; J3 row 10 | 4 cards. |
| R84 | Classes, Timetable setup tab (BA): existing recurring-class table plus effective dates, mat/location, instructor, capacity, bookable online (HQ yes, non-HQ no), NFC code. Saving checks clashes (same instructor at same time, same mat overlap, closure). | J1 §4; RP Class and capacity planning | `sessions.html` BA tab, `admin.js` `renderSessions/openSessionForm` edited. |
| R85 | Delete a Session keeps the Delete button. The confirmation shows upcoming bookings affected, lessons are returned and students notified. Naming: Session = weekly plan, Class = dated occurrence. | J2 clarification on Session/Class attendance; J3 §2 "Deleting a Session"; J1 §5.3 superseded | Existing delete modal wording kept and extended. Not "End class from". See D5. |
| R86 | Closures tab (BA): close HQ for a date range or cancel one class; shows affected students, sends notice, returns lesson credits. | J1 §4; RP "manage closures and cancellations" | `DB.closures`; Rosters show "Cancelled". |
| R87 | Insights (BA): shared filter bar (period, compare-to, centre, class type, time slot, age group, belt group) and tabs Centres & classes, Capacity, Needs attention, Retention, Experience & teaching, Interventions. **No Newcomers tab, no cost.** Needs-attention banner says to investigate before changing the schedule and never auto-cancel. Capacity has *Plan a pilot slot* (opens Timetable form pre-filled). Interventions log with before/after and continue/adjust/stop. | J1 §4 Insights, amended by J3 row 10 and J5; RP BA oversight and dashboard table | New `insights.html`, `admin-business.js`. Charts use `.bars`, `.spark` and `.tbl`. All figures derived from `CLASSES`, `FEEDBACK`, seeded cohorts and interventions, labelled "Sample data". |
| R88 | Revenue (BA): month's total received, breakdown by item, outstanding, failed payments list (Stripe Unlimited auto-billing), export CSV. No reconciliation screen, no costs. | J2 "revenue tab with the total amount received from this month's payments"; J3 §1 row 8; J4 "Default" | New `revenue.html`, `admin-business.js`; data from `DB.ledger`. Exports are BA-only. |
| R89 | Grading (BA): read-only list of grading applications and instructor results. Debug-panel comment for demoing pass and fail. | J2/J4 belt only through grading; J3 §1 row 3; J4 "debug panel ... Just add a comment to the html page" | `grading.html` edited. Existing Schedule and Approve controls removed. See D4. |
| R90 | Reports (BA): date range and centre filters. Exports: attendance, progression, **real** payment records (current payments CSV only has Member, Status), follow-up outcomes. | J1 §4 Reports; RP "Export useful financial records" | `reports.html`, `admin-business.js`. Audit logging of exports dropped. |
| R91 | Policies (BA): tabs Packages & prices, Booking rules, Auto-activation rules for FD, Approved payment methods (Stripe), Notification templates, Follow-up triggers. Each save shows an impact modal first. | J1 §4 Policies; RP Policies and exceptions | New `policies.html`; values stored in `DB.policies`, read by take-payment, activation and notify. |
| R92 | Staff (BA): table of name, ID, role, status, last sign-in; drawer to change role, reset password, deactivate/reactivate. **BA can create Instructor, FD and BA accounts.** BA cannot deactivate themselves or the last BA. | J1 §4; J4 "Objections: BA should be able to create new instructor, FD & BA accounts" (overrides J3 "No Add staff") | New `staff.html`; `DB.staff` is the same list sign-in reads. |
| R93 | Import issues (BA): list of failed or incomplete CSV imports (missing information, pipeline error, unmatched names). BA fixes (match to a member) or dismisses. Debug-panel comment for a sample CSV import. | J6 points 1–2; J7 "Import issues" | New `imports.html`, `admin-business.js`; `DB.imports`. The pipeline itself is not built. |
| R94 | Notifications: FD sends approved templates to an HQ class or one student; no "All members", no "By grade". BA also gets whole organisation, by grade, and template management (templates live in Policies). Sent history card for both. | J2 "Lock down ... 'all members' notification to BA-only"; J3 §4 Notifications; J1 §4; RP Operational communication | `notify.html` rewritten; `data-ba` radios removed for FD. `DB.sentLog`. Preview count computed from data. |
| R95 | FD never sees organisation-wide financial reports, prices editing, staff permissions, or other centres' records. | RP "Recommended Boundaries" | Guaranteed by R07, R09, R10 and tested. |
| R96 | Debug-panel placeholder comments (five in total): grading pass/fail (`grading.html`), MC outcomes (MC approval area), failed Stripe auto-payment (Payments or Revenue), clock forward (roster), sample CSV import (`imports.html`). | J6 #7 "Yes, add placeholder comments"; J7 | Comments only, text starts `DEBUG PANEL (placeholder):`. |

### E. Cross-cutting

| ID | Requirement | Source | How |
|---|---|---|---|
| R100 | Same visual design as existing portals: existing CSS classes, tokens, components, icon sprite. No new framework or network dependency. | Brief; J4 "Ensure to maintain the original styling"; J7 "no new visual styles" | New CSS limited to small additive rules in `portal.css` that reuse variables. List them in the report. |
| R101 | 1280px and 390px both correct. | Brief | Tables use `.tbl` so they become cards; no horizontal overflow at 390; verified by script. |
| R102 | Relative data-root convention. | Brief | Every new page has `data-root="../"` and the script order used by existing pages. |
| R103 | Student and instructor portals still work. | Brief | Regression block in the verification plan. |
| R104 | Front end only, mock data, Express/Postgres later. A comment that role checks must be repeated on the server. | J2 "Hard-coded data will be replaced"; J1 §2 Security | Comment block at top of `admin-shell.js`. |

---

## 2. Implementation approach (summary)

Architecture decisions:
1. **Role model** lives in `sessionStorage['ask-admin']` = `{id, name, type}` where `type` is `frontdesk` or `business`. `AUTH.role` stays `'admin'`, so `isStaff()`, `signOut()` and the instructor-style redirects keep working. Reason: the smallest change that leaves `portal.js` guards intact.
2. **One staff list** (`DB.staff`) feeds both sign-in and the Staff page, so created, deactivated and role-changed accounts take effect at the next sign-in.
3. **Navigation** is data: a `ADMIN_PAGES` table in `portal.js` (`key, icon, label, group, ba`). The menu, guard, tab bar and parent mapping all read it. This avoids four separate lists drifting apart.
4. **DOM stripping** of BA-only controls via `[data-ba]` handled once in `admin-shell.js`.
5. **Mock data** in `SEED()` (new top-level keys, auto-merged) plus an `admSeed` migration in `store.js` for fields added to existing arrays (members, sessions).
6. **Roster data** is derived: for a given class and date, a deterministic pool of seeded people fills `booked` rows; manual actions (book, cancel, walk-in, present/no-show, submit, correction) are saved in `DB.rosters[key]`. The signed-in student's own bookings (`BOOKINGS`) are included, so a student booking shows in the admin roster.
7. **CSS** additions are limited to: `.rail nav .grp` group label, and anything a new component genuinely lacks after checking `portal.css` (candidates: tab-strip spacing for a second `.filters` row, a roster toggle). Each addition uses existing tokens.

Order of work (each step leaves the site working):
1. FEAT-001: data + store + portal shell + sign-in + guards + wording + verification harness.
2. FEAT-002: Today, Classes/Rosters, Roster, Payments, Equipment.
3. FEAT-003: Members, Student record, Registrations (+ MC), Assisted registration, Follow-ups.
4. FEAT-004: BA Overview, Timetable/Closures, Insights, Revenue, Policies, Staff, Imports, Reports, Grading, Notifications.

---

## 3. Ambiguities, conflicts, and the reading chosen (Decisions to confirm)

| # | Issue | Reading used | Alternative |
|---|---|---|---|
| D1 | RP says FD and BA have "assigned/authorised centres" and a centre switcher (J1). J2, J3 and J5 say both work only at HQ. | No switcher. FD searches all students (HQ is the only office), manages HQ classes only. Insights keeps a centre filter for imported non-HQ data. | Add a switcher later if satellite staff get accounts. |
| D2 | Student-facing text still says "Waiting for HQ" (`student.js:217`, toast at 285). | Left alone because this branch must not break the student portal and the wording is about the office, not the role label. | Reword to "Waiting for the office" later. |
| D3 | RP says FD "see basic availability and flag shortages" for equipment. J3 row 9 and J5 drop stock and shortages. | Follow J5: no stock tab, no shortage flag. | Add a stock tab if the centre asks. |
| D4 | Grading: user says belt changes only via grading and BA's page is read-only. But the instructor portal sends results to `PROPOSALS`, and `promote()` in admin is what gives the student their promotion and level-up. Removing it would break the student demo chain. | Page is read-only with no scheduling or approval controls. One small button per result, "Apply result (demo)", stays in the BA list and calls the existing `promote()`. It stands in for the panel decision until the debug panel exists. | Remove the button entirely and apply results from `instructor.js` at submission time (needs an instructor-portal change). Also: starting grade carry-over is shown to BA for confirmation at activation. |
| D5 | J1 says replace Delete with "End class from [date]". J3 §2 says keep Delete with a confirmation of affected bookings. | Keep Delete (J3, later). Modal shows affected upcoming bookings and says lessons are returned. | "End from date" later. |
| D6 | J3 suggests four new JS files. | `admin.js` is kept for code that is edited in place (sessions, grading, MC drawer pieces that stay). New files hold new areas. Do not delete `admin.js`. | Full split later. |
| D7 | Two sign-in tabs vs three. | Two (J3 and J4 "Default"). | Three tabs let users pick their access level. |
| D8 | FD approves MC only if an MC is attached and 14 days or less. J3 says "beyond 2 weeks go to BA". | 14 days. | Another limit. |
| D9 | "Return lesson" count. | +1 lesson per approved MC. If the member has no-shows in the MC dates, return one per no-show (only seeded for the student demo account). | Return per missed booked class once a real attendance table exists. |
| D10 | Student bell shows "Package extended +N days" for approved MCs. If *Extend expiry* is unticked, the text is wrong. | Small additive edit to the student bell text in `portal.js`: if `r.extend === false`, show "Lesson returned". | Leave as is. |
| D11 | Roles prompt wants "audit logs"; user dropped the audit page and logging. | No audit page. Reasons are stored on the record (e.g. correction reason). | Add later. |
| D12 | Roles prompt wants cost/ROI; user limited to a revenue tab. | Revenue only. | None. |
| D13 | FD notifications "to students in assigned centres or sessions" vs HQ only. | FD may notify an HQ class or one student, templates only. | None. |
| D14 | FD refund wording: policy says refunds are not allowed. | FD can view and raise a refund request. BA approves exceptional refunds. "Reject and refund" becomes "Reject". | Remove refund requests altogether. |
| D15 | Where "Take payment" button wording lives for non-Stripe. | Stripe only. Desk checkout is a mock modal ("Stripe Checkout, scan or tap") with no QR image, because QR payment is "not required". | Add cash later. |

---

## 4. Deferred (clearly labelled mocks or out of scope)

- Real authentication and server-side role checks (comment in `admin-shell.js`: the Express API must enforce roles).
- CSV pipeline and LLM conversion (Import issues is a list of seeded rows).
- Real Stripe (desk checkout and failed auto-payment are mock; debug panels are comments).
- Real file upload and storage for NS proof, MC files and experience certificates (mock previews).
- Audit log, cost/ROI, stock tracking, newcomer conversion funnel, QR/cash payments, reconciliation.
- Debug panels themselves (comments only, five places).
- `join.js` / `join.html` date of birth and NS upload (not changed).
- Optional inactivity sign-out for shared FD computers.
- The PDF was not read.

---

## 5. Verification plan

### 5.1 Tooling (all outside the repo except the scripts and screenshots)
- Static server: `node .admin-fix-tmp\verify\serve.mjs` serving `c:\Users\CedrikHwang\FSDP-C19\src\public`. It picks a free port with `server.listen(0)`, writes the port to `.admin-fix-tmp\verify\port.txt`, and sets a correct MIME type for `.html/.js/.css/.png/.jpg/.json`. Trailing-slash redirect is handled by the pages themselves.
- Playwright: `npm init -y` and `npm i playwright-core` inside `%TEMP%\admin-verify` (nothing is added to the repo). The scripts import it by absolute path with `createRequire`. Browser: Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` through `executablePath` (Chrome is not installed). If it is missing, `npx playwright-core install chromium` into the temp dir.
- Block external requests (Google Fonts, `aikidoshinjukai.com.sg` logo) with `context.route` aborting anything that is not `127.0.0.1`, so runs are fast and offline-safe. The icon sprite is inline, so icons still render.
- Scripts live in `.admin-fix-tmp\verify\`: `lib.mjs` (server start, browser launch, `signInAs(page, role)`, `shot(page, name)`, `check(id, cond, msg)` that records pass/fail to `results.json`), `verify-feat1.mjs` … `verify-feat4.mjs`, `verify-all.mjs`, `regress.mjs`.
- Each browser context is fresh (empty localStorage, sessionStorage) so SEED data is what runs. A second run keeps the same context to test persistence and an old-DB migration (inject `localStorage['ask-prototype-v3']` with `JSON.stringify` of an older shape lacking `staff`, `ledger`, `admSeed`, then load and check nothing throws).

### 5.2 Sign-in per role (always through the UI)
`goto /admin_portal/signin.html`, click the **Admin** tab, fill `#s-id` with `ADM-001` (Business Admin) or `ADM-101` (Admin), keep prefilled password, submit. Assert it lands on `/admin_portal/index.html`, `sessionStorage['ask-admin']` has the right `type`, and the rail label reads "Admin" or "Business Admin". Also: wrong format ID shows the error toast; an unknown ID shows a message; a deactivated account (set `status:'inactive'` in `DB.staff` then reload) shows the deactivated message; visiting `/admin_portal/index.html` with no session redirects to sign-in with the expired message.

### 5.3 Assertions per requirement group
(IDs refer to section 1.)
- **R01, R04:** page text of signin and every admin page does not contain "HQ Admin"; signin copy matches R04.
- **R07, R08:** nav link texts per role equal the lists in R07; at 390px the tab bar shows exactly the R08 four plus "More"; BA rail contains the three group labels, FD rail contains none.
- **R09, R10:** as FD, visit each BA page URL (`insights, revenue, grading, reports, policies, staff, imports`) and assert redirect to `index.html` with the toast "That page is for Business Admins". On shared pages as FD, `document.querySelectorAll('[data-ba]').length === 0` and the BA tabs (Timetable, Closures, Exceptions, Failed payments) and "Export CSV" are absent from the DOM. As BA, they exist.
- **R11:** on `roster.html`, `member.html`, `register.html` the highlighted rail item is Classes, Members, Registrations.
- **R15:** no page contains `1,248`, `42,600` or the old hard-coded payment names unless they come from seed data; the member counts on Members and Overview equal `MEMBERS.length`-derived numbers read from `localStorage`.
- **R20–R24 (FD Today):** header text, four `.stat` cards, timeline rows count equals today's HQ classes, row buttons open roster; no `.bars` element on FD home.
- **R25–R34 (Classes and roster):** day strip changes date; closed day shows "Cancelled"; roster header and strip; book an eligible student increases Booked by one; try booking an ineligible student (Advanced class, 4th Kyu) and assert FD sees "Refer to Business Admin" while BA sees "Override with reason"; add a walk-in with a seeded pass guest succeeds, a member does not appear in the picker; submit attendance then edit shows the reason modal and rejects empty reason; cancel booking more than 4 hours ahead returns a lesson (assert the pass `left` in localStorage); comments for the clock debug panel exist in the HTML source.
- **R35–R40 (Payments):** take-payment flow completes and adds a ledger row; method list has only Stripe; discount applies for a seeded 22-year-old member; daily summary total equals the sum of today's desk rows; "Lock" disables the submit; PDF download event fires; FD sees refund list without Approve, BA sees Approve; FD has no "Failed payments" tab.
- **R41, R42 (Equipment):** statuses advance Requested → Ready at HQ → Handed over; mark handed over requires collector name; activating an application creates an equipment row.
- **R50–R51, R62–R65 (Members, record):** each filter changes row count; search by phone, email and guardian name finds a row; row opens `member.html`; as FD, the belt, status and dojo are read-only text, no export; as BA, status and dojo editable and Save requires a reason; belt control is never editable; FD sees medical note text and MC list but NS shows only "Verified"; BA can open it.
- **R52–R54 (MC):** seed a pending MC for the demo student by running the student flow once in a second context (or directly writing `mcRequests` in localStorage); approve as FD with both boxes ticked: pass `expires` moves, `left` +1, request `status` approved. Untick *Extend expiry*: expiry unchanged. Unlimited pass: neither applies, request marked excused. MC over 14 days: FD gets "Refer to Business Admin"; BA can approve. Then sign in to the student portal in the same context and check the bell text.
- **R55–R59 (Registrations, assisted registration):** checklist chips present; FD Activate disabled when a rule fails, enabled when all pass; no text "refund" in the Reject modal; Flag for review creates a BA exception; register form requires DOB, consent signature, and shows the discount; External member match adds ASK membership.
- **R66–R70 (Follow-ups):** four tabs; log contact writes an attempt and the row's attempt count increments; BA create/assign visible only for BA; BA Overview "Low attendance flags" button navigates to `followups.html`.
- **R80–R83 (BA Overview):** four question cards (none mentions "not joining"); period selector present; Organisation/Today toggle swaps content.
- **R84–R86 (Timetable and Closures):** clash save blocked with an explanatory toast; delete modal shows affected bookings count; closure marks matching rosters "Cancelled" and returns lessons.
- **R87 (Insights):** six tabs, no "Newcomers" tab, banner text exists, *Plan a pilot slot* opens the session form with fields prefilled.
- **R88–R93 (Revenue, Reports, Policies, Staff, Imports, Grading):** revenue total equals the sum of this month's paid ledger rows; failed list rows from the seed; reports CSV download event names the right file and payments CSV has the new columns; policies save shows impact modal, then Payments take-payment reflects a changed price; staff create adds an `ADM-1xx` or `INS-` account that can then sign in through the UI, deactivate blocks its next sign-in, and the last BA cannot be deactivated; imports fix/dismiss reduces the open count; grading page has no Schedule or Approve controls and does have the demo apply button, which promotes through `promote()`.
- **R94 (Notify):** FD audience radios: only class/one student, no "All members"; BA has all; template required; sent history gets a row.
- **R95, R96:** FD cannot reach policies/staff/reports/revenue (R09); five `DEBUG PANEL` comments are found by fetching each page's HTML source.

### 5.4 Layout checks
For every admin page and each role that can open it, at 1280x800 and 390x844 (mobile emulation, `hasTouch`):
- `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal overflow).
- No console errors and no failed requests other than the blocked external ones.
- Phone: `.tabbar` visible with 5 items; drawer opens as a sheet; tables render as stacked cards (`td::before` labels exist after `autoLabelTables`).
- Screenshots saved to `c:\Users\CedrikHwang\FSDP-C19\.admin-fix-tmp\screens\<role>-<page>-<1280|390>.png`. Include drawers and modals for: member drawer/record, MC drawer, roster with modal, take-payment modal, staff create drawer, policy save modal.

### 5.5 Regression for the other portals
- Instructor: sign in via the signin page's Instructor tab (`INS-0042`), open `index.html` and `profile.html`, no console errors, rail/solo bar present, Grading link gated as before.
- Student: sign in at `student_portal/login.html` (the coder reads `login.js` for the exact demo path), open all six pages without console errors.
- Chain: student creates an MC request → admin approves → student bell reflects it (R52). Instructor submits an exam result → BA grading list shows it → "Apply result (demo)" → student home shows the promotion.
- `git status --short` shows only intended changes (nothing staged), nothing under `prompts/`, `.env*`, `.gitignore`, `app.js`, `database/`, no `.agents/`.

### 5.6 Reporting
`c:\Users\CedrikHwang\FSDP-C19\.admin-fix-tmp\report.md`: requirement table (ID, status Done/Mock/Deferred, evidence), Decisions to confirm (section 3), Deferred (section 4), the list of additive shared-file changes (`store.js`, `portal.js`, `data.js`, `portal.css`), screenshot index, and the verification run output summary.

---

## 6. Workflow shape

The work decomposes into four sequential features, authored as FEAT artifacts under `.admin-fix-tmp\task-admin-portal\` (`task.json`, `context.json`, `features\FEAT-00N.json`). FEAT-001 is the foundation and must go first. FEAT-002 to FEAT-004 depend on FEAT-001 only, but run in order because they share one working tree and `admin.js`. After them a fixer/reviewer loop gates on `c:\Users\CedrikHwang\FSDP-C19\.admin-fix-tmp\review.json` (`verdict == "APPROVED"`), followed by a finalize step that reruns the full verification and writes `report.md`.
