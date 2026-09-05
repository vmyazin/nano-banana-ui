CREATE TABLE IF NOT EXISTS account_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  hint TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);
