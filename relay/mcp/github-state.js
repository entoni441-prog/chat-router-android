// Single-use OAuth browser transaction storage for GitHub sign-in.
// Requires Cloudflare Workers KV binding OAUTH_KV; do not use this without
// an authorization server that validates the MCP client's PKCE challenge.
// Browser cookie holds a random nonce, not a GitHub token.
const TTL = 300;
const PREFIX = 'github-oauth-state:';
const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}
export async function stateDigest(value) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return b64url(new Uint8Array(hash));
}
export async function beginGitHubTransaction(kv, { clientTransaction, requestedScope, requestedResource }) {
  if (!kv || typeof clientTransaction !== 'string' || clientTransaction.length < 16 ||
      requestedScope !== 'beeper:read' ||
      requestedResource !== 'https://chat-router-relay.entoni441.workers.dev/mcp') {
    throw new Error('Invalid OAuth transaction');
  }
  const state = randomNonce();
  const cookieNonce = randomNonce();
  const key = PREFIX + await stateDigest(state);
  await kv.put(key, JSON.stringify({
    clientTransaction,
    cookieHash: await stateDigest(cookieNonce),
    requestedScope,
    requestedResource,
    issuedAt: Date.now(),
  }), { expirationTtl: TTL });
  return {
    state,
    cookie: '__Host-chat_router_oauth=' + cookieNonce + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + TTL,
  };
}
export async function consumeGitHubTransaction(kv, { state, cookieNonce }) {
  if (!kv || typeof state !== 'string' || state.length < 32 ||
      typeof cookieNonce !== 'string' || cookieNonce.length < 32) throw new Error('Invalid OAuth state');
  const key = PREFIX + await stateDigest(state);
  // KV has eventual consistency and no atomic consume. A single-use guarantee
  // requires D1 transaction or Durable Object; therefore this helper MUST NOT
  // be used for token issuance until backed by atomic redemption.
  const raw = await kv.get(key);
  if (!raw) throw new Error('Expired OAuth state');
  const transaction = JSON.parse(raw);
  if (transaction.cookieHash !== await stateDigest(cookieNonce) ||
      Date.now() - transaction.issuedAt > TTL * 1000) throw new Error('OAuth state mismatch');
  return { ...transaction, requiresAtomicRedemption: true, storageKey: key };
}
