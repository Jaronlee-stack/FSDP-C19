-- Admin inbox: questions Ben could not answer with confidence, waiting for a staff reply in the office portal.
-- status: open (waiting) | answered (replied) | closed (no reply needed)
-- reply_choice: this_user (answer only this person) | faq (add to FAQ) | knowledge (update a knowledge note) | not_for_bot (tell the user to contact HQ)
CREATE TABLE IF NOT EXISTS admin_inbox_item (
  id              VARCHAR(20)  PRIMARY KEY,
  question        TEXT         NOT NULL,
  reason          VARCHAR(300) NOT NULL,
  checked_notes   VARCHAR(500) NOT NULL DEFAULT '',
  channel         VARCHAR(20)  NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'portal')),
  chat_id         VARCHAR(255),
  user_id         VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  reply_choice    VARCHAR(20)  CHECK (reply_choice IN ('this_user', 'faq', 'knowledge', 'not_for_bot')),
  reply           TEXT,
  knowledge_note  VARCHAR(120),
  answered_by     VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  answered_at     TIMESTAMPTZ,
  delivery        VARCHAR(20)
);
CREATE INDEX IF NOT EXISTS admin_inbox_item_status ON admin_inbox_item (status, created_at DESC);
