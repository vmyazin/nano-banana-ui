CREATE TABLE IF NOT EXISTS account_imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL,
  metadata_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  reservation_accounted INTEGER NOT NULL DEFAULT 0,
  upload_attempt INTEGER NOT NULL DEFAULT 1,
  upload_token_hash TEXT,
  upload_token_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(user_id, client_id)
);
CREATE INDEX IF NOT EXISTS account_imports_owner ON account_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_imports_expiry ON account_imports(state, expires_at);
CREATE INDEX IF NOT EXISTS account_imports_upload_token ON account_imports(upload_token_hash);
CREATE TABLE IF NOT EXISTS account_import_attempts (
  import_id TEXT NOT NULL REFERENCES account_imports(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active',
  cleanup_after INTEGER,
  cleanup_until INTEGER,
  PRIMARY KEY (import_id, attempt)
);
CREATE INDEX IF NOT EXISTS account_import_attempts_cleanup ON account_import_attempts(state, cleanup_after);
