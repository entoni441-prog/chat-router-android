import legacy from './index.js';
import { createAuthenticatedMcpHandler } from '../mcp/authenticated-mcp-handler.js';
import { createChatRouterWorker } from '../mcp/oauth-worker.js';

export default createChatRouterWorker({
  legacyHandler: legacy,
  mcpHandler: createAuthenticatedMcpHandler(),
});
