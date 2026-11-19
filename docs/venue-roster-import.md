# Venues: attendance, roster import and export

## Decisions
- **Attendance comes from QR scans only.** Venues do not upload attendance. A scan writes the attendance straight into the main system. (Built: roster and make-up rules, see `checkinService.js`.)
- **Enrolments come from a one-off legacy import.** The QR check-in needs `class_enrollment` rows, and the legacy import is what fills them. It is for loading existing venue rosters, not day-to-day use.
- **Every venue student already has a member number.** No new registrations from venue files.
- **Each venue has its own Excel layout.** A Business Admin saves a column mapping per venue once, and each upload reuses it.
- **Who can upload:** Business Admin only.
- **Upload behaviour:** add only. An upload never removes an existing enrolment.
- **Venue CSV export:** built. `GET /api/v1/admin/venues/attendance.csv?from=&to=&centre=` (`centre=all` or one venue id). Business Admin only.

## Matching rule
1. Look up the row's **member number** (unique in `student_profile`). No match: row goes to Import issues.
2. Compare the Excel **name** with the stored name, ignoring case, extra spaces and punctuation. No match: row goes to Import issues, not saved.
3. Only then create the enrolment, if the weekly class belongs to that venue.

Name matching is exact after normalising, not fuzzy, so "Lee Wei" never matches "Lee Wai".

## Issues go to Import issues (existing page)
- member number missing or not found
- name does not match the member number's record
- weekly class missing, unknown, or belonging to another venue
- the same student listed twice with conflicting classes

## Not building
- No HQ enrolment screen.
- No new registrations from venue files.
- No fuzzy or name-only matching.
- No automatic profile updates from Excel. Only enrolments are written.

## Still to build
- Venue column mapping (per venue, saved)
- Excel upload (needs an `.xlsx` reader package, not installed yet)
- Matching and enrolment as above
- Download button on the admin pages for the venue CSV
