// Resource handler used ONLY behind @cloudflare/workers-oauth-provider.
// OAuthProvider verifies bearer token before invoking apiHandler and injects
// authenticated props. Never accept identity claims from request headers.
import { handleMcp } from './mcp-extension.js';
import { MCP_RESOURCE, MCP_SCOPE, OWNER_GITHUB_USER_ID } from './github-owner-policy.js';

export function createAuthenticatedMcpHandler(getAuthContext) {
  if (typeof getAuthContext !== 'function') throw new Error('OAuth context getter required');
  return {
    async fetch(request, env) {
      const context = getAuthContext();
      const props = context?.props;
      const scopes = context?.scope;
      if (props?.ownerId !== OWNER_GITHUB_USER_ID ||
          props?.resource !== MCP_RESOURCE ||
          !Array.isArray(scopes) || !scopes.includes(MCP_SCOPE)) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      return handleMcp(request, env, {
        verified: true, resource: MCP_RESOURCE, scopes,
      });
    },
  };
}
