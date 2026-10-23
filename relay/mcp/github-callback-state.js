// Verify a GitHub callback's browser-bound state and atomically redeem it.
// A successful return is ONLY a verified login transaction, not an MCP token.
// The OAuth provider must still validate PKCE, client redirect URI and consent.
import { consumeGitHubTransaction, stateDigest } from './github-state.js';
import { redeemStateOnce } from './oauth-state-redemption.js';

export async function verifyAndRedeemGitHubCallback({ oauthKv, db, state, cookieNonce, now = Date.now() }) {
  const tx = await consumeGitHubTransaction(oauthKv, { state, cookieNonce });
  if (!tx.requiresAtomicRedemption || typeof tx.issuedAt !== 'number' ||
      !Number.isSafeInteger(tx.issuedAt) || tx.issuedAt > now ||
      now - tx.issuedAt >= 300000) {
    throw new Error('Expired or invalid OAuth transaction');
  }
  const redeemed = await redeemStateOnce(db, await stateDigest(state), tx.issuedAt + 300000, now);
  if (!redeemed) throw new Error('OAuth state already redeemed');
  // No GitHub token or cookie is returned to the caller.
  return {
    clientTransaction: tx.clientTransaction,
    requestedScope: tx.requestedScope,
    requestedResource: tx.requestedResource,
  };
}
