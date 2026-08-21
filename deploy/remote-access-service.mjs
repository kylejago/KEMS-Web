import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.KEMS_REMOTE_ACCESS_PORT || "4175", 10) || 4175;
const MANAGER_DIR = "/var/lib/kems-web-management";
const TOKEN_FILE = path.join(MANAGER_DIR, "cloudflare-tunnel.token");
const UNIT_FILE = "/etc/systemd/system/kems-cloudflared.service";
const UNIT_NAME = "kems-cloudflared.service";
const CLOUDFLARED = "/usr/bin/cloudflared";
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{80,4096}$/;
const INSTALL_LINE = /^(?:sudo\s+)?(?:\/usr\/local\/bin\/|\/usr\/bin\/)?cloudflared\s+service\s+install\s+([A-Za-z0-9._-]{80,4096})\s*$/i;
const HELPER_VERSION = "0.8.0-alpha8-web.0";
let busy = false;

fs.mkdirSync(MANAGER_DIR, { recursive: true, mode: 0o750 });

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
  response.end(JSON.stringify(value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error("Request body too large"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout || 15_000,
    env: { ...process.env, PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" }
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? String(result.error.message || result.error) : null
  };
}

function systemctl(args) {
  return run("/usr/bin/systemctl", args);
}

function serviceState() {
  const active = systemctl(["is-active", UNIT_NAME]);
  const enabled = systemctl(["is-enabled", UNIT_NAME]);
  return {
    configured: fs.existsSync(UNIT_FILE) && fs.existsSync(TOKEN_FILE),
    active: active.stdout === "active",
    enabled: enabled.stdout === "enabled",
    unit: UNIT_NAME,
    tokenStored: fs.existsSync(TOKEN_FILE)
  };
}

function normaliseToken(input) {
  const text = String(input || "").trim();
  if (!text) return { token: null, error: "Paste the Cloudflare tunnel token or the cloudflared service install command." };
  if (TOKEN_PATTERN.test(text)) return { token: text, error: null };
  const match = INSTALL_LINE.exec(text);
  if (match && TOKEN_PATTERN.test(match[1])) return { token: match[1], error: null };
  return {
    token: null,
    error: "That input is not a recognised Cloudflare tunnel token/install command. Nothing was executed."
  };
}

function writeToken(token) {
  const temp = `${TOKEN_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, TOKEN_FILE);
  fs.chmodSync(TOKEN_FILE, 0o600);
}

function unitContents() {
  return `[Unit]\nDescription=KEMS Cloudflare Tunnel\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nExecStart=${CLOUDFLARED} tunnel --no-autoupdate run --token-file ${TOKEN_FILE}\nRestart=always\nRestartSec=5s\n\n[Install]\nWantedBy=multi-user.target\n`;
}

function writeUnit() {
  const temp = `${UNIT_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, unitContents(), { encoding: "utf8", mode: 0o644 });
  fs.renameSync(temp, UNIT_FILE);
  fs.chmodSync(UNIT_FILE, 0o644);
}

function installConnector(token) {
  if (!fs.existsSync(CLOUDFLARED)) {
    throw new Error("cloudflared is not installed on this Pi. Install the Cloudflare connector package first.");
  }
  writeToken(token);
  writeUnit();
  const reload = systemctl(["daemon-reload"]);
  if (!reload.ok) throw new Error(reload.stderr || "systemctl daemon-reload failed");
  const enable = systemctl(["enable", UNIT_NAME]);
  if (!enable.ok) throw new Error(enable.stderr || "Could not enable KEMS Cloudflare tunnel service");
  const restart = systemctl(["restart", UNIT_NAME]);
  if (!restart.ok) throw new Error(restart.stderr || "Could not start KEMS Cloudflare tunnel service");
  return serviceState();
}

function removeConnector() {
  systemctl(["disable", "--now", UNIT_NAME]);
  if (fs.existsSync(UNIT_FILE)) fs.unlinkSync(UNIT_FILE);
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
  systemctl(["daemon-reload"]);
  return serviceState();
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, version: HELPER_VERSION });
      return;
    }
    if (request.method === "GET" && url.pathname === "/status") {
      sendJson(response, 200, { ok: true, version: HELPER_VERSION, ...serviceState() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/install") {
      if (busy) {
        sendJson(response, 409, { ok: false, error: "Remote Access setup is already running." });
        return;
      }
      const payload = await readJsonBody(request);
      const parsed = normaliseToken(payload.token ?? payload.command ?? payload.value);
      if (!parsed.token) {
        sendJson(response, 400, { ok: false, error: parsed.error });
        return;
      }
      busy = true;
      try {
        sendJson(response, 200, { ok: true, state: installConnector(parsed.token) });
      } finally {
        busy = false;
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/remove") {
      if (busy) {
        sendJson(response, 409, { ok: false, error: "Remote Access setup is already running." });
        return;
      }
      busy = true;
      try {
        sendJson(response, 200, { ok: true, state: removeConnector() });
      } finally {
        busy = false;
      }
      return;
    }
    sendJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: String(error?.message || error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`KEMS Remote Access setup helper ${HELPER_VERSION} listening on http://${HOST}:${PORT}`);
});
