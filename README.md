# Aikido Shinju-Kai (ASK) Management System

*One platform for the whole dojo, from first trial class to black belt.*

The ASK Management System brings Aikido Shinju-Kai's students, instructors and office staff onto one platform. Students book classes,
check in with a QR code at HQ or partner venues, and track their progress. Staff manage memberships, venue rosters and attendance
reports in one place. A personal Telegram bot delivers class reminders and announcements, while Ben, an AI assistant, answers common
questions and follows up with newcomers and students whose attendance is dropping.

FSDP project, Aikido PS 1.

## Portals

One Node.js server runs the API and serves four web portals:

| Portal | URL | For |
| --- | --- | --- |
| Public site | `/landingpage/` | visitors: trial booking, join form, dojo and fee information |
| Student portal | `/student_portal/` | members: bookings, check-in, progress, profile |
| Instructor portal | `/instructor_portal/` | instructors: classes, attendance, remarks, grading |
| Office portal | `/admin_portal/` | front desk and Business Admin: members, payments, venues, reports, audit log |

Instructors and office staff sign in at `/admin_portal/signin.html`.

## Main features

- **Bookings and QR check-in:** students book HQ classes and scan the dojo's QR code to check in. External venues use a fixed weekly roster,
  with make-up classes allowed.
- **Venues:** a Business Admin imports each venue's Excel roster once (matched by member number; mismatches go to Import issues) and can export
  venue attendance as CSV.
- **Telegram bot:** a 1-to-1 bot. A student links their chat with a code emailed to them, then receives reminders and announcements sent from the
  office portal.
- **Ben (AI assistant):** answers questions from the notes in `Ben Bot/` and passes anything else to the office inbox. Ben also messages
  newcomers and students whose attendance is dropping, and closes the follow-up when they reply yes.
- **Email:** sent through Brevo (link codes, notifications).
- **Security:** JWT session cookie, bcrypt passwords, role checks on every route, input validation with zod, rate limits, and an append-only
  audit log.

## Tech stack

Node.js, Express 5, PostgreSQL (PGlite by default, or a server through `pg`), plain HTML/CSS/JS front end, Telegram Bot API, Brevo, Groq or Ollama for Ben, Docker.

## Run it locally

You need Node.js 20+. No database server is needed.

```powershell
npm install
copy .env.example .env      # then fill in your values
npm start                   # or: npm run dev (restarts on change)
```

Open http://localhost:3000.

### Database

The app uses **PGlite** by default: real PostgreSQL compiled to WebAssembly, running inside the Node process and saved in `data/pglite/`.
On the first start it loads the schema, the demo data and every migration in `database/migrations/` (a few seconds). Later starts apply only
new migrations. To start again from fresh demo data, stop the app and delete `data/pglite/`.

To use a PostgreSQL server instead, set `DB_DRIVER=postgres` and the `DB_*` settings, then load the database once:

```powershell
createdb FSDP
psql -d FSDP -f database/db.sql
psql -d FSDP -f database/seed.sql
psql -d FSDP -f database/seed_extra.sql
```

Then run each file in `database/migrations/` in number order. `db.sql` drops and recreates every table, so only run it on an empty or
throwaway database.

## Run it with Docker

```powershell
docker compose up -d --build     # app + database; the database is loaded on first start
docker compose logs -f app       # watch the app log
docker compose down              # stop (data is kept in the pgdata volume)
```

The app is on http://localhost:3100. Compose runs a separate PostgreSQL container (`DB_DRIVER=postgres`), using the settings from `.env`
with `DB_HOST` switched to that container.

## Configuration (`.env`)

| Variable | What it is |
| --- | --- |
| `NODE_ENV` | `development` locally, `production` when deployed |
| `PORT` | HTTP port (default 3000) |
| `DB_DRIVER` | `pglite` (default, no server) or `postgres` |
| `PGLITE_DATA_DIR` | where PGlite saves the database (default `data/pglite`) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection (only with `DB_DRIVER=postgres`) |
| `DB_SSL` | `true` for hosted PostgreSQL that needs TLS |
| `JWT_SECRET` | signs sign-in sessions; required in production |
| `APP_FAKE_TODAY` | development only: pins the date, for example `2026-11-06` (the seed data is built around this day) |
| `TRUST_PROXY` | number of proxies in front of the app when deployed (for example `1`) |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | email sending |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram bot; the webhook rejects updates without the secret |
| `GROQ_API_KEY` or `OLLAMA_MODEL` / `OLLAMA_URL` | Ben's AI model; Ben stays off without one |
| `BEN_VAULT_PATH` | folder of Ben's notes (default `Ben Bot/`) |

Never commit real secrets. Keep them in `.env` locally and in your host's environment settings when deployed.

## Demo accounts

All seeded accounts use the password `password123` (local demos only).

| Sign in as | Use |
| --- | --- |
| Student | `ASK-2025-1834` (Lervyn Wong) |
| Instructor | `INS-0042` (Bob Tan Sensei) |
| Business Admin | `ADM-001` (Grace Lim) |
| Front desk | `ADM-101` (Daniel Ong) |

## Project structure

```
app.js            entry point: Express app, static portals, startup and shutdown
database/         db.sql (schema), seed files, migrations/, docker/ (Docker init script)
Ben Bot/          Ben's notes (rules, classes, dojos, fees, grading)
src/
  config/         environment settings and the PostgreSQL pool
  routes/         API routes under /api/v1 (admin/ holds the office routes)
  controllers/    read the request, call a service, send the response
  services/       business rules (bookings, check-in, venues, Telegram, Ben, reports...)
  models/         all SQL (parameterised queries only)
  validators/     zod schemas for every request
  middleware/     auth, role guards, validation, rate limits, security headers, errors
  public/         the four portals
tests/            node:test unit tests
```

Requests flow `route -> middleware -> controller -> service -> model -> PostgreSQL`.

## Tests

```powershell
node --test "tests/*.test.js"
```

## More detail

- [docs/backend-reference.md](docs/backend-reference.md): full API, accounts and passwords, audit log and security notes
- [database/README.md](database/README.md): tables and seed rules
- [docs/venue-roster-import.md](docs/venue-roster-import.md): how venue rosters and attendance work
