import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.KEMS_MANAGER_PORT || "4174", 10) || 4174;
const BASE = "/opt/kems-web";
const CURRENT = path.join(BASE, "current");
const RELEASES = path.join(BASE, "releases");
const DATA_DIR = "/var/lib/kems-web";
const LIB_DIR = "/usr/local/lib/kems-web";
const MANAGER_DIR = "/var/lib/kems-web-management";
const STATUS_FILE = path.join(MANAGER_DIR, "status.json");
const LOG_FILE = path.join(MANAGER_DIR, "action.log");
const REPO_FILE = path.join(LIB_DIR, "github-repo");
const MANAGER_VERSION = "0.7.0-alpha5-web.5";

fs.mkdirSync(MANAGER_DIR, { recursive: true, mode: 0o750 });

let busy = false;
let latestCache = { at: 0, value: null };
let actionState = readJson(STATUS_FILE, {
  action: null,
  state: "idle",
  progress: 0,
  message: "No maintenance action is running.",
  startedAt: null,
  finishedAt: null,
  exitCode: null
});
if (actionState.state === "running") {
  actionState = {
    ...actionState,
    state: "interrupted",
    message: "The previous maintenance action was interrupted by a restart or reboot.",
    finishedAt: new Date().toISOString()
  };
  persistState();
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function atomicJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o640 });
  fs.renameSync(temporary, file);
  try { fs.chmodSync(file, 0o640); } catch {}
}

function persistState() {
  atomicJson(STATUS_FILE, actionState);
}

function updateAction(patch) {
  actionState = { ...actionState, ...patch, updatedAt: new Date().toISOString() };
  persistState();
}

function appendLog(text) {
  const clean = String(text || "").replace(/\u0000/g, "");
  if (!clean) return;
  fs.appendFileSync(LOG_FILE, clean, { mode: 0o640 });
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > 512_000) {
      const data = fs.readFileSync(LOG_FILE);
      fs.writeFileSync(LOG_FILE, data.subarray(Math.max(0, data.length - 256_000)), { mode: 0o640 });
    }
  } catch {}
}

function safeRead(file, fallback = "") {
  try { return fs.readFileSync(file, "utf8").trim(); } catch { return fallback; }
}

function repoName() {
  return safeRead(REPO_FILE, "kylejago/KEMS-Web");
}

function installedVersion() {
  return String(readJson(path.join(CURRENT, "package.json"), {})?.version || "unknown");
}

function activeRelease() {
  try { return fs.realpathSync(CURRENT); } catch { return null; }
}

function releaseList() {
  let names = [];
  try {
    names = fs.readdirSync(RELEASES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directory = path.join(RELEASES, entry.name);
        const stat = fs.statSync(directory);
        return { version: entry.name, path: directory, modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  } catch {}
  const active = activeRelease();
  return names.map((item) => ({ ...item, active: active === item.path }));
}

function serviceState(name) {
  const result = spawnSync("systemctl", ["is-active", name], { encoding: "utf8", timeout: 3000 });
  const value = String(result.stdout || "").trim();
  return value || (result.status === 0 ? "active" : "unknown");
}

function diskUsage() {
  try {
    const stats = fs.statfsSync(DATA_DIR);
    const blockSize = Number(stats.bsize || stats.frsize || 4096);
    const total = Number(stats.blocks) * blockSize;
    const free = Number(stats.bavail) * blockSize;
    return { totalBytes: total, freeBytes: free, usedBytes: Math.max(0, total - free), usedPercent: total > 0 ? Math.round((total - free) / total * 1000) / 10 : null };
  } catch {
    return { totalBytes: null, freeBytes: null, usedBytes: null, usedPercent: null };
  }
}

function dataDirectorySize() {
  const result = spawnSync("du", ["-sb", DATA_DIR], { encoding: "utf8", timeout: 4000 });
  const bytes = Number.parseInt(String(result.stdout || "").trim().split(/\s+/)[0], 10);
  return Number.isFinite(bytes) ? bytes : null;
}

function primaryIpv4() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) return item.address;
    }
  }
  return null;
}

async function latestRelease(force = false) {
  if (!force && latestCache.value && Date.now() - latestCache.at < 10 * 60_000) return latestCache.value;
  const repo = repoName();
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "KEMS-Web-Pi-Manager" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const releases = await response.json();
    const selected = Array.isArray(releases) ? releases.find((release) => !release.draft && Array.isArray(release.assets) && release.assets.some((asset) => /^kems-web-.+-pi\.tar\.gz$/.test(asset.name))) : null;
    if (!selected) throw new Error("No KEMS Web Pi release was found.");
    const archive = selected.assets.find((asset) => /^kems-web-.+-pi\.tar\.gz$/.test(asset.name));
    const version = archive.name.replace(/^kems-web-/, "").replace(/-pi\.tar\.gz$/, "");
    const value = {
      available: true,
      version,
      tag: selected.tag_name,
      name: selected.name || `KEMS Web ${version}`,
      publishedAt: selected.published_at || null,
      prerelease: Boolean(selected.prerelease),
      htmlUrl: selected.html_url || null
    };
    latestCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    const value = { available: false, error: error.message };
    latestCache = { at: Date.now(), value };
    return value;
  }
}

function readRecentActionLog(maxLines = 120) {
  const raw = safeRead(LOG_FILE, "");
  if (!raw) return [];
  return raw.split(/\r?\n/).slice(-maxLines);
}

function journal(unit, maxLines = 80) {
  const result = spawnSync("journalctl", ["-u", unit, "-n", String(maxLines), "--no-pager", "-o", "short-iso"], { encoding: "utf8", timeout: 5000 });
  return String(result.stdout || result.stderr || "").trim().split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

function progressFromOutput(text, current) {
  const lower = text.toLowerCase();
  if (lower.includes("checking github")) return Math.max(current, 10);
  if (lower.includes("downloading release")) return Math.max(current, 25);
  if (lower.includes("verifying release")) return Math.max(current, 40);
  if (lower.includes("preparing kems web")) return Math.max(current, 55);
  if (lower.includes("switching active release")) return Math.max(current, 72);
  if (lower.includes("restarting kems web")) return Math.max(current, 82);
  if (lower.includes("health check")) return Math.max(current, 90);
  if (lower.includes("updated kems web") || lower.includes("already installed") || lower.includes("rolled back")) return Math.max(current, 98);
  return current;
}

function commandFor(action) {
  if (action === "update") return ["/usr/local/sbin/kems-update", []];
  if (action === "rollback") return ["/usr/local/sbin/kems-rollback", []];
  if (action === "restart") return ["systemctl", ["restart", "kems-web.service"]];
  if (action === "reboot") return ["systemctl", ["reboot"]];
  return null;
}

function startAction(action) {
  if (busy) throw new Error(`A ${actionState.action || "maintenance"} action is already running.`);
  const command = commandFor(action);
  if (!command) throw new Error("Unsupported maintenance action.");
  busy = true;
  fs.writeFileSync(LOG_FILE, `[${new Date().toISOString()}] Starting ${action}\n`, { mode: 0o640 });
  updateAction({ action, state: "running", progress: 3, message: `${action[0].toUpperCase()}${action.slice(1)} started.`, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null });

  setTimeout(() => {
    const [program, args] = command;
    if (action === "reboot") {
      updateAction({ state: "success", progress: 100, message: "Raspberry Pi reboot requested.", finishedAt: new Date().toISOString(), exitCode: 0 });
      appendLog(`[${new Date().toISOString()}] reboot requested\n`);
      busy = false;
    }
    const child = spawn(program, args, { env: { ...process.env, KEMS_MANAGER_ACTION: action }, stdio: ["ignore", "pipe", "pipe"] });
    const onData = (chunk) => {
      const text = chunk.toString();
      appendLog(text);
      const progress = progressFromOutput(text, actionState.progress || 0);
      const lastLine = text.trim().split(/\r?\n/).filter(Boolean).at(-1);
      updateAction({ progress, message: lastLine ? lastLine.slice(0, 240) : actionState.message });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => {
      appendLog(`\nManager failed to start action: ${error.message}\n`);
      updateAction({ state: "error", progress: 100, message: error.message, finishedAt: new Date().toISOString(), exitCode: -1 });
      busy = false;
    });
    child.on("close", (code) => {
      if (action === "reboot") return;
      const ok = code === 0;
      updateAction({
        state: ok ? "success" : "error",
        progress: 100,
        message: ok ? `${action[0].toUpperCase()}${action.slice(1)} completed.` : `${action[0].toUpperCase()}${action.slice(1)} failed with exit code ${code}.`,
        finishedAt: new Date().toISOString(),
        exitCode: code
      });
      appendLog(`[${new Date().toISOString()}] ${action} finished with exit code ${code}\n`);
      busy = false;
      if (action === "update") latestCache = { at: 0, value: null };
    });
  }, 300);
}

async function systemStatus(forceLatest = false) {
  const installed = installedVersion();
  const latest = await latestRelease(forceLatest);
  const releases = releaseList();
  const memoryTotal = os.totalmem();
  const memoryFree = os.freemem();
  return {
    available: true,
    managerVersion: MANAGER_VERSION,
    hostname: os.hostname(),
    ip: primaryIpv4(),
    platform: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(os.uptime()),
    memory: {
      totalBytes: memoryTotal,
      freeBytes: memoryFree,
      usedBytes: Math.max(0, memoryTotal - memoryFree),
      usedPercent: memoryTotal > 0 ? Math.round((memoryTotal - memoryFree) / memoryTotal * 1000) / 10 : null
    },
    disk: diskUsage(),
    dataDirectoryBytes: dataDirectorySize(),
    repository: repoName(),
    service: serviceState("kems-web.service"),
    managerService: "active",
    installedVersion: installed,
    latestRelease: latest,
    updateAvailable: Boolean(latest.available && latest.version && latest.version !== installed),
    releases,
    rollbackAvailable: releases.some((item) => !item.active),
    action: actionState,
    checkedAt: new Date().toISOString()
  };
}

function localRequest(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(value));
}

async function readBody(request, limit = 32_768) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > limit) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (request, response) => {
  if (!localRequest(request)) return sendJson(response, 403, { error: "KEMS manager accepts local requests only." });
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === "/health") return sendJson(response, 200, { ok: true, version: MANAGER_VERSION });
    if (url.pathname === "/status" && request.method === "GET") return sendJson(response, 200, await systemStatus(url.searchParams.get("refresh") === "1"));
    if (url.pathname === "/logs" && request.method === "GET") {
      return sendJson(response, 200, {
        action: readRecentActionLog(),
        web: journal("kems-web.service"),
        manager: journal("kems-web-manager.service", 40)
      });
    }
    if (url.pathname === "/action" && request.method === "POST") {
      const body = await readBody(request);
      const action = String(body.action || "");
      if (!new Set(["update", "rollback", "restart", "reboot"]).has(action)) return sendJson(response, 400, { error: "Unsupported maintenance action." });
      startAction(action);
      return sendJson(response, 202, { accepted: true, action, status: actionState });
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`KEMS Pi manager ${MANAGER_VERSION} listening on ${HOST}:${PORT}`);
});
