// Chat Router relay. Separate deployment; never reuse Mail.ru or CONSILIUM credentials.
// Required secrets: CLIENT_TOKEN and DEVICE_TOKEN. Required D1 binding: ROUTER_DB.
// This relay is NOT yet a ChatGPT-compatible OAuth MCP endpoint.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
async function authorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("authorization") || "";
  const expected = "Bearer " + secret;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export default {
  async fetch(request, env) {
    if (!env.ROUTER_DB) return json({ error: "database_not_configured" }, 503);
    const url = new URL(request.url);
    const client = await authorized(request, env.CLIENT_TOKEN);
    const device = await authorized(request, env.DEVICE_TOKEN);
    if (!client && !device) return json({ error: "unauthorized" }, 401);
    try {
      if (url.pathname === "/health" && request.method === "GET")
        return json({ status: "ok", role: device ? "device" : "client" });
      if (url.pathname === "/enqueue" && request.method === "POST" && client) {
        const payload = await request.json();
        const tool = payload?.tool;
        if (!["list_chats", "list_messages", "search_messages", "list_contacts"].includes(tool))
          return json({ error: "unsupported_tool" }, 400);
        const args = payload?.arguments ?? {};
        if (typeof args !== "object" || args === null || Array.isArray(args)) return json({ error: "invalid_arguments" }, 400);
        const data = JSON.stringify(args);
        if (data.length > 20000) return json({ error: "too_large" }, 413);
        const id = crypto.randomUUID();
        const now = Date.now();
        await env.ROUTER_DB.prepare("INSERT INTO jobs (id,tool,args,status,created_at,expires_at) VALUES (?,?,?,'queued',?,?)")
          .bind(id, tool, data, now, now + 120000).run();
        return json({ id, status: "queued" }, 202);
      }
      if (url.pathname === "/poll" && request.method === "GET" && device) {
        const now = Date.now();
        const row = await env.ROUTER_DB.prepare("SELECT id,tool,args FROM jobs WHERE status='queued' AND expires_at>? ORDER BY created_at LIMIT 1").bind(now).first();
        if (!row) return json({ jobs: [] });
        const claim = await env.ROUTER_DB.prepare("UPDATE jobs SET status='claimed' WHERE id=? AND status='queued'").bind(row.id).run();
        if (claim.meta.changes !== 1) return json({ jobs: [] });
        return json({ jobs: [{ id: row.id, tool: row.tool, arguments: JSON.parse(row.args) }] });
      }
      if (url.pathname === "/result" && request.method === "POST" && device) {
        const payload = await request.json();
        if (typeof payload?.id !== "string" || typeof payload?.result !== "object") return json({ error: "invalid_result" }, 400);
        const result = JSON.stringify(payload.result);
        if (result.length > 100000) return json({ error: "too_large" }, 413);
        const changed = await env.ROUTER_DB.prepare("UPDATE jobs SET status='done',result=? WHERE id=? AND status='claimed' AND expires_at>?")
          .bind(result, payload.id, Date.now()).run();
        return json({ accepted: changed.meta.changes === 1 });
      }
      if (url.pathname.startsWith("/jobs/") && request.method === "GET" && client) {
        const id = url.pathname.slice(6);
        if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "invalid_id" }, 400);
        const row = await env.ROUTER_DB.prepare("SELECT status,result,expires_at FROM jobs WHERE id=?").bind(id).first();
        if (!row) return json({ error: "not_found" }, 404);
        if (row.expires_at <= Date.now()) return json({ status: "expired" }, 410);
        return json({ status: row.status, result: row.status === "done" ? JSON.parse(row.result) : null });
      }
      return json({ error: "not_found" }, 404);
    } catch (_) {
      return json({ error: "relay_error" }, 500);
    }
  }
};
