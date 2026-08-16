import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";

const BASE = "/opt/kems-web";
const CURRENT = `${BASE}/current`;
const MANAGER_DIR = "/var/lib/kems-web-management";
const POLICY_FILE = `${MANAGER_DIR}/update-policy.json`;
const STATUS_FILE = `${MANAGER_DIR}/bundle-status.json`;
const HISTORY_FILE = `${MANAGER_DIR}/update-history.json`;
const ACTION_STATUS_FILE = `${MANAGER_DIR}/status.json`;
const LOG_FILE = `${MANAGER_DIR}/bundle-agent.log`;
const MANAGER_FILE = "/usr/local/lib/kems-web/manager.mjs";
const REPOSITORY = process.env.KEMS_BUNDLE_REPOSITORY || "kylejago/KEMS";
const MANIFEST_NAME = "kems-bundle.json";
const CHECKSUM_NAME = `${MANIFEST_NAME}.sha256`;
const CHECK_INTERVAL_MS = Math.max(60_000, Number.parseInt(process.env.KEMS_BUNDLE_CHECK_MS || "300000", 10) || 300000);
const INITIAL_DELAY_MS = Math.max(5_000, Number.parseInt(process.env.KEMS_BUNDLE_INITIAL_DELAY_MS || "30000", 10) || 30000);
const AGENT_VERSION = "0.7.0-alpha6-web.8";

const DEFAULT_POLICY = Object.freeze({
  automaticUpdates: false,
  coordinatedUpdates: true,
  mode: "safe-first",
  maintenanceStart: "03:00",
  maintenanceEnd: "04:00",
  automaticReboot: false,
  notifyMaintenance: true,
  channel: "alpha"
});

fs.mkdirSync(MANAGER_DIR, { recursive: true, mode: 0o750 });
let running = false;
let timer = null;
let lastBundle = null;

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function atomicJson(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o640 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o640); } catch {}
}

function appendLog(message) {
  const line = `[${new Date().toISOString()}] ${String(message || "").trim()}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, { mode: 0o640 });
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > 512_000) {
      const data = fs.readFileSync(LOG_FILE);
      fs.writeFileSync(LOG_FILE, data.subarray(Math.max(0, data.length - 256_000)), { mode: 0o640 });
    }
  } catch {}
}

function clock(value, fallback) {
  const text = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function normalisePolicy(raw = {}) {
  return {
    automaticUpdates: Boolean(raw.automaticUpdates),
    coordinatedUpdates: raw.coordinatedUpdates !== false,
    mode: raw.mode === "window-only" ? "window-only" : "safe-first",
    maintenanceStart: clock(raw.maintenanceStart, DEFAULT_POLICY.maintenanceStart),
    maintenanceEnd: clock(raw.maintenanceEnd, DEFAULT_POLICY.maintenanceEnd),
    automaticReboot: Boolean(raw.automaticReboot),
    notifyMaintenance: raw.notifyMaintenance !== false,
    channel: raw.channel === "stable" ? "stable" : "alpha"
  };
}

function policy() {
  const value = normalisePolicy({ ...DEFAULT_POLICY, ...(readJson(POLICY_FILE, {}) || {}) });
  if (!fs.existsSync(POLICY_FILE)) atomicJson(POLICY_FILE, value);
  return value;
}

function installedVersion() {
  try {
    return String(JSON.parse(fs.readFileSync(`${CURRENT}/package.json`, "utf8"))?.version || "unknown");
  } catch { return "unknown"; }
}

function installedManagerVersion() {
  try {
    const text = fs.readFileSync(MANAGER_FILE, "utf8");
    return text.match(/const MANAGER_VERSION = ["']([^"']+)["']/)?.[1] || "unknown";
  } catch { return "unknown"; }
}

function normaliseVersion(value) {
  const text = String(value || "").trim();
  return /^v\d/.test(text) ? text.slice(1) : text;
}

function sameVersion(first, second) {
  return Boolean(first && second) && normaliseVersion(first) === normaliseVersion(second);
}

function component(bundle, key) {
  const value = bundle?.components?.[key];
  return value && typeof value === "object" ? value : null;
}

function targetVersion(bundle, key) {
  const value = component(bundle, key)?.version;
  return value === null || value === undefined || value === "" ? null : String(value);
}

function parseClock(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return { hour, minute };
}

function insideWindow(now, startText, endText) {
  const start = parseClock(startText);
  const end = parseClock(endText);
  const current = now.getHours() * 60 + now.getMinutes();
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

function nextWindowStart(now, startText, endText) {
  if (insideWindow(now, startText, endText)) return new Date(now);
  const start = parseClock(startText);
  const next = new Date(now);
  next.setHours(start.hour, start.minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function localMaintenanceRequired(bundle, configuredPolicy) {
  if (configuredPolicy.mode === "window-only") return true;
  const maintenance = bundle?.maintenance || {};
  if (maintenance.reboot_required) return true;
  const affected = new Set(Array.isArray(maintenance.affected_components) ? maintenance.affected_components : []);
  return ["property_web", "pi_agent", "pi_system"].some((key) => affected.has(key));
}

function maintenanceNotice(bundle, status, scheduledFor = null, extra = {}) {
  const maintenance = bundle?.maintenance || {};
  return {
    status,
    scope: "property",
    bundle: bundle?.bundle || null,
    scheduled_for: scheduledFor,
    reason: maintenance.reason || "KEMS coordinated update",
    expected_downtime_minutes: maintenance.expected_downtime_minutes || 5,
    affected_components: Array.isArray(maintenance.affected_components) ? maintenance.affected_components : [],
    home_assistant_restart_required: Boolean(maintenance.home_assistant_restart_required),
    reboot_required: Boolean(maintenance.reboot_required),
    updated_at: new Date().toISOString(),
    ...extra
  };
}

function history() {
  const value = readJson(HISTORY_FILE, []);
  return Array.isArray(value) ? value : [];
}

function recordHistory(item) {
  const items = history();
  items.push(item);
  atomicJson(HISTORY_FILE, items.slice(-30));
}

function componentStatuses(bundle) {
  const webTarget = targetVersion(bundle, "property_web");
  const agentTarget = targetVersion(bundle, "pi_agent");
  const piSystem = component(bundle, "pi_system");
  const publicTarget = targetVersion(bundle, "public_web");
  const webInstalled = installedVersion();
  const agentInstalled = installedManagerVersion();
  return [
    {
      key: "property_web", target: webTarget, installed: webInstalled,
      status: !webTarget ? "not-targeted" : sameVersion(webTarget, webInstalled) ? "current" : "update-required",
      required: Boolean(component(bundle, "property_web")?.required), delivery: "kems-pi"
    },
    {
      key: "pi_agent", target: agentTarget, installed: agentInstalled,
      status: !agentTarget ? "not-targeted" : sameVersion(agentTarget, agentInstalled) ? "current" : "update-required",
      required: Boolean(component(bundle, "pi_agent")?.required), delivery: "kems-pi"
    },
    {
      key: "pi_system", target: piSystem?.version || null, installed: null,
      status: !piSystem?.version ? "not-targeted" : "attention-required",
      required: Boolean(piSystem?.required), delivery: "kems-pi",
      detail: piSystem?.version ? "OS/package convergence is intentionally gated until an explicit supported Pi-system action is defined by a later bundle." : ""
    },
    {
      key: "public_web", target: publicTarget, installed: null,
      status: !publicTarget ? "not-targeted" : "delegated",
      required: Boolean(component(bundle, "public_web")?.required), delivery: "public-site-agent",
      detail: publicTarget ? "Reserved for the future public KEMS website deployment agent." : ""
    }
  ];
}

function actionBusy() {
  return readJson(ACTION_STATUS_FILE, {})?.state === "running";
}

function saveStatus(value) {
  atomicJson(STATUS_FILE, {
    agentVersion: AGENT_VERSION,
    repository: REPOSITORY,
    checkedAt: new Date().toISOString(),
    policy: policy(),
    history: history().slice(-10),
    ...value
  });
}

async function download(url, accept = "application/octet-stream") {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "KEMS-Pi-Bundle-Agent" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function validateBundle(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Bundle is not a JSON object");
  if (Number(raw.schema) !== 1) throw new Error("Unsupported bundle schema");
  if (!String(raw.bundle || "").trim()) throw new Error("Bundle has no bundle version");
  if (!raw.components || typeof raw.components !== "object" || Array.isArray(raw.components)) throw new Error("Bundle has no components object");
  if (raw.maintenance && (typeof raw.maintenance !== "object" || Array.isArray(raw.maintenance))) throw new Error("Bundle maintenance section is invalid");
  return raw;
}

async function fetchLatestBundle(configuredPolicy) {
  const releasesBuffer = await download(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`, "application/vnd.github+json");
  const releases = JSON.parse(releasesBuffer.toString("utf8"));
  if (!Array.isArray(releases)) throw new Error("GitHub releases response was invalid");
  for (const release of releases) {
    if (release.draft) continue;
    if (configuredPolicy.channel === "stable" && release.prerelease) continue;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAsset = assets.find((asset) => asset.name === MANIFEST_NAME);
    if (!manifestAsset) continue;
    const checksumAsset = assets.find((asset) => asset.name === CHECKSUM_NAME);
    if (!checksumAsset) throw new Error(`Release ${release.tag_name} has a bundle without SHA-256 verification`);
    const [manifest, checksum] = await Promise.all([
      download(manifestAsset.browser_download_url),
      download(checksumAsset.browser_download_url)
    ]);
    const expected = checksum.toString("utf8").trim().split(/\s+/)[0];
    const observed = crypto.createHash("sha256").update(manifest).digest("hex");
    if (!expected || expected.toLowerCase() !== observed.toLowerCase()) throw new Error(`Bundle SHA-256 verification failed for ${release.tag_name}`);
    const bundle = validateBundle(JSON.parse(manifest.toString("utf8")));
    bundle.release = {
      tag: release.tag_name,
      name: release.name || release.tag_name,
      published_at: release.published_at || null,
      prerelease: Boolean(release.prerelease),
      sha256: observed
    };
    return bundle;
  }
  return null;
}

function runCommand(program, args, timeoutMs = 20 * 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) appendLog(line);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timerId = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${program} timed out`));
    }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timerId); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timerId);
      if (code === 0) resolve({ code, output });
      else reject(new Error(`${program} exited ${code}: ${output.trim().split(/\r?\n/).at(-1) || "unknown error"}`));
    });
  });
}

async function converge(bundle, configuredPolicy) {
  const statuses = componentStatuses(bundle);
  const localChanges = statuses.filter((item) => ["property_web", "pi_agent"].includes(item.key) && item.status === "update-required");
  const blockingSystem = statuses.find((item) => item.key === "pi_system" && item.required && item.status === "attention-required");
  const publicRequired = statuses.find((item) => item.key === "public_web" && item.required && item.status === "delegated");
  if (!localChanges.length) {
    const overall = blockingSystem ? "attention-required" : publicRequired ? "waiting-external" : "up-to-date";
    const previous = readJson(STATUS_FILE, {}) || {};
    const previousCompleted = previous.lastResult?.bundle === bundle.bundle && previous.lastResult?.result === "success";
    saveStatus({
      available: true,
      bundle,
      overallStatus: overall,
      components: statuses,
      maintenance: previousCompleted ? maintenanceNotice(bundle, "completed", null) : { status: "none" },
      lastResult: previous.lastResult || null,
      lastError: blockingSystem?.detail || null
    });
    return;
  }

  const disruption = localMaintenanceRequired(bundle, configuredPolicy);
  const now = new Date();
  const inWindow = insideWindow(now, configuredPolicy.maintenanceStart, configuredPolicy.maintenanceEnd);
  if (!configuredPolicy.automaticUpdates) {
    saveStatus({
      available: true, bundle, overallStatus: "update-available", components: statuses,
      maintenance: disruption ? maintenanceNotice(bundle, "update-available", nextWindowStart(now, configuredPolicy.maintenanceStart, configuredPolicy.maintenanceEnd).toISOString()) : { status: "none" },
      lastError: null
    });
    return;
  }
  if (actionBusy()) {
    saveStatus({ available: true, bundle, overallStatus: "waiting", components: statuses, maintenance: { status: "waiting", reason: "Another KEMS maintenance action is running." }, lastError: null });
    return;
  }
  if (disruption && !inWindow) {
    const scheduled = nextWindowStart(now, configuredPolicy.maintenanceStart, configuredPolicy.maintenanceEnd).toISOString();
    saveStatus({ available: true, bundle, overallStatus: "scheduled", components: statuses, maintenance: maintenanceNotice(bundle, "scheduled", scheduled), lastError: null });
    return;
  }

  const webTarget = targetVersion(bundle, "property_web");
  const agentTarget = targetVersion(bundle, "pi_agent");
  if (webTarget && agentTarget && !sameVersion(webTarget, agentTarget)) {
    throw new Error(`Bundle requires property web ${webTarget} but Pi agent ${agentTarget}; current appliance releases require them to share one release version.`);
  }
  const target = webTarget || agentTarget;
  if (!target) throw new Error("Bundle has local Pi changes but no installable appliance target");
  const agentChanged = Boolean(agentTarget && !sameVersion(agentTarget, AGENT_VERSION));

  saveStatus({ available: true, bundle, overallStatus: "updating", components: statuses, maintenance: maintenanceNotice(bundle, "in_progress", null, { target }), lastError: null });
  appendLog(`Converging appliance to exact bundle target ${target}`);
  await runCommand("/usr/local/sbin/kems-update", [target]);
  await runCommand("systemctl", ["restart", "kems-web-manager.service"], 30_000);
  let managerHealthy = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4174/health", { signal: AbortSignal.timeout(1500) });
      if (response.ok) { managerHealthy = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!managerHealthy) throw new Error("Updated Pi manager did not pass its post-update health check");

  const verified = componentStatuses(bundle);
  const failed = verified.filter((item) => ["property_web", "pi_agent"].includes(item.key) && item.required && item.status !== "current");
  if (failed.length) throw new Error(`Post-update verification failed: ${failed.map((item) => `${item.key}=${item.installed || "unknown"}, expected=${item.target}`).join("; ")}`);

  const rebootRequired = Boolean(bundle?.maintenance?.reboot_required);
  if (rebootRequired && !configuredPolicy.automaticReboot) {
    const result = { bundle: bundle.bundle, completedAt: new Date().toISOString(), result: "restart-required", components: verified };
    recordHistory(result);
    saveStatus({ available: true, bundle, overallStatus: "restart-required", components: verified, maintenance: maintenanceNotice(bundle, "restart-required", null), lastResult: result, lastError: null });
    return;
  }

  const result = { bundle: bundle.bundle, completedAt: new Date().toISOString(), result: "success", components: verified };
  recordHistory(result);
  saveStatus({ available: true, bundle, overallStatus: rebootRequired ? "rebooting" : "up-to-date", components: verified, maintenance: maintenanceNotice(bundle, rebootRequired ? "in_progress" : "completed", null), lastResult: result, lastError: null });
  if (rebootRequired) {
    appendLog("Bundle requests Pi reboot; rebooting inside the maintenance window.");
    spawn("systemctl", ["reboot"], { detached: true, stdio: "ignore" }).unref();
  } else if (agentChanged) {
    appendLog("Updated Pi agent verified; restarting the bundle agent onto its new code.");
    setTimeout(() => {
      try { spawn("systemctl", ["restart", "kems-web-bundle-agent.service"], { detached: true, stdio: "ignore" }).unref(); } catch {}
    }, 1000);
  }
}

async function check() {
  if (running) return;
  running = true;
  const configuredPolicy = policy();
  try {
    if (!configuredPolicy.coordinatedUpdates) {
      saveStatus({ available: true, bundle: null, overallStatus: "coordinated-updates-disabled", components: [], maintenance: { status: "none" }, lastError: null });
      return;
    }
    const bundle = await fetchLatestBundle(configuredPolicy);
    lastBundle = bundle;
    if (!bundle) {
      saveStatus({ available: true, bundle: null, overallStatus: "no-bundle-published", components: [], maintenance: { status: "none" }, lastError: null });
      return;
    }
    await converge(bundle, configuredPolicy);
  } catch (error) {
    appendLog(`Bundle check failed: ${error.message}`);
    const components = lastBundle ? componentStatuses(lastBundle) : [];
    const result = { bundle: lastBundle?.bundle || null, completedAt: new Date().toISOString(), result: "failed", error: error.message, components };
    recordHistory(result);
    saveStatus({ available: false, bundle: lastBundle, overallStatus: "attention-required", components, maintenance: lastBundle ? maintenanceNotice(lastBundle, "failed", null, { error: error.message }) : { status: "failed", reason: error.message }, lastResult: result, lastError: error.message });
  } finally {
    running = false;
  }
}

appendLog(`KEMS Pi bundle agent ${AGENT_VERSION} started; automatic updates=${policy().automaticUpdates}`);
setTimeout(check, INITIAL_DELAY_MS);
timer = setInterval(check, CHECK_INTERVAL_MS);

function shutdown() {
  if (timer) clearInterval(timer);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
