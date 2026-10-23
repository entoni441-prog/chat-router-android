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

## Verified readiness checkpoint — 2026-10-23
- GitHub Actions passed for commit `a789cf5` (Android and Worker checks).
- Cloudflare API confirmed the production Worker has bindings `CLIENT_TOKEN`, `DEVICE_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `ROUTER_DB`.
- KV namespace `chat-router-oauth` exists but `OAUTH_KV` is **not** bound to the Worker.
- `COOKIE_ENCRYPTION_KEY` is **not** configured.
- No staging deployment or real OAuth exchange has been verified.
- **Staging caveat:** current OAuth resource URL, callback URL, and origin checks are hard-coded to the production hostname in several modules. A separate staging hostname requires coordinated configuration of these URLs, the GitHub OAuth callback, and resource/audience checks. Do not deploy this bundle to a different hostname unchanged.
- **Database caveat:** staging must not share production job traffic or OAuth replay state unless explicitly isolated. Use a dedicated staging D1 and KV namespace for end-to-end tests.
- **GitHub caveat:** OAuth app callback must match the actual staging callback. Prefer a separate GitHub OAuth app for staging rather than changing the production app callback.

### Release order
1. Parameterize and test staging origin/resource/callback without weakening the production-origin guard.
2. Provision isolated staging D1 and KV; apply migration; add staging-only OAuth secrets and binding.
3. Deploy staging under its own Worker name; verify denial cases, PKCE, state replay, owner ID, consent, token audience and scope.
4. Verify real MCP initialization, tool discovery and Android readback against a staging-compatible device queue.
5. Only after passing these gates, plan a production change preserving all existing secrets and routes.
