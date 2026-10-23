// GitHub OAuth callback for the Cloudflare workers-oauth-provider.
// Install behind OAuthProvider's defaultHandler; do not expose as a legacy relay route.
import { verifyAndRedeemGitHubCallback } from './github-callback-state.js';
import { exchangeGitHubCode, fetchVerifiedGitHubUser } from './github-upstream.js';
import { verifyGitHubOwner, MCP_RESOURCE, MCP_SCOPE } from './github-owner-policy.js';

const COOKIE = '__Host-chat_router_oauth';
const CALLBACK = 'https://chat-router-relay.entoni441.workers.dev/callback';
const fail = (status = 400) => new Response('Authorization failed', {
  status, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
});
const clearCookie = COOKIE + '=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';

export async function githubCallback(request, env, oauthProvider, { lookupTransaction }) {
  if (request.method !== 'GET' || new URL(request.url).pathname !== '/callback') return fail(404);
  if (!env?.OAUTH_KV || !env?.ROUTER_DB || !env?.GITHUB_CLIENT_ID ||
      !env?.GITHUB_CLIENT_SECRET || !oauthProvider?.completeAuthorization ||
      typeof lookupTransaction !== 'function') return fail(503);
  const url = new URL(request.url);
  if (url.origin !== new URL(CALLBACK).origin) return fail(400);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const cookies = request.headers.get('cookie') || '';
  const cookieNonce = cookies.split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!state || !code || !cookieNonce) return fail();
  try {
    // This atomically burns the state BEFORE the GitHub code exchange.
    const tx = await verifyAndRedeemGitHubCallback({
      oauthKv: env.OAUTH_KV, db: env.ROUTER_DB, state, cookieNonce,
    });
    const authRequest = await lookupTransaction(tx.clientTransaction);
    if (!authRequest || authRequest.resource !== MCP_RESOURCE ||
        authRequest.scope !== MCP_SCOPE || !authRequest.clientId) return fail(403);
    // Consent must be bound to this exact OAuth transaction, not just a cookie.
    const consent = authRequest.consent;
    if (!consent || consent.approved !== true || consent.verified !== true ||
        consent.transactionId !== tx.clientTransaction) return fail(403);
    const githubToken = await exchangeGitHubCode({
      code, clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET, redirectUri: CALLBACK,
    });
    const githubUser = await fetchVerifiedGitHubUser({ token: githubToken });
    if (!verifyGitHubOwner({
      githubUser, githubApiVerified: true, requestedResource: MCP_RESOURCE,
      requestedScopes: [MCP_SCOPE], consent,
    })) return fail(403);
    // Never put the upstream GitHub access token in the downstream MCP token.
    const { redirectTo } = await oauthProvider.completeAuthorization({
      request: authRequest, userId: String(githubUser.id),
      scope: [MCP_SCOPE], props: { ownerId: githubUser.id, resource: MCP_RESOURCE },
      metadata: { label: 'Chat Router owner' },
    });
    const target = new URL(redirectTo);
    if (target.protocol !== 'https:' && target.hostname !== 'localhost' &&
        target.hostname !== '127.0.0.1') return fail(500);
    return new Response(null, {
      status: 302,
      headers: { location: redirectTo, 'set-cookie': clearCookie, 'cache-control': 'no-store' },
    });
  } catch {
    return new Response('Authorization failed', {
      status: 400, headers: { 'set-cookie': clearCookie, 'cache-control': 'no-store' },
    });
  }
}
