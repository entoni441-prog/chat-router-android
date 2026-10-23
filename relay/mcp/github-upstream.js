// GitHub OAuth upstream identity verification for the Chat Router MCP.
// This module is NOT a standalone OAuth authorization server.
// The caller must validate the browser session, state and PKCE transaction
// before calling exchangeGitHubCode, and must require explicit owner consent.
// Never expose the GitHub access token to the MCP client or logs.
const API = 'https://api.github.com/user';
const TOKEN = 'https://github.com/login/oauth/access_token';

export async function exchangeGitHubCode({ code, clientId, clientSecret, redirectUri, fetcher = fetch }) {
  if (typeof code !== 'string' || !code || code.length > 2048) throw new Error('Invalid OAuth code');
  if (!clientId || !clientSecret || !redirectUri?.startsWith('https://')) throw new Error('Missing OAuth configuration');
  const response = await fetcher(TOKEN, {
    method: 'POST',
    headers: { 'accept': 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  if (!response.ok) throw new Error('GitHub token exchange failed');
  const payload = await response.json();
  if (payload.error || typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('GitHub token exchange rejected');
  }
  return payload.access_token;
}

export async function fetchVerifiedGitHubUser({ token, fetcher = fetch }) {
  if (typeof token !== 'string' || !token) throw new Error('Missing GitHub token');
  const response = await fetcher(API, {
    headers: {
      'authorization': 'Bearer ' + token,
      'accept': 'application/vnd.github+json',
      'user-agent': 'chat-router-mcp',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error('GitHub identity verification failed');
  const user = await response.json();
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error('Invalid GitHub identity');
  return { id: user.id };
}
