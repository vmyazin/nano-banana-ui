CREATE TABLE IF NOT EXISTS account_ingress_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_ingress_limits_expiry ON account_ingress_limits(expires_at);
