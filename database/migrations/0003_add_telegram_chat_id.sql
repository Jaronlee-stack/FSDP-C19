-- Add telegram_chat_id to student_profile for 1-to-1 bot notifications
ALTER TABLE student_profile ADD COLUMN telegram_chat_id VARCHAR(255) UNIQUE;
COMMENT ON COLUMN student_profile.telegram_chat_id IS 'Telegram personal chat ID for 1-to-1 bot notifications';
