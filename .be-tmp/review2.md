# Review 2: member passwords, forced change, change-password, audit log, 29/36, hidden grading notes

**Verdict**: APPROVED

Read against plan2.md and FEAT-001..004. The harness log (.be-tmp/verify/run-all.out) shows all 16 suites passing (1988 checks) plus 14 static checks, and `npm test` exits 0 on re-run. HEAD is still 769e384, nothing is staged, and `.gitignore` and `prompts/` are unchanged. There is no `.env` file.

Verified in code:
- Passwords at registration (public and desk): the schema requires password and confirmPassword. It enforces min 8, letter and number, max 72 bytes, and not equal to the email or its local part. The hash is created before the transaction and stored only on registration_application.password_hash. markApproved and markStatus (Approved/Rejected) set it to NULL. The column is not in LIST_COLS, and registration responses no longer carry tempPassword. A temp password remains only as a fallback for legacy applications with no hash, which is then forced to change.
- Forced change: `authenticate` returns 403 PASSWORD_CHANGE_REQUIRED. Only GET /auth/me and POST /auth/change-password use the lenient variant, and logout is unauthenticated. Sessions issued before password_changed_at are rejected with 401 SESSION_EXPIRED.
- Change password: it takes a row lock, verifies the current password with bcrypt (400 CURRENT_PASSWORD_INCORRECT) and applies the strength rule with identifier avoidance (WEAK_PASSWORD). It rejects reuse (PASSWORD_REUSED), re-issues the cookie and writes the audit row in the same tx. A wrong-password attempt is logged afterwards with recordSafe. The rate limiter is configurable through the new env names.
- Lervyn is 56 total / 29 accumulated in seed.sql, and the tests were updated.
- remarkModel.forStudent now selects only kind='student' (plus attended class remarks), so the query itself blocks grading notes. The instructor paths are untouched.
- audit_log: the trigger blocks UPDATE, DELETE and TRUNCATE. Only the ON DELETE SET NULL transition is allowed. record() takes the tx client, and `sanitize` drops secret-like keys and removes bcrypt/JWT strings. Failed logins use actor NULL, store only portal and reason, and never store the identifier. The audit list and CSV export are BA-only on the route and again in the service (BUSINESS_ADMIN_ONLY). The export is itself audited.
- A grep found no SQL outside src/models. The audit UI escapes every value with esc(), uses no inline handlers, and the new JS files use no storage.

Non-blocking notes:
- Seeded audit rows (17) omit day.locked and staff.created, contrary to plan section 4. The docs describe the actual rows.
- grading.result_submitted in api-audit was skipped in the logged run because the instructor fixture is clock dependent. It runs between 00:20 and 22:00 SGT.
- admin_portal/members.html overflows at 390px. This was found by the implementer and is pre-existing and out of scope.
- `npm ci` and the last full run-all were not re-run by me. I relied on the recorded run-all.out and my own `npm test` run.
