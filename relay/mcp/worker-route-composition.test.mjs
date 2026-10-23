import assert from 'node:assert/strict';
import { routeChatRouterRequest } from './worker-route-composition.js';
const base = 'https://chat-router-relay.entoni441.workers.dev';
const seen = [];
const handlers = {
  legacy: { fetch: async req => { seen.push('legacy:' + new URL(req.url).pathname); return new Response('legacy'); } },
  oauth: { fetch: async req => { seen.push('oauth:' + new URL(req.url).pathname); return new Response('oauth'); } },
};
for (const path of ['/mcp', '/authorize', '/callback', '/token', '/register',
  '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource']) {
  const r = await routeChatRouterRequest(new Request(base + path), {}, {}, handlers);
  assert.equal(await r.text(), 'oauth', path);
}
for (const path of ['/poll', '/result', '/enqueue', '/jobs/123', '/health', '/unknown']) {
  const r = await routeChatRouterRequest(new Request(base + path), {}, {}, handlers);
  assert.equal(await r.text(), 'legacy', path);
}
assert.equal((await routeChatRouterRequest(new Request('https://evil.example/mcp'), {}, {}, handlers)).status, 421);
assert.equal(seen.length, 13);
console.log('PASS: OAuth / legacy routing isolation (14 assertions)');

const staging='https://chat-router-staging.example';
const stagingResponse=await routeChatRouterRequest(new Request(staging+'/mcp'),{OAUTH_ORIGIN:staging},{},handlers);
assert.equal(await stagingResponse.text(),'oauth');
const wrongOrigin=await routeChatRouterRequest(new Request(base+'/mcp'),{OAUTH_ORIGIN:staging},{},handlers);
assert.equal(wrongOrigin.status,421);
console.log('PASS: staging origin override does not admit production origin');
