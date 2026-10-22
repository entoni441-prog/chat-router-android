# Chat Router — Cloudflare relay

## Verified status (2026-10-22)

- Deployed Worker: `chat-router-relay` at `https://chat-router-relay.entoni441.workers.dev`. The `workers.dev` route is enabled; preview URLs are disabled.
- D1 database binding: `ROUTER_DB`; existing secrets: `CLIENT_TOKEN` and `DEVICE_TOKEN`. Secret values are **not readable** after being stored.
- Current deployed implementation protects **all** routes behind independent bearer credentials (including `/health`).
- Android Chat Router `1.0.100003`: confirmed local Beeper chat/message reads; the relay poller code exists but requires endpoint + device token setup to start.
- **No confirmed remote end-to-end phone↔Worker connection yet.**
- **The Worker is NOT a ChatGPT-compatible MCP server yet.** No `/mcp` handler or OAuth 2.1 authorization endpoints. Do not add it as a functioning ChatGPT plugin until those are implemented and tested.

## Existing relay protocol

Client routes (bearer `CLIENT_TOKEN`): `POST /enqueue`, `GET /jobs/{id}`.
Android device routes (bearer `DEVICE_TOKEN`): `GET /poll`, `POST /result`.
Either token can call `GET /health`; missing/wrong tokens yield 401.

Allowed remote tools, **read only**: `list_chats`, `list_messages`, `search_messages`, `list_contacts`.
D1 queue jobs expire after two minutes. Claimed-job retry/recovery needs further testing.

## One-time Android device enrollment

1. Generate a **private random 32+ byte** device token (Bitwarden or Termux). Save it securely outside GitHub and outside chat.
2. If the old plaintext is unavailable, **rotate** Cloudflare Worker secret `DEVICE_TOKEN` (Workers & Pages → `chat-router-relay` → Settings → Variables and Secrets), using precisely the generated token. Deploy the updated secret. Do **not** rotate `CLIENT_TOKEN` along with it.
3. In Chat Router → **Configure remote relay (optional)**, set endpoint to `https://chat-router-relay.entoni441.workers.dev` and Device Token to the same private token; Save.
4. Press **Start local MCP** on the phone. Check authenticated `GET /health` gives `{"status":"ok","role":"device"}` and missing/wrong bearer gives 401.

Cloudflare does not display existing secrets in plaintext. Do not paste them in screenshots, email, project files, or this chat.

## Before registering a ChatGPT private MCP plugin

- Implement proper streamable HTTP MCP `/mcp`, tool schemas, request/response handling and bounded queue polling.
- Implement and verify OAuth 2.1 authorization-code + S256 PKCE, protected-resource and authorization-server metadata, client registration (CIMD/DCR), user approval, resource/audience restriction, expiration and scope checks.
- Prefer the official Cloudflare `@cloudflare/workers-oauth-provider` library to a homegrown OAuth server.
- Test unauthorized requests, consent, app roles, tool allowlist, private message protection, offline/timeout paths, and Android polling.
- Only then create and install the **private** ChatGPT custom MCP plugin and complete the owner's interactive authorization.

The public Worker address is NOT permission to access private Beeper conversations. Do not expose unauthenticated tools or put secret values in source code. This infrastructure remains independent of Mail.ru and CONSILIUM.
