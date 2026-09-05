CREATE TABLE IF NOT EXISTS account_object_deletions (
  object_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
-- No user foreign key: this tombstone outlives the account it removes.
CREATE TABLE IF NOT EXISTS account_deletions (
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  next_check_at INTEGER NOT NULL,
  cursor TEXT
);
CREATE INDEX IF NOT EXISTS account_deletions_due ON account_deletions(next_check_at);
