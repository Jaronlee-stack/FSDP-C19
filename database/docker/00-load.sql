-- Runs once, when the database volume is first created. Order matters: schema, demo data, then every migration in date order.
\set ON_ERROR_STOP on
\i /app-db/db.sql
\i /app-db/seed.sql
\i /app-db/seed_extra.sql
\i /app-db/migrations/0003_add_telegram_chat_id.sql
\i /app-db/migrations/0004_telegram_link_code.sql
\i /app-db/migrations/0005_venue_roster.sql
\i /app-db/migrations/0006_venue_import.sql
\i /app-db/migrations/0007_admin_inbox.sql
\i /app-db/migrations/0008_ben_followups.sql
\i /app-db/migrations/0009_level_up_ack.sql
