// Compose an OAuth MCP handler with the existing Android relay without
// changing the legacy relay's bearer-token checks or routes.
// This module does not itself implement OAuth or create a public MCP endpoint.
const OAUTH_PATHS = new Set(['/mcp', '/authorize', '/callback', '/token', '/register']);
const WELL_KNOWN_PREFIX = '/.well-known/oauth-';
const LEGACY_PATHS = new Set(['/poll', '/result', '/enqueue', '/health']);

export function routeChatRouterRequest(request, env, ctx, { legacy, oauth }) {
  if (!legacy?.fetch || !oauth?.fetch) throw new Error('Both handlers are required');
  const url = new URL(request.url);
  if (url.origin !== 'https://chat-router-relay.entoni441.workers.dev') {
    return new Response('Misdirected request', { status: 421 });
  }
  const path = url.pathname;
  if (OAUTH_PATHS.has(path) || path.startsWith(WELL_KNOWN_PREFIX)) {
    return oauth.fetch(request, env, ctx);
  }
  if (LEGACY_PATHS.has(path) || /^\/jobs\/[^/]+$/.test(path)) {
    return legacy.fetch(request, env, ctx);
  }
  // Unknown paths stay with the legacy handler, preserving its auth-before-404
  // behavior. Never expose a new unauthenticated fallback.
  return legacy.fetch(request, env, ctx);
}
