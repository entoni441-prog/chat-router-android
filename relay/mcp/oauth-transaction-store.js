// Short-lived authorization-request storage for Cloudflare OAuthProvider.
// A request must come from OAUTH_PROVIDER.parseAuthRequest and be approved
// by the authenticated browser's CSRF-protected consent POST before storage.
// Do not persist GitHub tokens, passwords, or arbitrary request headers.
const PREFIX = 'chat-router-auth-request:';
const TTL = 300;
const RESOURCE = 'https://chat-router-relay.entoni441.workers.dev/mcp';
const SCOPE = 'beeper:read';

export async function storeApprovedAuthRequest(kv, { transactionId, authRequest, csrfValidated, consentApproved }) {
  if (!kv || typeof transactionId !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(transactionId) ||
      csrfValidated !== true || consentApproved !== true ||
      !authRequest || typeof authRequest.clientId !== 'string' || !authRequest.clientId ||
      authRequest.resource !== RESOURCE || authRequest.scope !== SCOPE) {
    throw new Error('Authorization request was not approved');
  }
  const record = {
    clientId: authRequest.clientId,
    redirectUri: authRequest.redirectUri,
    state: authRequest.state,
    codeChallenge: authRequest.codeChallenge,
    codeChallengeMethod: authRequest.codeChallengeMethod,
    resource: RESOURCE,
    scope: SCOPE,
    consent: { approved: true, verified: true, transactionId },
  };
  // Keep the complete OAuthProvider parsed request, including optional fields,
  // to preserve the provider's completeAuthorization contract.
  await kv.put(PREFIX + transactionId, JSON.stringify({ authRequest: { ...authRequest, ...record }, issuedAt: Date.now() }),
    { expirationTtl: TTL });
  return transactionId;
}

export async function lookupApprovedAuthRequest(kv, transactionId, now = Date.now()) {
  if (!kv || typeof transactionId !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(transactionId)) return null;
  const raw = await kv.get(PREFIX + transactionId);
  if (!raw) return null;
  let record;
  try { record = JSON.parse(raw); } catch { return null; }
  if (!Number.isSafeInteger(record.issuedAt) || record.issuedAt > now ||
      now - record.issuedAt >= TTL * 1000) return null;
  const auth = record.authRequest;
  if (!auth || auth.resource !== RESOURCE || auth.scope !== SCOPE ||
      auth.consent?.transactionId !== transactionId || auth.consent?.verified !== true) return null;
  return auth;
}
