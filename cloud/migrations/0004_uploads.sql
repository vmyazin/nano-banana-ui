CREATE TABLE IF NOT EXISTS account_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_uploads_owner ON account_uploads(user_id, state, expires_at);
CREATE TABLE IF NOT EXISTS account_job_inputs (
  job_id TEXT NOT NULL REFERENCES account_jobs(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL REFERENCES account_uploads(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, upload_id)
);
CREATE TABLE IF NOT EXISTS account_media_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  job_id TEXT REFERENCES account_jobs(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_media_expiry ON account_media_tokens(expires_at);
