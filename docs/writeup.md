# Examiner Grading Portal: Plan

Status: planning only. The permission rule is not implemented. The backend is not built yet.

> The mockup previously referenced here (`docs/mockups/examiner-grading-mockup.html`) is not in the repository. It needs to be recreated.

## 1. Goal

Only the people examining in a grading session can see and use the grading tools, and only for the candidates on their panel and during their shift.

## 2. Context from the centre (C19 clarifications)

- Grading is held only at the main dojo (HQ), about four times a year.
- Students report at allocated time slots and are assessed in groups by belt level by a panel of examiners.
- Students cannot choose their examiner.
- The centre can deny grading. Eligibility depends on a minimum number of lessons and an application through the trainer.
- Instructors are appointed by ASK and must hold at least a Dan grade. ASK is exploring PA certification for instructors.
- Seminars are optional but count toward Yudansha grading points.
- Private grading also exists. It does not follow the four scheduled grading windows and costs more than group grading.

## 3. Proposed flow

1. An admin builds the panel for a session: examiners, the belt group, the candidates and the shift window.
2. At shift start the server grants the **Examiner** role to each panel member's account, on top of their instructor role, for that shift only.
3. The notification is a pointer. It tells the examiner the portal is open. It does not grant access.
4. The examiner opens the grading portal from the notification. The session that is due to happen is shown automatically. No session selection is needed.
5. The lead examiner decides when the result is submitted. There is no window and no locking mechanism.
6. At shift end the Examiner role is revoked. Drafts are kept.

## 4. Flaws in the original plan, and decisions

| # | Flaw | Decision / fix |
|---|------|----------------|
| 1 | Hiding the tab is not security. The prototype stores all data in localStorage and the role in sessionStorage, and the staff login is only an ID check. | All hardcoded data is removed when the backend is built. The server enforces the Examiner role, the assignment and the session for every grading request. |
| 2 | "Shift" by time alone does not identify a panel's students. | Group grading format is to be confirmed later. Private grading does not follow the four scheduled windows, so the panel model must also cover private grading. |
| 3 | Panel membership and examiner roles are not yet confirmed. | To be confirmed later. Assignment table: examiner, candidate, session, belt group. |
| 4 | Granting access on notification send lets the window drift. | The lead examiner decides when the result is submitted. There is no window and no lock. Opening the notification opens the session automatically. |
| 5 | Unclear whether Examiner adds to or replaces the instructor role. | Examiner is added on top of the instructor role, temporarily. |
| 6 | An ill examiner has no substitute flow. | Out of scope for this plan. If an examiner is sick, admin still needs to arrange a replacement. |
| 7 | Candidates who have not met the prerequisites could pay the grading fee. | Candidates who do not meet the prerequisites cannot pay the grading fee at all. They must not reach the payment step. |
| 8 | Signed results could be overwritten. | No overrides at all, unless justified. Any override needs a written justification (see questions). |
| 9 | The prototype ships the full student roster to the browser. | Not applicable until the backend is built. The API then returns only that panel's candidates. |
| 10 | Timezone drift around the cutoff. | Store times in UTC. Display Singapore time (SGT, UTC+8) by default. |
| 11 | A shared dojo device could keep the examiner session after the shift. | By default, the session logs out when the browser closes. Authentication is not properly implemented yet. |

## 5. Scoring design (from the rubric sheet)

The rubric screenshot found online shows this structure:

- **Hierarchy:** Attack (e.g. Shomen Uchi) → Technique (e.g. Ikkyo) → Variation (e.g. Omote/Ura) → Criteria.
- **Criteria** are observable faults with frequency thresholds, e.g. "Arm <90° when pinning >25% of the time."
- **Four bands per criterion:** Problem Area (a fault), Pass, Good, Excellent. The examiner selects one band per row.
- **Marks Awarded** per row, rolling up to totals per technique and per attack.

Implications:

1. Scoring is a tick-box checklist. Tap targets must be mobile-friendly.
2. The result should be derived from the total marks against the grade threshold. Pass/Retake/Fail is not a free choice. There are no overrides unless justified.
3. Frequency-based criteria need one-tap band entry per row and an optional note per technique.
4. The data model needs a versioned rubric table: attack → technique → variation → criterion → bands and marks. Each score is tied to a candidate, a criterion and the examiner who gave it.
5. The sheet came from Google and may not be ASK's rubric. Confirm with the centre or ASK before building on it. Pass thresholds are unknown.

## 6. Open questions

- Group grading format: how are candidates split across panels? (To be confirmed later.)
- Private grading: who examines, how is it scheduled, and does it use the same portal and roles?
- Panelist confirmation (to be confirmed later).
- Lead examiner: what powers does this role have beyond submitting? Are other examiners' scores included in the submission?
- Once submitted, can results still change? With no lock, does "append-only" still apply?
- Overrides: which situations would justify one?
- Does the centre or ASK use this rubric? What are the marks and pass thresholds?
- Does an examiner need a grade above Dan, or is Dan enough?
- Which prerequisites block the grading fee: lesson count, trainer application, or both?
- Display time: Singapore time by default. Should Japan time be shown alongside, since grading is in Tokyo?

## 7. Next steps

1. Confirm the open questions above with the centre or ASK.
2. Recreate the mockup and rebuild its scoring panel around attack → technique → criteria, with band taps and a live marks total.
3. Write the data model: panel, assignment, rubric, score, result, audit log, private grading.
4. Write the server-side permission rules: role grant at shift start, assignment check, session check, revoke at shift end.
5. Only then implement the permission rule.
