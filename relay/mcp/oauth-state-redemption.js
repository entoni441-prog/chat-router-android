// Atomic, one-time OAuth state redemption using the existing ROUTER_DB D1 binding.
// Schema: CREATE TABLE IF NOT EXISTS oauth_state_redemptions
//   (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
// Caller MUST validate state, browser-bound cookie, expiry and consent first.
// This only provides a replay barrier; it does not implement OAuth by itself.
export async function redeemStateOnce(db, stateHash, expiresAt, now = Date.now()) {
  if (!db || typeof stateHash !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(stateHash) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 300000) {
    return false;
  }
  const result = await db.prepare(
    'INSERT OR IGNORE INTO oauth_state_redemptions (state_hash, expires_at) VALUES (?, ?)'
  ).bind(stateHash, expiresAt).run();
  return result?.meta?.changes === 1;
}
export async function pruneRedeemedStates(db, now = Date.now()) {
  return db.prepare('DELETE FROM oauth_state_redemptions WHERE expires_at < ?').bind(now).run();
}
