-- OAuth replay barrier, isolated from existing relay jobs table.
-- Safe to apply before deploying OAuth; no existing columns or records changed.
CREATE TABLE IF NOT EXISTS oauth_state_redemptions (
  state_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_state_redemptions_expires
  ON oauth_state_redemptions(expires_at);
