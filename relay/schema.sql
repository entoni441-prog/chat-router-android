CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','claimed','done')),
  result TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status, created_at);
