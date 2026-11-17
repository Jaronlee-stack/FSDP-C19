# Review 2: task-db-round2

**Verdict**: APPROVED

Schema, seed and prototype data agree. Grading closes the HQ weekly timetable for every grading_session. `verify.mjs` and `agree.mjs` pass when re-run. The notes below are non-blocking.

Watch for: the prototype and seed only agree when the clock is pinned to 2026-11-06 (confirmed), and the screenshots do not show the new timetable rows or the 13 Dec closure (confirmed).

## High-level view

Grading now closes HQ classes through data, not hand-written rows. `seed.sql` derives one `class_closure` per grading date that overlaps an HQ template. The view `v_grading_conflict` covers four conflict kinds and is empty. Negative tests show it fires when a closure is removed, when a new Sunday grading has no closure, or when an examiner has a session that day. The prototype has the matching 13 Dec HQ closure. `hqClosedOn` makes the instructor schedule and the student book slots respect it.

Robin Tan's Sunday 11:00 Weapons class moved to Pang Kim Lock in both `data.js` and seed CT-19. Robin keeps his Wednesday class. `student_profile.joined_on` is `DATE NOT NULL` for all 29 students. The exemption from the 2-year window, limited to `dob` and `joined_on`, is documented in `db.sql`, the seed header and the README. The harness checks that the joined year matches `member_no`, and that `joined_on` is not after any payment or booking date.

Non-HQ timetables are 20 SAMPLE templates, 2 for each of the 10 open dojos. `tampineswest` is closed and has none. The source statement (the docx has no schedule and the public site says to ask HQ) is in the README, the seed and `data.js`. The CHECK `online_bookable_hq_only` blocks online booking outside HQ. No instructor is double-booked across dojos in templates or sessions, and a negative test confirms the check catches one. The rows are in `SESSIONS` only, not `CLASSES`.

## Checks I ran

- `node .db-tmp/verify.mjs` printed ALL CHECKS PASSED.
- `TZ=Asia/Singapore node .db-tmp/agree.mjs` compared 1479 values with 0 unexplained mismatches and 4 allowed differences, each with a stated reason. Exit code was 0.
- I checked the constraints. `git status` and `git diff --stat` show no change to `.env`, `.env.example`, `.gitignore` or `app.js`. `.agents`, `package.json`, `node_modules` and `prompts` do not exist in the repo. The only untracked paths are `.db-tmp/`, `database/README.md` and `database/seed.sql`.
- I read every data.js/store.js hunk against `report2.md`. They match, including the `admin-desk.js` grading-fee fix (keyed by the next rank), the `DB_KEY` v4 bump, and the nine `joinedAgo` values.
- I re-checked the `OTHER_DOJO_CLASSES` weekday indexes against the plan table. They match.

## Notes (non-blocking)

1. **Clock-dependent agreement** (confirmed). The seed SQL is fixed to 2026-11-06, while the prototype uses the real clock. The `admin_portal_sessions-1280` screenshot shows "Tue 17 Nov 2026 · Today". Agreement is only guaranteed at the pinned date, as the plan stated. Say so in the backend handoff.
2. **Screenshot coverage** (confirmed). The 16 screenshots in `.db-tmp/screens/` do not include the admin Timetable tab with non-HQ rows. They also do not show the 3 Nov and 13 Dec closure views, or the instructor schedule on 13 Dec. The `admin_portal_sessions` shot is the Rosters tab. The data checks cover these, but no visual evidence exists.
3. **Browser check not re-run** (confirmed). I did not re-run `browser-check.mjs`, which needs Playwright installed outside the repo. I relied on the logged result (0 errors across 39 pages).
4. **Student payments** (confirmed, noted in report2). New package purchases in the student demo still write "25 lessons" while the ledger now uses "25-lesson pack".
5. **User decisions pending** (from report2). These are Lervyn's removed 14 Jun 2025 payment, Marcus joining in Sep 2026, the sample timetable, the `DB_KEY` reset, and the EXT-0041/0042 status difference.
