-- Ben's follow-up messages go out on Telegram, so Telegram is a contact method next to WhatsApp, Call, Email and SMS.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'followup_attempt'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%method%';
  EXECUTE 'ALTER TABLE followup_attempt DROP CONSTRAINT ' || c;
END $$;
ALTER TABLE followup_attempt ADD CONSTRAINT followup_attempt_method_check
  CHECK (method IN ('WhatsApp', 'Call', 'Email', 'SMS', 'Telegram'));
