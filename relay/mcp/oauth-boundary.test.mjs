import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGitHubAuthorization } from './github-authorization-handler.js';

const base='https://chat-router-relay.entoni441.workers.dev';
const request=(path,init)=>new Request(base+path,init);

test('OAuth authorization fails closed without provider or state storage',async()=>{
 const response=await handleGitHubAuthorization(request('/authorize'),{});
 assert.equal(response.status,503);
});
test('OAuth rejects a foreign origin before touching credentials',async()=>{
 const response=await handleGitHubAuthorization(new Request('https://other.example/authorize'),{});
 assert.equal(response.status,421);
});
test('OAuth rejects unknown routes even with provider available',async()=>{
 const response=await handleGitHubAuthorization(request('/other'),{
  OAUTH_PROVIDER:{},OAUTH_KV:{},ROUTER_DB:{},GITHUB_CLIENT_ID:'test'
 });
 assert.equal(response.status,404);
});
test('OAuth denies invalid client request without consent',async()=>{
 const response=await handleGitHubAuthorization(request('/authorize'),{
  OAUTH_PROVIDER:{parseAuthRequest:async()=>({clientId:'x',scope:'beeper:write',resource:base+'/mcp'})},
  OAUTH_KV:{},ROUTER_DB:{},GITHUB_CLIENT_ID:'test'
 });
 assert.equal(response.status,400);
});
