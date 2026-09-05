CREATE TABLE IF NOT EXISTS account_storage (
  user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
  limit_bytes INTEGER NOT NULL DEFAULT 1000000000,
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes >= 0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
  active_jobs INTEGER NOT NULL DEFAULT 0 CHECK(active_jobs >= 0)
);
CREATE TABLE IF NOT EXISTS account_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  request_token TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  connection_id TEXT,
  connection_revision INTEGER,
  provider TEXT NOT NULL,
  request_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  provider_task TEXT,
  result_json TEXT,
  error_code TEXT,
  reservation_bytes INTEGER NOT NULL,
  reservation_accounted INTEGER NOT NULL DEFAULT 0,
  workflow_attempt INTEGER NOT NULL DEFAULT 0,
  dispatched INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, request_token)
);
CREATE INDEX IF NOT EXISTS account_jobs_owner ON account_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_jobs_dispatch ON account_jobs(dispatched, state);
CREATE TABLE IF NOT EXISTS account_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES account_jobs(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  metadata_json TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_assets_owner ON account_assets(user_id, created_at DESC);
