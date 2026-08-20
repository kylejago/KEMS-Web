import http from "node:http";
import fs from "node:fs";
import os from "node:os";

const HOST = "0.0.0.0";
const PORT = 4173;
const STATUS_FILE = "/var/lib/kems-bootstrap/status.json";
const LOG_FILE = "/var/log/kems-firstboot.log";
const APPROVED_LOGO_URL = "https://raw.githubusercontent.com/kylejago/KEMS/main/docs/assets/kems_full_brand_concept.png";
const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="240 285 1040 370" role="img" aria-label="KEMS — Kyle Energy Management System"><image href="${APPROVED_LOGO_URL}" x="0" y="0" width="1536" height="1024" preserveAspectRatio="none"/></svg>`;

function safeJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return fallback; }
}

function tail(path, maxLines = 28) {
  try { return fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).slice(-maxLines).join("\n"); }
  catch { return "Waiting for the first-boot installer to start…"; }
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function ipv4() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) for (const item of entries || []) if (item.family === "IPv4" && !item.internal) return item.address;
  return "acquiring address";
}

function status() {
  return safeJson(STATUS_FILE, { state: "starting", stage: "boot", progress: 5, message: "Raspberry Pi has started. Preparing the KEMS installer…", updated_at: new Date().toISOString() });
}

function render() {
  const s = status();
  const isError = s.state === "error";
  const progress = Math.max(0, Math.min(100, Number(s.progress || 0)));
  const log = tail(LOG_FILE);
  const title = isError ? "Setup needs attention" : "KEMS Pi Setup";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>${escapeHtml(title)}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#071018;color:#eaf6ff;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(760px,100%);background:#0d1822;border:1px solid #24435a;border-radius:22px;padding:28px;box-shadow:0 24px 70px #0008}.brandmark{display:block;width:min(520px,92%);height:auto;margin:0 0 22px}.eyebrow{color:#74d7ff;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:.78rem}h1{margin:.35rem 0 .25rem;font-size:clamp(2rem,5vw,3.2rem)}.msg{color:#bcd2df;font-size:1.05rem}.bar{height:12px;background:#142a38;border-radius:999px;overflow:hidden;margin:24px 0 10px}.fill{height:100%;width:${progress}%;background:linear-gradient(90deg,#42b8ff,#39c95f);transition:width .4s}.meta{display:flex;gap:18px;flex-wrap:wrap;color:#8fa9b8;font-size:.9rem}.status{margin-top:20px;padding:15px 17px;border-radius:14px;background:${isError ? "#35171b" : "#102532"};border:1px solid ${isError ? "#7d3239" : "#24506a"}}pre{white-space:pre-wrap;word-break:break-word;background:#050b10;padding:16px;border-radius:14px;color:#a9c0cd;max-height:260px;overflow:auto;font-size:.78rem;margin-top:18px}.hint{margin-top:14px;color:#7892a0;font-size:.85rem}.error{color:#ff9ea7}</style></head><body><main class="card">${BRAND_SVG.replace("<svg ", '<svg class="brandmark" ')}<div class="eyebrow">Local KEMS appliance</div><h1>${escapeHtml(title)}</h1><p class="msg">${escapeHtml(s.message)}</p><div class="bar"><div class="fill"></div></div><div class="meta"><span>Stage: <strong>${escapeHtml(s.stage || "boot")}</strong></span><span>${progress}%</span><span>Pi: ${escapeHtml(ipv4())}</span></div><div class="status ${isError ? "error" : ""}">${isError ? "The installer will retry automatically. The diagnostic log below shows the last recorded steps." : "This page refreshes automatically. When installation completes, it will be replaced by the KEMS dashboard."}</div><pre>${escapeHtml(log)}</pre><div class="hint">Keep the Pi powered and connected to Ethernet during first setup.</div></main></body></html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/health" || req.url === "/api/setup") {
    const s = status();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, mode: "setup", ip: ipv4(), ...s }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(render());
});

server.listen(PORT, HOST, () => console.log(`KEMS setup status listening on http://${HOST}:${PORT}`));
