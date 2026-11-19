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


# NODE_ENV=development
# PORT=3000
# DB_USER=jaron
# DB_HOST=localhost
# DB_NAME=FSDP
# DB_PORT=5432
# DB_PASSWORD=rykerisfat
# JWT_SECRET=nC4tNQGvrT4n5IFosNDMD6VKRbJF5v9czZRuVmaUwqp
# JWT_EXPIRES_IN=8h
# CHANGE_PW_RATE_MAX=5
# CHANGE_PW_RATE_WINDOW_MS=900000

# # --- Email Notifications (Brevo) ---
# BREVO_API_KEY=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
# BREVO_SENDER_EMAIL=noreply@aikidoshinjukai.com.sg
# BREVO_SENDER_NAME=Aikido Shinju-Kai

# # --- Telegram Bot (announcements & reminders) ---
# TELEGRAM_BOT_TOKEN=8886913947:AAEjPN-2g-VKO2etZbwu0oNo40qC6IAHNuw
# TELEGRAM_ADMIN_CHAT_ID=change_me_to_admin_chat_id
# TELEGRAM_WEBHOOK_SECRET=f92013620f22a8776226314c6eaed0ccda670d6d8d156830ad8c455a5d358343

# GROQ_API_KEY=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

# BEN_VAULT_PATH=