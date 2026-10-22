# Chat Router relay (mobile-first)

This is a **separate** Cloudflare Worker, not a modification of CONSILIUM or Mail.ru.

## Architecture
Phone -> outbound HTTPS GET /poll -> D1 queued job -> execute Beeper ContentProvider locally -> HTTPS POST /result.
Client -> authenticated POST /enqueue -> GET /jobs/{id}.

## Required setup
- Dedicated D1 database `chat-router-relay` was created in Cloudflare EU jurisdiction and initialized with `schema.sql` on 2026-10-22. Database UUID: `bb8aa7c9-b116-423a-9e88-b68da6c9d87d`. Worker binding `ROUTER_DB` still needs configuration.
- Two independent random secrets, `CLIENT_TOKEN` and `DEVICE_TOKEN`, at least 32 characters, configured as Cloudflare Worker secrets. Never put them in GitHub or APK source.
- Cloudflare Workers route and an Android token-enrollment flow.
- Device polling implementation, Android lifecycle support, and tests.
- OAuth-compatible MCP facade with per-tool authorization before ChatGPT can connect.

## Current limitations
The Worker is **source code only**, not deployed. The dedicated D1 database exists and its schema is initialized. The Android app does **not** poll it yet.
The relay uses short-lived jobs (120 seconds), with no retry of claimed jobs. It needs bounded retries, cleanup, and load tests before production.
The device must validate tool allowlists, request arguments, and send approvals locally.
A relay bearer token is not an adequate replacement for the OAuth authorization expected by ChatGPT remote MCP.
Do not publish an unauthenticated /mcp endpoint or put secrets in a public repository.
