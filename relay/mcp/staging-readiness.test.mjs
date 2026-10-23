import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../wrangler.staging.toml', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/oauth-entry.js', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const android = readFileSync(new URL('../../app/src/main/java/org/chatrouter/bridge/RelayPoller.kt', import.meta.url), 'utf8');
const required = [
  'name = "chat-router-relay-staging"',
  'main = "src/oauth-entry.js"',
  'OAUTH_ORIGIN = "https://chat-router-relay-staging.entoni441.workers.dev"',
  'binding = "OAUTH_KV"',
  'id = "39b20e97fbfe43d7aa090674f1a3743f"',
  'binding = "ROUTER_DB"',
  'database_id = "e135858f-3e88-414a-8459-df69cb9d0455"',
];
for (const item of required) assert.ok(config.includes(item), 'Missing staging config: ' + item);
assert.ok(!config.includes('bb8aa7c9-b116-423a-9e88-b68da6c9d87d'), 'Production D1 must not be bound');
assert.ok(!config.includes('c5f0db2ccc8b402687f213a4691a2116'), 'Production KV must not be bound');
for (const secret of ['CLIENT_TOKEN','DEVICE_TOKEN','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','COOKIE_ENCRYPTION_KEY']) {
  assert.ok(!new RegExp('^' + secret + '\\s*=', 'm').test(config), 'Secret must not be committed: ' + secret);
}
assert.ok(entry.includes('createChatRouterWorker'));
assert.ok(legacy.includes('"/poll"') && legacy.includes('"/result"'));
assert.ok(android.includes('getString("endpoint"') && android.includes('getString("device_token"'));
console.log('PASS: staging binding isolation, entrypoint and Android configuration contract');
