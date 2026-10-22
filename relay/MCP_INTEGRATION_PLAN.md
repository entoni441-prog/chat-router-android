# Chat Router remote MCP: implementation plan (2026-10-23)

## Verified integration contract
- Existing Worker: `chat-router-relay`, existing routes `/poll`, `/result`, `/enqueue`, `/jobs/{id}`. Keep them unchanged.
- Android `RelayPoller.kt` authenticates with `DEVICE_TOKEN`, polls `/poll`, invokes loopback `/mcp`, posts the complete JSON-RPC response to `/result`.
- Android `RouterServer.kt` supports read-only `list_chats`, `list_messages`, `search_messages`, `list_contacts`. `list_messages` requires `room_id`, not `chat_id`.
- D1 `jobs` queue has 120-second expiry. MCP should use bounded waiting and return a tool error if Android is unavailable.

## Security architecture
1. Preserve the existing Worker and its `CLIENT_TOKEN`, `DEVICE_TOKEN`, `ROUTER_DB` bindings. Do not disclose or reuse either bearer secret as an OAuth token.
2. Use Cloudflare's official `@cloudflare/workers-oauth-provider` (current 1.x split authorization/resource APIs) rather than implementing token issuance or PKCE cryptography manually. Reference: https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/
3. Authenticate the human owner in the authorization endpoint through a verified identity mechanism and show explicit consent before issuing a grant. No anonymous self-approval, hardcoded passwords, or unauthenticated token minting.
4. Enforce `beeper:read` scope and the exact MCP resource/audience; publish OAuth authorization-server and protected-resource metadata. Use short-lived, revocable access tokens and S256 PKCE.
5. `/mcp` is only accessible after OAuth validation. Legacy device/client routes remain independently bearer-authenticated. Deny all writes, including `prepare_message`.
6. Do not log message contents, bearer credentials, authorization codes, or personal data.
7. Register the private ChatGPT connector only after OAuth metadata, consent, and negative authorization tests succeed.

## Deployment gates
- Reproducible source bundle, lockfile and Wrangler config; no secrets in GitHub.
- Validate existing Worker binding preservation and have rollback version available.
- Negative tests: no token, wrong audience, missing scope, expired/revoked token, CSRF/state mismatch, PKCE mismatch, unapproved owner, unsupported tool, invalid arguments.
- Positive tests: OAuth login/consent, initialize, tools/list, real device list_chats and list_messages.
- Verify Android `/poll` remains healthy before and after deployment.

## Current status
Design and Android contract verified. OAuth not deployed. The owner must complete interactive consent when the ChatGPT connection is eventually installed. Do not claim the connector is active until an end-to-end test succeeds.
