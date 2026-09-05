-- Written before the asset row inside the same D1 batch to classify quota
-- overflow. No foreign key: the journal must precede that asset insert.
CREATE TABLE IF NOT EXISTS account_asset_retention (
  asset_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  promoting INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS account_retention_expiry ON account_asset_retention(expires_at);
