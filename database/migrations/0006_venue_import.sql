-- Venue roster import: the saved Excel column mapping per venue, and the issue types a roster row can be flagged with.
CREATE TABLE venue_import_mapping (
  dojo_id        VARCHAR(255) PRIMARY KEY REFERENCES dojo(id) ON DELETE CASCADE,
  member_no_col  VARCHAR(100) NOT NULL,
  name_col       VARCHAR(100) NOT NULL,
  class_col      VARCHAR(100) NOT NULL,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by     VARCHAR(255)
);

ALTER TABLE import_issue DROP CONSTRAINT import_issue_issue_type_check;
ALTER TABLE import_issue ADD CONSTRAINT import_issue_issue_type_check CHECK (issue_type IN (
  'Missing information', 'Unmatched name', 'Pipeline error',
  'Unknown member', 'Name mismatch', 'Unknown class', 'Duplicate row'));
