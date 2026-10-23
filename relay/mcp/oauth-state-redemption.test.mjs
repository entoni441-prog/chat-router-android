import assert from 'node:assert/strict';
import { redeemStateOnce, pruneRedeemedStates } from './oauth-state-redemption.js';

// D1 contract mock; this is not a live concurrency test.
const rows = new Map();
const db = { prepare(sql) { return { bind(...args) { return { async run() {
  if (sql.startsWith('INSERT')) {
    const [hash, expiresAt] = args;
    if (rows.has(hash)) return { meta: { changes: 0 } };
    rows.set(hash, expiresAt);
    return { meta: { changes: 1 } };
  }
  if (sql.startsWith('DELETE')) {
    let changes = 0;
    for (const [hash, expiresAt] of rows) {
      if (expiresAt < args[0]) { rows.delete(hash); changes++; }
    }
    return { meta: { changes } };
  }
  throw new Error('Unexpected SQL');
} }; } }; } };
const now = Date.now(), state = 'A'.repeat(43);
assert.equal(await redeemStateOnce(db, state, now + 60000, now), true);
assert.equal(await redeemStateOnce(db, state, now + 60000, now), false);
assert.equal(await redeemStateOnce(db, 'bad', now + 60000, now), false);
assert.equal(await redeemStateOnce(db, 'B'.repeat(43), now - 1, now), false);
assert.equal(await redeemStateOnce(db, 'C'.repeat(43), now + 400000, now), false);
assert.equal((await pruneRedeemedStates(db, now + 60001)).meta.changes, 1);
console.log('PASS: OAuth state replay contract checks (mock D1)');
