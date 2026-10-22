/**
 * Chat Router MCP OAuth resource-server boundary (staging only).
 *
 * Intended for the official @cloudflare/workers-oauth-provider 1.x API.
 * This file is deliberately not a deployed entrypoint: an authorization
 * server with verified owner sign-in and explicit consent is still required.
 * Do not use CLIENT_TOKEN or DEVICE_TOKEN to authorize ChatGPT.
 *
 * MCP_RESOURCE must be the exact public URL ending in /mcp.
 */
import { OAuthResourceServer } from "@cloudflare/workers-oauth-provider";

export function createChatRouterResourceServer({
  resourceUrl,
  authorizationServerUrl,
  validateToken,
  handleMcp,
}) {
  const resource = new URL(resourceUrl);
  const issuer = new URL(authorizationServerUrl);
  if (resource.protocol !== "https:" || resource.pathname !== "/mcp" ||
      issuer.protocol !== "https:" || typeof validateToken !== "function" ||
      typeof handleMcp !== "function") {
    throw new Error("Invalid OAuth resource-server configuration");
  }
  return new OAuthResourceServer({
    resourceMetadata: {
      resource: resource.toString(),
      authorization_servers: [issuer.origin],
      scopes_supported: ["beeper:read"],
    },
    requiredScopes: ["beeper:read"],
    validateToken,
    handler: {
      async fetch(request, env, ctx) {
        // ctx.auth is provided only after the official resource server has
        // validated the token. Never infer verified=true from a header.
        const auth = ctx.auth;
        const scopes = Array.isArray(auth?.scope)
          ? auth.scope
          : typeof auth?.scope === "string"
            ? auth.scope.split(/\s+/)
            : [];
        if (!scopes.includes("beeper:read")) {
          return new Response("Forbidden", { status: 403 });
        }
        return handleMcp(request, env, {
          verified: true,
          resource: resource.toString(),
          scopes,
        });
      },
    },
  });
}
