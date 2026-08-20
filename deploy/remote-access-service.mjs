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
const HELPER_VERSION = "0.7.0-alpha7-web.18";
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

async function readBody(request, limit = 64_000) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > limit) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

function commandOutput(program, args, timeout = 15_000) {
  const result = spawnSync(program, args, { encoding: "utf8", timeout, env: process.env });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function redact(value = "") {
  return String(value).replace(/eyJ[A-Za-z0-9._-]{20,}/g, "[REDACTED_TUNNEL_TOKEN]");
}

function requireCommand(program, args, label, timeout = 120_000) {
  const result = commandOutput(program, args, timeout);
  if (!result.ok) throw new Error(`${label} failed${result.stderr ? `: ${redact(result.stderr).slice(-500)}` : "."}`);
  return result.stdout;
}

function extractToken(input) {
  const text = String(input || "").trim();
  if (!text) throw new Error("Paste the Cloudflare connector command or tunnel token.");
  if (TOKEN_PATTERN.test(text)) return text;
  for (const rawLine of text.split(/\r?\n/)) {
    const match = INSTALL_LINE.exec(rawLine.trim());
    if (match && TOKEN_PATTERN.test(match[1])) return match[1];
  }
  throw new Error("KEMS could not find a valid 'cloudflared service install <token>' command. Nothing was executed.");
}

function cloudflaredVersion() {
  if (!fs.existsSync(CLOUDFLARED)) return null;
  const result = commandOutput(CLOUDFLARED, ["--version"], 5000);
  return result.ok ? result.stdout || null : null;
}

function serviceState() {
  const result = commandOutput("systemctl", ["is-active", UNIT_NAME], 5000);
  return result.stdout || (result.ok ? "active" : "inactive");
}

function serviceEnabled() {
  return commandOutput("systemctl", ["is-enabled", UNIT_NAME], 5000).ok;
}

function recentLogs(maxLines = 60) {
  const result = commandOutput("journalctl", ["-u", UNIT_NAME, "-n", String(maxLines), "--no-pager", "-o", "short-iso"], 7000);
  return redact(result.stdout || result.stderr || "").split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

function status() {
  const logs = recentLogs();
  const service = serviceState();
  const connected = service === "active" && logs.some((line) => /registered tunnel connection|connection .* registered|serving tunnel/i.test(line));
  return {
    available: true,
    helperVersion: HELPER_VERSION,
    loopbackOnly: true,
    busy,
    configured: fs.existsSync(TOKEN_FILE),
    installed: fs.existsSync(CLOUDFLARED),
    version: cloudflaredVersion(),
    service,
    enabled: serviceEnabled(),
    connected,
    serviceUrl: "http://localhost:4173",
    recommendedHostname: "kyle.kems.uk",
    tokenStored: fs.existsSync(TOKEN_FILE),
    tokenReadableByUi: false,
    recentLogs: logs.slice(-12),
    note: "Only the Cloudflare connector token is accepted. Pasted shell commands are never executed."
  };
}

function architectureAsset() {
  const result = commandOutput("dpkg", ["--print-architecture"], 5000);
  const architecture = result.ok ? result.stdout : "";
  const assets = { amd64: "amd64", arm64: "arm64", armhf: "arm" };
  if (!assets[architecture]) throw new Error(`Unsupported architecture for automatic cloudflared installation: ${architecture || os.arch()}.`);
  return assets[architecture];
}

function writeToken(token) {
  const temporary = `${TOKEN_FILE}.tmp`;
  fs.writeFileSync(temporary, `${token}\n`, { mode: 0o600 });
  fs.renameSync(temporary, TOKEN_FILE);
  fs.chmodSync(TOKEN_FILE, 0o600);
}

function writeConnectorUnit() {
  const unit = `[Unit]\nDescription=KEMS Cloudflare Tunnel connector\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nType=simple\nUser=root\nGroup=root\nExecStart=${CLOUDFLARED} tunnel --no-autoupdate run --token-file ${TOKEN_FILE}\nRestart=always\nRestartSec=5\nTimeoutStopSec=20\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectHome=yes\nProtectKernelTunables=yes\nProtectKernelModules=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nLockPersonality=yes\nRestrictRealtime=yes\n\n[Install]\nWantedBy=multi-user.target\n`;
  fs.writeFileSync(UNIT_FILE, unit, { mode: 0o644 });
}

function installCloudflared(token) {
  const asset = architectureAsset();
  const temporary = fs.mkdtempSync("/tmp/kems-cloudflared-");
  const packageFile = path.join(temporary, "cloudflared.deb");
  try {
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${asset}.deb`;
    requireCommand("curl", ["-fL", "--retry", "4", "--retry-delay", "2", url, "-o", packageFile], "Downloading cloudflared", 180_000);
    requireCommand("dpkg", ["-i", packageFile], "Installing cloudflared", 180_000);
    if (!fs.existsSync(CLOUDFLARED)) throw new Error("cloudflared installed but /usr/bin/cloudflared was not found.");
    writeToken(token);
    writeConnectorUnit();
    requireCommand("systemctl", ["daemon-reload"], "Reloading systemd", 30_000);
    requireCommand("systemctl", ["enable", UNIT_NAME], "Enabling KEMS Cloudflare connector", 30_000);
    requireCommand("systemctl", ["restart", UNIT_NAME], "Starting KEMS Cloudflare connector", 30_000);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

async function install(input) {
  if (busy) throw new Error("Another remote-access action is already running.");
  busy = true;
  try {
    const token = extractToken(input);
    installCloudflared(token);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return status();
  } finally {
    busy = false;
  }
}

function action(name) {
  if (busy) throw new Error("Another remote-access action is already running.");
  const allowed = new Set(["restart", "enable", "disable", "forget"]);
  if (!allowed.has(name)) throw new Error("Unsupported remote-access action.");
  if (name === "restart") requireCommand("systemctl", ["restart", UNIT_NAME], "Restarting connector", 30_000);
  if (name === "enable") requireCommand("systemctl", ["enable", "--now", UNIT_NAME], "Enabling connector", 30_000);
  if (name === "disable") requireCommand("systemctl", ["disable", "--now", UNIT_NAME], "Disabling connector", 30_000);
  if (name === "forget") {
    commandOutput("systemctl", ["disable", "--now", UNIT_NAME], 30_000);
    try { fs.unlinkSync(TOKEN_FILE); } catch {}
    try { fs.unlinkSync(UNIT_FILE); } catch {}
    commandOutput("systemctl", ["daemon-reload"], 30_000);
  }
  return status();
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === "/health" && request.method === "GET") return sendJson(response, 200, { ok: true, version: HELPER_VERSION, loopbackOnly: true });
    if (url.pathname === "/status" && request.method === "GET") return sendJson(response, 200, status());
    if (url.pathname === "/install" && request.method === "POST") {
      const body = await readBody(request);
      return sendJson(response, 200, await install(body.command || body.token || ""));
    }
    if (url.pathname === "/action" && request.method === "POST") {
      const body = await readBody(request);
      return sendJson(response, 200, action(String(body.action || "")));
    }
    return sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    return sendJson(response, 400, { error: redact(error.message) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`KEMS Web.18 remote-access helper ${HELPER_VERSION} listening on http://${HOST}:${PORT}`);
});
