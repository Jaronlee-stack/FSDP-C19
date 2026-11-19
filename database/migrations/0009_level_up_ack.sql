-- Level-ups the student has already tapped on the home page (an attended class, a promotion). Safe to run more than once.
CREATE TABLE IF NOT EXISTS level_up_ack (
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('session', 'promotion')),
    ref_id VARCHAR(255) NOT NULL,
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, kind, ref_id)
);
