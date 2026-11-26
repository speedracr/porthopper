ALTER TABLE usage_submissions ADD COLUMN createdAt TEXT;
ALTER TABLE usage_submissions ADD COLUMN attemptedAt TEXT;
UPDATE usage_submissions SET
  createdAt = COALESCE((SELECT MIN(startedAt) FROM usage_attempts WHERE submissionId = usage_submissions.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  attemptedAt = (SELECT MAX(startedAt) FROM usage_attempts WHERE submissionId = usage_submissions.id);

-- Upgrade the preliminary minutes contract from the immutable voyage milliseconds,
-- not by multiplying the old floating-point minutes quantity.
DROP TRIGGER usage_request_immutable;
UPDATE usage_submissions SET request = json_set(json_remove(request, '$.quantity', '$.unit'),
  '$.durationSeconds', (SELECT durationMs / 1000.0 FROM voyages WHERE id = voyageId))
WHERE json_type(request, '$.durationSeconds') IS NULL;
CREATE TRIGGER usage_request_immutable BEFORE UPDATE OF id, voyageId, request, createdAt ON usage_submissions
BEGIN SELECT RAISE(ABORT, 'Usage request is immutable'); END;
