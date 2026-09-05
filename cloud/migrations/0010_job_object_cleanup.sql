-- Terminal jobs keep a permanent journal row so the bounded scanner advances
-- instead of selecting the same oldest jobs forever. The nullable next check
-- marks a completed grace/rescan cycle without losing that progress marker.
CREATE TABLE IF NOT EXISTS account_job_object_cleanup (
  job_id TEXT PRIMARY KEY REFERENCES account_jobs(id) ON DELETE CASCADE,
  next_check_at INTEGER,
  cleanup_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_job_object_cleanup_due
  ON account_job_object_cleanup(next_check_at);
