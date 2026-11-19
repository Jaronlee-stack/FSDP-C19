-- Weekly recurring classes at external venues: who is enrolled in which class_template.
-- A venue scan is accepted only for a class the student is enrolled in (or a make-up booked into that day's session).
CREATE TABLE class_enrollment (
  user_id     VARCHAR(255) NOT NULL REFERENCES student_profile(user_id) ON DELETE CASCADE,
  template_id VARCHAR(255) NOT NULL REFERENCES class_template(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);
CREATE INDEX class_enrollment_template ON class_enrollment (template_id);

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'class_attendance'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%booked_via%';
  EXECUTE 'ALTER TABLE class_attendance DROP CONSTRAINT ' || c;
END $$;
ALTER TABLE class_attendance ADD CONSTRAINT class_attendance_booked_via_check
  CHECK (booked_via IN ('online', 'desk', 'walk-in', 'waitlist', 'roster', 'make-up'));
