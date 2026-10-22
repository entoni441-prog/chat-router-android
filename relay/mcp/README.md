# MCP integration staging

The OAuth-protected MCP module is not deployed. The existing Android relay routes remain unchanged.

The MCP handler must only receive verified OAuth resource-server claims with scope `beeper:read`, and must not use legacy CLIENT_TOKEN or DEVICE_TOKEN as ChatGPT credentials. See `../MCP_INTEGRATION_PLAN.md`.
