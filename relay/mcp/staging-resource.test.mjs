import assert from 'node:assert/strict';
import { verifyGitHubOwner, MCP_RESOURCE, OWNER_GITHUB_USER_ID, MCP_SCOPE } from './github-owner-policy.js';
import { beginGitHubTransaction, consumeGitHubTransaction } from './github-state.js';
import { storeApprovedAuthRequest, lookupApprovedAuthRequest } from './oauth-transaction-store.js';

const staging = 'https://chat-router-relay-staging.entoni441.workers.dev/mcp';
const consent = { approved:true, verified:true, transactionId:'s'.repeat(43) };
const owner = { githubUser:{id:OWNER_GITHUB_USER_ID}, githubApiVerified:true,
  requestedScopes:[MCP_SCOPE], consent };
assert.equal(verifyGitHubOwner({...owner,requestedResource:staging,expectedResource:staging}),true);
assert.equal(verifyGitHubOwner({...owner,requestedResource:MCP_RESOURCE,expectedResource:staging}),false);
assert.equal(verifyGitHubOwner({...owner,requestedResource:staging}),false);

const map = new Map();
const kv = {
  async put(k,v) { map.set(k,v); },
  async get(k) { return map.get(k) ?? null; },
};
const tx = await beginGitHubTransaction(kv, {
  clientTransaction:'t'.repeat(43),requestedScope:MCP_SCOPE,
  requestedResource:staging,expectedResource:staging,
});
const nonce = tx.cookie.match(/__Host-chat_router_oauth=([^;]+)/)?.[1];
assert.ok(nonce);
const readback = await consumeGitHubTransaction(kv,{state:tx.state,cookieNonce:nonce});
assert.equal(readback.requestedResource,staging);
await assert.rejects(() => beginGitHubTransaction(kv,{
  clientTransaction:'t'.repeat(43),requestedScope:MCP_SCOPE,
  requestedResource:MCP_RESOURCE,expectedResource:staging,
}));

const authRequest = {clientId:'client',redirectUri:'https://client.example/callback',
  state:'state',codeChallenge:'a'.repeat(43),codeChallengeMethod:'S256',
  resource:staging,scope:MCP_SCOPE};
await storeApprovedAuthRequest(kv,{transactionId:'s'.repeat(43),authRequest,
  csrfValidated:true,consentApproved:true,expectedResource:staging});
assert.ok(await lookupApprovedAuthRequest(kv,'s'.repeat(43),Date.now(),staging));
assert.equal(await lookupApprovedAuthRequest(kv,'s'.repeat(43),Date.now(),MCP_RESOURCE),null);
console.log('PASS: staging audience isolation for owner, state and consent');
