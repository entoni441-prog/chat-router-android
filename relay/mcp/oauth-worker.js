// Cloudflare OAuthProvider composition for Chat Router.
// Staging module: do NOT deploy without the existing relay handler, MCP
// resource-server validation, OAuth KV binding and COOKIE_ENCRYPTION_KEY.
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { GitHubAuthorizationHandler } from './github-authorization-handler.js';
import { routeChatRouterRequest } from './worker-route-composition.js';

export function createChatRouterWorker({ legacyHandler, mcpHandler }) {
  if (typeof legacyHandler?.fetch !== 'function' || typeof mcpHandler?.fetch !== 'function') {
    throw new Error('Legacy relay and authenticated MCP handlers are required');
  }
  const oauth = new OAuthProvider({
    apiRoute: '/mcp',
    apiHandler: mcpHandler,
    defaultHandler: GitHubAuthorizationHandler,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    allowPlainPKCE: false,
  });
  return {
    fetch(request, env, ctx) {
      if (!env?.OAUTH_KV || !env?.COOKIE_ENCRYPTION_KEY || !env?.ROUTER_DB) {
        // Fail closed for OAuth paths; do not disable the legacy relay.
        const path = new URL(request.url).pathname;
        if (path === '/mcp' || path === '/authorize' || path === '/callback' ||
            path === '/token' || path === '/register' || path.startsWith('/.well-known/oauth-')) {
          return new Response('OAuth unavailable', { status: 503 });
        }
      }
      return routeChatRouterRequest(request, env, ctx, { legacy: legacyHandler, oauth });
    },
  };
}
