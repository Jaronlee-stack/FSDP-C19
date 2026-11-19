-- One pending email verification code per Telegram chat, used to prove the chat belongs to the student before linking
CREATE TABLE telegram_link_code (
  chat_id     VARCHAR(255) PRIMARY KEY,
  user_id     VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   CHAR(64)     NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  attempts    INT          NOT NULL DEFAULT 0,
  sent_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX telegram_link_code_user_sent ON telegram_link_code (user_id, sent_at);
