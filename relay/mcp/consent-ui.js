// Browser consent form for Chat Router GitHub OAuth.
// Only a POST with a valid CSRF token can approve a client.
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function randomConsentToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64(bytes);
}
export async function digestConsentToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return b64(new Uint8Array(digest));
}
export function renderConsent({ clientName, csrfToken }) {
  const safeName = String(clientName || 'Unknown MCP client').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Chat Router permission</title><body><main><h1>Allow Chat Router access?</h1><p><strong>${safeName}</strong> requests read-only access to chats, messages and contacts on your connected Android device.</p><p>Permission: <code>beeper:read</code>. Only approve if you started this connection.</p><form method="POST" action="/authorize"><input type="hidden" name="csrf" value="${csrfToken}"><button type="submit" name="decision" value="approve">Approve</button><button type="submit" name="decision" value="deny">Deny</button></form></main></body></html>`, {
    status: 200, headers: { 'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff' }
  });
}
export async function createConsentChallenge(kv, authRequest, clientName) {
  if (!kv || !authRequest?.clientId) throw new Error('Invalid authorization request');
  const nonce = randomConsentToken();
  const csrf = randomConsentToken();
  await kv.put('chat-router-consent:' + await digestConsentToken(nonce),
    JSON.stringify({ csrfHash: await digestConsentToken(csrf), authRequest, clientName, issuedAt: Date.now() }),
    { expirationTtl: 300 });
  const response = renderConsent({ clientName, csrfToken: csrf });
  response.headers.set('set-cookie', '__Host-chat_router_consent=' + nonce + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300');
  return response;
}
export async function verifyConsentPost(kv, request, now = Date.now()) {
  const form = await request.formData();
  const cookie = (request.headers.get('cookie') || '').split(';').map(s=>s.trim())
    .find(s=>s.startsWith('__Host-chat_router_consent='));
  const nonce = cookie?.slice('__Host-chat_router_consent='.length);
  const csrf = form.get('csrf');
  if (!nonce || typeof csrf !== 'string' || form.get('decision') !== 'approve') throw new Error('Consent denied');
  const raw = await kv.get('chat-router-consent:' + await digestConsentToken(nonce));
  if (!raw) throw new Error('Consent expired');
  const record = JSON.parse(raw);
  if (record.csrfHash !== await digestConsentToken(csrf) ||
      !Number.isSafeInteger(record.issuedAt) || record.issuedAt > now ||
      now - record.issuedAt >= 300000) throw new Error('Consent invalid');
  // Caller must atomically redeem consent nonce (e.g. D1 replay barrier)
  // before beginning the GitHub redirect.
  return { authRequest: record.authRequest, nonceHash: await digestConsentToken(nonce), expiresAt: record.issuedAt + 300000 };
}
