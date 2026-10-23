# Chat Router OAuth deployment manifest (staging; do not deploy incomplete OAuth)

Worker: `chat-router-relay`
MCP resource: `https://chat-router-relay.entoni441.workers.dev/mcp`
GitHub callback: `https://chat-router-relay.entoni441.workers.dev/callback`
Owner GitHub user ID: `345764393` (verify via GitHub `GET /user`, never email/login alone)

## Existing production bindings — preserve unchanged
- `CLIENT_TOKEN` (secret)
- `DEVICE_TOKEN` (secret)
- `GITHUB_CLIENT_ID` (secret)
- `GITHUB_CLIENT_SECRET` (secret)
- `ROUTER_DB` (D1; existing relay jobs)

## Created OAuth KV namespace
- Binding name to add: `OAUTH_KV`
- Namespace: `chat-router-oauth`
- Namespace ID: `c5f0db2ccc8b402687f213a4691a2116`

## Pending secure configuration
- Generate and store `COOKIE_ENCRYPTION_KEY` as a new Cloudflare Worker secret, never in GitHub.
- Use official `@cloudflare/workers-oauth-provider` library for MCP authorization endpoints and PKCE/DCR.
- Implement GitHub login callback with cryptographically random, single-use, expiring `state` bound to browser session.
- Exchange GitHub code server-side, call GitHub `GET /user`, verify immutable user ID and obtain explicit consent for `beeper:read`.
- Issue **MCP-specific** tokens (never forward GitHub tokens); enforce resource and scope on every MCP call.
- Preserve existing `/poll`, `/result`, `/enqueue`, `/jobs/{id}`, `/health` and existing authentication.
- Validate on staging and confirm device readback before changing production.

## Security release gate
Do not deploy if any of the following are missing: real GitHub owner login, state/CSRF validation, verified consent, OAuth authorization-code PKCE, token storage, token validation, or successful end-to-end Android tests.
