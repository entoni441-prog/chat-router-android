// GitHub OAuth identity gate for Chat Router MCP.
// GitHub login is authentication only; it does not itself authorize Beeper access.
// Verify GitHub's /user response with a server-side OAuth token before calling this.
// GitHub user IDs are stable; usernames and emails are not.
export const OWNER_GITHUB_USER_ID = 345764393;
export const MCP_SCOPE = 'beeper:read';
export const MCP_RESOURCE = 'https://chat-router-relay.entoni441.workers.dev/mcp';

export function verifyGitHubOwner({ githubUser, githubApiVerified, requestedResource, requestedScopes, consent } = {}) {
  if (githubApiVerified !== true || !githubUser || githubUser.id !== OWNER_GITHUB_USER_ID) return false;
  if (requestedResource !== MCP_RESOURCE || !Array.isArray(requestedScopes) ||
      requestedScopes.length !== 1 || requestedScopes[0] !== MCP_SCOPE) return false;
  if (!consent || consent.approved !== true || consent.verified !== true ||
      typeof consent.transactionId !== 'string' || consent.transactionId.length < 16) return false;
  return true;
}
