import { exchangeGitHubCode, fetchVerifiedGitHubUser } from './github-upstream.js';
import { verifyGitHubOwner, MCP_RESOURCE, MCP_SCOPE } from './github-owner-policy.js';
import assert from 'node:assert/strict';

const fakeFetch = async (url, options) => {
  if (url.endsWith('/access_token')) {
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).redirect_uri, 'https://example.com/callback');
    return { ok: true, json: async () => ({ access_token: 'fake-token' }) };
  }
  assert.equal(options.headers.authorization, 'Bearer fake-token');
  return { ok: true, json: async () => ({ id: 345764393, login: 'owner' }) };
};
const token = await exchangeGitHubCode({ code: 'code', clientId: 'id', clientSecret: 'secret', redirectUri: 'https://example.com/callback', fetcher: fakeFetch });
const githubUser = await fetchVerifiedGitHubUser({ token, fetcher: fakeFetch });
const consent = { approved: true, verified: true, transactionId: 'transaction-1234567890' };
assert.equal(verifyGitHubOwner({ githubUser, githubApiVerified: true, requestedResource: MCP_RESOURCE, requestedScopes: [MCP_SCOPE], consent }), true);
assert.equal(verifyGitHubOwner({ githubUser: { id: 1 }, githubApiVerified: true, requestedResource: MCP_RESOURCE, requestedScopes: [MCP_SCOPE], consent }), false);
assert.equal(verifyGitHubOwner({ githubUser, githubApiVerified: false, requestedResource: MCP_RESOURCE, requestedScopes: [MCP_SCOPE], consent }), false);
assert.equal(verifyGitHubOwner({ githubUser, githubApiVerified: true, requestedResource: MCP_RESOURCE, requestedScopes: ['beeper:write'], consent }), false);
assert.equal(verifyGitHubOwner({ githubUser, githubApiVerified: true, requestedResource: MCP_RESOURCE, requestedScopes: [MCP_SCOPE], consent: { ...consent, approved: false } }), false);
await assert.rejects(() => fetchVerifiedGitHubUser({ token, fetcher: async () => ({ ok: true, json: async () => ({ id: '345764393' }) }) }));
await assert.rejects(() => exchangeGitHubCode({ code: 'code', clientId: 'id', clientSecret: 'secret', redirectUri: 'https://example.com/callback', fetcher: async () => ({ ok: true, json: async () => ({ error: 'bad_verification_code' }) }) }));
console.log('GitHub OAuth upstream checks passed');
