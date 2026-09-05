CREATE TABLE IF NOT EXISTS account_spend (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL UNIQUE,
  entry_json TEXT NOT NULL,
  at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
-- Spend intentionally has no job foreign key: deleting job history must not
-- erase its billing history. Account deletion still cascades through user_id.
CREATE INDEX IF NOT EXISTS account_spend_owner ON account_spend(user_id, deleted, at DESC, id DESC);
