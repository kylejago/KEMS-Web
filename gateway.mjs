import http from "node:http";
import net from "node:net";

const PUBLIC_HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_PORT = Number.parseInt(process.env.PORT || "4173", 10) || 4173;
const BACKEND_PORT = Number.parseInt(process.env.KEMS_BACKEND_PORT || String(PUBLIC_PORT + 3), 10) || (PUBLIC_PORT + 3);
const REMOTE_HELPER_PORT = Number.parseInt(process.env.KEMS_REMOTE_ACCESS_PORT || "4175", 10) || 4175;

function privateIpv4(value) {
  const parts = String(value || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

function privateHostname(value = "") {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  return net.isIP(host) === 4 ? privateIpv4(host) : false;
}

function sameOrigin(request) {
  const origin = String(request.headers.origin || "");
  if (!origin) return true;
  try { return new URL(origin).host === String(request.headers.host || ""); } catch { return false; }
}

function directLanManagementRequest(request) {
  if (!sameOrigin(request)) return false;
  if (request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"] || request.headers["x-forwarded-host"] || request.headers.forwarded) return false;
  try {
    const hostname = new URL(`http://${request.headers.host || ""}`).hostname.toLowerCase();
    return privateHostname(hostname);
  } catch {
    return false;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function proxy(request, response, port, pathname = request.url) {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port,
    path: pathname,
    method: request.method,
    headers: { ...request.headers },
    timeout: 30_000
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("KEMS upstream timed out.")));
  upstream.on("error", (error) => {
    if (!response.headersSent) sendJson(response, 503, { available: false, error: error.message });
    else response.destroy(error);
  });
  request.pipe(upstream);
}

// Run the existing KEMS application on loopback. The gateway owns the public
// property port and adds only the small, LAN-only remote-access setup surface.
process.env.HOST = "127.0.0.1";
process.env.PORT = String(BACKEND_PORT);
await import("./server.mjs");

const gateway = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/remote-access/")) {
    if (!directLanManagementRequest(request)) {
      return sendJson(response, 403, { error: "Remote Access Setup is available only over a direct local-network KEMS address." });
    }
    const action = url.pathname.slice("/api/remote-access/".length);
    const routes = new Map([
      ["status", "/status"],
      ["install", "/install"],
      ["action", "/action"]
    ]);
    if (!routes.has(action)) return sendJson(response, 404, { error: "Not found." });
    if (action === "status" && request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
    if (["install", "action"].includes(action) && request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
    return proxy(request, response, REMOTE_HELPER_PORT, routes.get(action));
  }
  return proxy(request, response, BACKEND_PORT);
});

gateway.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  console.log(`KEMS Web.16 gateway listening on http://${PUBLIC_HOST}:${PUBLIC_PORT}; app backend http://127.0.0.1:${BACKEND_PORT}; remote setup helper loopback-only on ${REMOTE_HELPER_PORT}`);
});
