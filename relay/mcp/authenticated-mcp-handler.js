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
      const handler = createMcpHandler(() => {
        const auth = getMcpAuthContext();
        const scopes = auth?.scope;
        const allowed = auth?.props?.ownerId === OWNER_GITHUB_USER_ID &&
          auth?.props?.resource === MCP_RESOURCE &&
          Array.isArray(scopes) && scopes.includes(MCP_SCOPE);
        const server = new McpServer({name:'chat-router',version:'1.0.0'});
        if (allowed) {
          for (const tool of TOOLS) {
            server.registerTool(tool.name, {description:tool.description,inputSchema:shapes[tool.name]}, async args => {
              const current = getMcpAuthContext();
              if (current?.props?.ownerId !== OWNER_GITHUB_USER_ID ||
                  current?.props?.resource !== MCP_RESOURCE ||
                  !Array.isArray(current?.scope) || !current.scope.includes(MCP_SCOPE)) {
                return {isError:true,content:[{type:'text',text:'Forbidden'}]};
              }
              return runAndroidTool(env, tool.name, args);
            });
          }
        }
        return server;
      });
      return handler(request, env, ctx);
    },
  };
}
