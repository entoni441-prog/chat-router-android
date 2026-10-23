// MCP endpoint behind OAuthProvider; request-local context is established by createMcpHandler.
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { z } from 'zod';
import { TOOLS, runAndroidTool } from './mcp-extension.js';
import { MCP_RESOURCE, MCP_SCOPE, OWNER_GITHUB_USER_ID } from './github-owner-policy.js';

const shapes = {
  list_chats: z.object({limit:z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).optional(),query:z.string().optional(),protocol:z.string().optional(),is_unread:z.boolean().optional()}).strict(),
  list_messages: z.object({room_id:z.string().min(1),limit:z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).optional()}).strict(),
  search_messages: z.object({query:z.string().min(1),limit:z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).optional()}).strict(),
  list_contacts: z.object({limit:z.number().int().min(1).max(100).optional(),offset:z.number().int().min(0).optional(),query:z.string().optional(),protocol:z.string().optional()}).strict(),
};

export function createAuthenticatedMcpHandler() {
  return {
    fetch(request, env, ctx) {
      // Staging-only diagnostics: no credentials, cookies, request bodies or tool arguments.
      const diagnostic = (env?.OAUTH_ORIGIN || '').includes('chat-router-relay-staging.');
      const started = Date.now();
      if (diagnostic) console.log('mcp_probe', JSON.stringify({
        phase: 'request', method: request.method,
        accept: request.headers.get('accept') || '',
        contentType: request.headers.get('content-type') || '',
        protocolVersion: request.headers.get('mcp-protocol-version') || '',
        hasSession: !!request.headers.get('mcp-session-id'),
      }));
      const handler = createMcpHandler(() => {
        const auth = getMcpAuthContext();
        const scopes = auth?.scope;
        const resource = (env?.OAUTH_ORIGIN || 'https://chat-router-relay.entoni441.workers.dev') + '/mcp';
      const allowed = auth?.props?.ownerId === OWNER_GITHUB_USER_ID &&
          auth?.props?.resource === resource &&
          Array.isArray(scopes) && scopes.includes(MCP_SCOPE);
        const server = new McpServer({name:'chat-router',version:'1.0.0'});
        if (diagnostic) console.log('mcp_probe', JSON.stringify({
          phase: 'registration', ownerMatches: auth?.props?.ownerId === OWNER_GITHUB_USER_ID,
          resourceMatches: auth?.props?.resource === resource,
          scopeIsArray: Array.isArray(scopes), hasReadScope: Array.isArray(scopes) && scopes.includes(MCP_SCOPE),
          allowed, toolCount: allowed ? TOOLS.length : 0,
        }));
        if (allowed) {
          for (const tool of TOOLS) {
            server.registerTool(tool.name, {description:tool.description,inputSchema:shapes[tool.name].shape}, async args => {
              const current = getMcpAuthContext();
              if (current?.props?.ownerId !== OWNER_GITHUB_USER_ID ||
                  current?.props?.resource !== resource ||
                  !Array.isArray(current?.scope) || !current.scope.includes(MCP_SCOPE)) {
                return {isError:true,content:[{type:'text',text:'Forbidden'}]};
              }
              return runAndroidTool(env, tool.name, args);
            });
          }
        }
        return server;
      });
      return Promise.resolve().then(() => handler(request, env, ctx)).then(response => {
        if (diagnostic) console.log('mcp_probe', JSON.stringify({
          phase: 'response', status: response.status,
          contentType: response.headers.get('content-type') || '',
          durationMs: Date.now() - started,
        }));
        return response;
      }, error => {
        if (diagnostic) console.log('mcp_probe', JSON.stringify({
          phase: 'error', errorType: error?.name || 'Error',
        }));
        throw error;
      });
    },
  };
}
