// OAuth authorization endpoints. Intended as OAuthProvider defaultHandler;
// the OAuthProvider handles /token, /register and PKCE validation.
import { createConsentChallenge, verifyConsentPost } from './consent-ui.js';
import { redeemStateOnce } from './oauth-state-redemption.js';
import { storeApprovedAuthRequest, lookupApprovedAuthRequest } from './oauth-transaction-store.js';
import { beginGitHubTransaction, randomNonce } from './github-state.js';
import { githubCallback } from './github-callback.js';
import { MCP_RESOURCE, MCP_SCOPE } from './github-owner-policy.js';

const ORIGIN = 'https://chat-router-relay.entoni441.workers.dev';
const COOKIE_CLEAR = '__Host-chat_router_consent=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
const error = (status = 400) => new Response('Authorization request rejected', { status, headers: { 'cache-control': 'no-store' } });
function checkRequest(auth, resource = MCP_RESOURCE) {
  return auth && typeof auth.clientId === 'string' && auth.clientId &&
    auth.resource === resource &&
    (auth.scope === MCP_SCOPE || (Array.isArray(auth.scope) && auth.scope.length === 1 && auth.scope[0] === MCP_SCOPE)) &&
    auth.codeChallengeMethod === 'S256' && typeof auth.codeChallenge === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(auth.codeChallenge);
}
export async function handleGitHubAuthorization(request, env) {
  const url = new URL(request.url);
  const origin = env?.OAUTH_ORIGIN || ORIGIN;
  if (url.origin !== origin) return error(421);
  if (!env?.OAUTH_PROVIDER || !env?.OAUTH_KV || !env?.ROUTER_DB || !env?.GITHUB_CLIENT_ID) return error(503);
  if (url.pathname === '/callback') {
    return githubCallback(request, env, env.OAUTH_PROVIDER, {
      lookupTransaction: id => lookupApprovedAuthRequest(env.OAUTH_KV, id, Date.now(), origin + '/mcp'),
    });
  }
  if (url.pathname !== '/authorize') return error(404);
  if (request.method === 'GET') {
    let auth;
    try { auth = await env.OAUTH_PROVIDER.parseAuthRequest(request); }
    catch { return error(); }
    if (!checkRequest(auth, origin + '/mcp')) return error();
    const client = await env.OAUTH_PROVIDER.lookupClient(auth.clientId);
    if (!client) return error();
    return createConsentChallenge(env.OAUTH_KV, auth, client.clientName || client.client_name || 'MCP client');
  }
  if (request.method !== 'POST') return error(405);
  try {
    const consent = await verifyConsentPost(env.OAUTH_KV, request);
    if (!checkRequest(consent.authRequest, origin + '/mcp')) return error();
    const claimed = await redeemStateOnce(env.ROUTER_DB, consent.nonceHash, consent.expiresAt);
    if (!claimed) return error(409);
    const transactionId = randomNonce();
    await storeApprovedAuthRequest(env.OAUTH_KV, {
      transactionId, authRequest: consent.authRequest, csrfValidated: true, consentApproved: true, expectedResource: origin + '/mcp',
    });
    const { state, cookie } = await beginGitHubTransaction(env.OAUTH_KV, {
      clientTransaction: transactionId, requestedScope: MCP_SCOPE, requestedResource: origin + '/mcp', expectedResource: origin + '/mcp',
    });
    const target = new URL('https://github.com/login/oauth/authorize');
    target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    target.searchParams.set('redirect_uri', origin + '/callback');
    target.searchParams.set('scope', 'read:user');
    target.searchParams.set('state', state);
    const headers = new Headers({ location: target.href, 'cache-control': 'no-store' });
    headers.append('set-cookie', COOKIE_CLEAR);
    headers.append('set-cookie', cookie);
    return new Response(null, { status: 302, headers });
  } catch {
    return error();
  }
}
export const GitHubAuthorizationHandler = { fetch: handleGitHubAuthorization };
