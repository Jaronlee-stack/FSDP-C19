# Examiner Grading Portal: Plan

Status: planning only. The permission rule is not implemented. The mockup exists at [docs/mockups/examiner-grading-mockup.html](mockups/examiner-grading-mockup.html).

## 1. Goal

Only the people examining in a grading session can see and use the grading tools, and only for the candidates on their panel and during their shift.

## 2. Context from the centre (C19 clarifications)

- Grading is held only at the main dojo (HQ), about four times a year.
- Students report at allocated time slots and are assessed in groups by belt level by a panel of examiners.
- Students cannot choose their examiner.
- The centre can deny grading. Eligibility depends on a minimum number of lessons and an application through the trainer.
- Instructors are appointed by ASK and must hold at least a Dan grade. ASK is exploring PA certification for instructors.
- Seminars are optional but count toward Yudansha grading points.

## 3. Proposed flow

1. An admin builds the panel for a session: examiners, the belt group, the candidates and the shift window (start and end, in UTC).
2. At shift start the server grants the **Examiner** role to each panel member's account for that shift only.
3. The notification is a pointer. It tells the examiner the portal is open. It does not grant access.
4. The examiner opens the grading portal from the notification. The portal lists only their assigned candidates.
5. At shift end the role is revoked automatically. Drafts are kept, and a lead examiner can extend the window if the session overruns.

## 4. Flaws in the original plan, and fixes

| # | Flaw | Fix |
|---|------|-----|
| 1 | Hiding the tab is not security. The prototype stores all data in localStorage and the role in sessionStorage, and the staff login is only an ID check. | Enforce the Examiner role, the shift window and the candidate assignment on the server for every grading request. Use the server clock. |
| 2 | "Shift" by time alone does not identify a panel's students. Several panels can run at once, each covering a belt group. | Add an assignment table: examiner, candidate, session, belt group. |
| 3 | A single examiner signing and sending to HQ does not match a panel assessment. | Decide between a lead examiner submitting for the panel, or each examiner scoring and the result being combined. |
| 4 | Granting access when the notification is sent lets the access window drift if the notice is early or late. | Grant at shift start. Revoke at shift end. Allow a grace period or a lead-examiner extension so scoring is not cut off mid-candidate. |
| 5 | Unclear whether Examiner adds to or replaces the instructor role. Replacing it removes the instructor's normal tabs during the shift. | Make it an additive grant tied to the person's account. A shared link shows nothing without a valid signed-in examiner session. |
| 6 | Examiners are appointed by ASK, so the role should not come from a side effect of a notification. An ill instructor has no substitute flow. | An admin assigns examiners when building the panel. Add a substitute flow. |
| 7 | Candidates who are not eligible could appear in the queue. | Show only candidates marked qualified and not denied. |
| 8 | Signed results could be overwritten. | Keep results append-only and send them to HQ for approval. Corrections are a new record with a reason. |
| 9 | The prototype ships the full student roster to the browser. | The API returns only that panel's candidates. |
| 10 | Timezone drift around the 12:30 cutoff. | Store times in UTC and display them in JST. |
| 11 | A shared dojo device could keep the examiner session after the shift. | Sessions end on logout and do not persist after the browser closes. |

## 5. Scoring design (from the rubric sheet)

The rubric screenshot found online shows this structure:

- **Hierarchy:** Attack (e.g. Shomen Uchi) → Technique (e.g. Ikkyo) → Variation (e.g. Omote/Ura) → Criteria.
- **Criteria** are observable faults with frequency thresholds, e.g. "Arm <90° when pinning >25% of the time."
- **Four bands per criterion:** Problem Area (a fault), Pass, Good, Excellent. The examiner selects one band per row.
- **Marks Awarded** per row, rolling up to totals per technique and per attack.

Implications:

1. Scoring is a tick-box checklist. Replace the 1–5 technique scores in the mockup. Tap targets must be mobile-friendly.
2. The result should be derived from the total marks against the grade threshold. Pass/Retake/Fail should not be a free choice. Any override needs a written reason.
3. Frequency-based criteria need one-tap band entry per row and an optional note per technique.
4. The data model needs a versioned rubric table: attack → technique → variation → criterion → bands and marks. Each score is tied to a candidate, a criterion and the examiner who gave it.
5. The sheet came from Google and may not be ASK's rubric. Confirm with the centre or ASK before building on it. Pass thresholds are unknown.

## 6. Open questions

- Does the centre or ASK use this rubric? If so, what are the marks and pass thresholds?
- Is there an official scoring rubric beyond this sheet?
- Does an examiner need a grade above Dan, or is Dan enough?
- How is a panel result combined: lead examiner, or aggregated scores?
- What is the substitute process when an examiner cannot attend?

## 7. Next steps

1. Confirm the rubric and thresholds with the centre or ASK.
2. Rebuild the mockup's scoring panel around attack → technique → criteria, with band taps and a live marks total.
3. Write the data model: panel, assignment, rubric, score, result, audit log.
4. Write the server-side permission rules: role grant at shift start, assignment check, time-window check, revoke at shift end.
5. Only then implement the permission rule.
