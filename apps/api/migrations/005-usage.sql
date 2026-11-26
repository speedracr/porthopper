CREATE TABLE usage_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  voyageId TEXT NOT NULL UNIQUE REFERENCES voyages(id),
  status TEXT NOT NULL CHECK(status IN ('pending','submitting','accepted','failed','unknown')),
  externalId TEXT UNIQUE,
  request TEXT NOT NULL
) STRICT;
CREATE TABLE usage_attempts (
  id INTEGER PRIMARY KEY,
  submissionId TEXT NOT NULL REFERENCES usage_submissions(id),
  startedAt TEXT NOT NULL,
  completedAt TEXT,
  outcome TEXT CHECK(outcome IN ('accepted','rejected','temporary','ambiguous')),
  error TEXT
) STRICT;
CREATE TRIGGER usage_request_immutable BEFORE UPDATE OF id, voyageId, request ON usage_submissions
BEGIN SELECT RAISE(ABORT, 'Usage request is immutable'); END;
