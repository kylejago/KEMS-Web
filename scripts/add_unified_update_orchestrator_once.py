"""Wire coordinated automatic updates and maintenance notices into KEMS Web once."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Patch anchor not found in {path}: {old[:160]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Bump the appliance version so the bootstrap update has a real exact target.
patch(
    "package.json",
    '  "version": "0.7.0-alpha6-web.7",',
    '  "version": "0.7.0-alpha6-web.8",',
)
patch(
    "package.json",
    '"description": "Focused KEMS 0.7.0-alpha6 dashboard with five-scenario What-if comparison, multi-site Home Hub, headless Pi management, GitHub updates and PWA support"',
    '"description": "KEMS property dashboard with coordinated automatic updates, maintenance windows, Pi management, scenario comparison and PWA support"',
)

# Manager: durable bundle-agent state/policy, exact-version manual updates and policy API.
patch(
    "deploy/manager.mjs",
    'const STATUS_FILE = path.join(MANAGER_DIR, "status.json");\nconst LOG_FILE = path.join(MANAGER_DIR, "action.log");',
    'const STATUS_FILE = path.join(MANAGER_DIR, "status.json");\nconst LOG_FILE = path.join(MANAGER_DIR, "action.log");\nconst UPDATE_POLICY_FILE = path.join(MANAGER_DIR, "update-policy.json");\nconst BUNDLE_STATUS_FILE = path.join(MANAGER_DIR, "bundle-status.json");\nconst BUNDLE_AGENT_LOG_FILE = path.join(MANAGER_DIR, "bundle-agent.log");',
)
patch(
    "deploy/manager.mjs",
    'const MANAGER_VERSION = "0.7.0-alpha6-web.7";',
    'const MANAGER_VERSION = "0.7.0-alpha6-web.8";',
)
patch(
    "deploy/manager.mjs",
    '''function persistState() {
  atomicJson(STATUS_FILE, actionState);
}
''',
    '''function persistState() {
  atomicJson(STATUS_FILE, actionState);
}

function normaliseUpdatePolicy(raw = {}) {
  const clock = (value, fallback) => /^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(value || "")) ? String(value) : fallback;
  return {
    automaticUpdates: Boolean(raw.automaticUpdates),
    coordinatedUpdates: raw.coordinatedUpdates !== false,
    mode: raw.mode === "window-only" ? "window-only" : "safe-first",
    maintenanceStart: clock(raw.maintenanceStart, "03:00"),
    maintenanceEnd: clock(raw.maintenanceEnd, "04:00"),
    automaticReboot: Boolean(raw.automaticReboot),
    notifyMaintenance: raw.notifyMaintenance !== false,
    channel: raw.channel === "stable" ? "stable" : "alpha"
  };
}

function updatePolicy() {
  const value = normaliseUpdatePolicy(readJson(UPDATE_POLICY_FILE, {}));
  if (!fs.existsSync(UPDATE_POLICY_FILE)) atomicJson(UPDATE_POLICY_FILE, value);
  return value;
}

function saveUpdatePolicy(raw) {
  const value = normaliseUpdatePolicy(raw);
  atomicJson(UPDATE_POLICY_FILE, value);
  return value;
}
''',
)
patch(
    "deploy/manager.mjs",
    'function commandFor(action) {\n  if (action === "update") return ["/usr/local/sbin/kems-update", []];',
    'function commandFor(action, options = {}) {\n  if (action === "update") return ["/usr/local/sbin/kems-update", options.targetVersion ? [String(options.targetVersion)] : []];',
)
patch(
    "deploy/manager.mjs",
    '''function startAction(action) {
  if (busy) throw new Error(`A ${actionState.action || "maintenance"} action is already running.`);
  const command = commandFor(action);
''',
    '''function startAction(action, options = {}) {
  if (busy) throw new Error(`A ${actionState.action || "maintenance"} action is already running.`);
  const command = commandFor(action, options);
''',
)
patch(
    "deploy/manager.mjs",
    '''      if (action === "update") latestCache = { at: 0, value: null };
    });
''',
    '''      if (action === "update") {
        latestCache = { at: 0, value: null };
        setTimeout(() => {
          try { spawn("systemctl", ["restart", "kems-web-manager.service"], { detached: true, stdio: "ignore" }).unref(); } catch {}
        }, 800);
      }
    });
''',
)
patch(
    "deploy/manager.mjs",
    '''    managerService: "active",
    installedVersion: installed,
''',
    '''    managerService: "active",
    bundleAgentService: serviceState("kems-web-bundle-agent.service"),
    installedVersion: installed,
''',
)
patch(
    "deploy/manager.mjs",
    '''    action: actionState,
    homeAssistant: await homeAssistantStatus(),
''',
    '''    action: actionState,
    updatePolicy: updatePolicy(),
    bundleAgent: readJson(BUNDLE_STATUS_FILE, { available: false, overallStatus: "starting", components: [], maintenance: { status: "none" } }),
    homeAssistant: await homeAssistantStatus(),
''',
)
patch(
    "deploy/manager.mjs",
    '''    if (url.pathname === "/health") return sendJson(response, 200, { ok: true, version: MANAGER_VERSION });
    if (url.pathname === "/status" && request.method === "GET") return sendJson(response, 200, await systemStatus(url.searchParams.get("refresh") === "1"));
''',
    '''    if (url.pathname === "/health") return sendJson(response, 200, { ok: true, version: MANAGER_VERSION });
    if (url.pathname === "/policy" && request.method === "GET") return sendJson(response, 200, updatePolicy());
    if (url.pathname === "/policy" && request.method === "PUT") {
      const body = await readBody(request);
      return sendJson(response, 200, saveUpdatePolicy(body));
    }
    if (url.pathname === "/status" && request.method === "GET") return sendJson(response, 200, await systemStatus(url.searchParams.get("refresh") === "1"));
''',
)
patch(
    "deploy/manager.mjs",
    '''      startAction(action);
      return sendJson(response, 202, { accepted: true, action, status: actionState });
''',
    '''      startAction(action, { targetVersion: body.targetVersion });
      return sendJson(response, 202, { accepted: true, action, targetVersion: body.targetVersion || null, status: actionState });
''',
)
patch(
    "deploy/manager.mjs",
    '''        manager: journal("kems-web-manager.service", 40),
        homeAssistant: homeAssistantLogs()
''',
    '''        manager: journal("kems-web-manager.service", 40),
        bundleAgent: safeRead(BUNDLE_AGENT_LOG_FILE, "").split(/\\r?\\n/).filter(Boolean).slice(-80),
        homeAssistant: homeAssistantLogs()
''',
)

# Exact appliance-target support and installation of the bundle agent.
patch(
    "deploy/bin/kems-update",
    'CURRENT_VERSION=""\n[[ -f "$CURRENT/package.json" ]] && CURRENT_VERSION="$(node -e \'const p=require(process.argv[1]);process.stdout.write(String(p.version||""))\' "$CURRENT/package.json")"\n',
    'CURRENT_VERSION=""\n[[ -f "$CURRENT/package.json" ]] && CURRENT_VERSION="$(node -e \'const p=require(process.argv[1]);process.stdout.write(String(p.version||""))\' "$CURRENT/package.json")"\nTARGET_VERSION="${1:-}"\n',
)
patch(
    "deploy/bin/kems-update",
    '''node - "$TMP/releases.json" "$TMP/selection.env" <<'NODE'
const fs = require('node:fs');
const [source, output] = process.argv.slice(2);
const releases = JSON.parse(fs.readFileSync(source, 'utf8'));
const selected = releases.find((release) => !release.draft && Array.isArray(release.assets) && release.assets.some((asset) => /^kems-web-.+-pi\\.tar\\.gz$/.test(asset.name)));
if (!selected) process.exit(2);
const archive = selected.assets.find((asset) => /^kems-web-.+-pi\\.tar\\.gz$/.test(asset.name));
''',
    '''node - "$TMP/releases.json" "$TMP/selection.env" "$TARGET_VERSION" <<'NODE'
const fs = require('node:fs');
const [source, output, requested] = process.argv.slice(2);
const releases = JSON.parse(fs.readFileSync(source, 'utf8'));
const archiveFor = (release) => Array.isArray(release.assets) ? release.assets.find((asset) => /^kems-web-.+-pi\\.tar\\.gz$/.test(asset.name)) : null;
const versionFor = (archive) => archive?.name?.replace(/^kems-web-/, '').replace(/-pi\\.tar\\.gz$/, '') || '';
const selected = releases.find((release) => {
  if (release.draft) return false;
  const archive = archiveFor(release);
  if (!archive) return false;
  if (!requested) return true;
  const clean = String(requested).replace(/^v(?=\\d)/, '');
  return versionFor(archive) === clean || String(release.tag_name || '') === requested || String(release.tag_name || '').replace(/^v(?=\\d)/, '') === clean;
});
if (!selected) {
  console.error(requested ? `No KEMS Web Pi release matches exact target ${requested}.` : 'No KEMS Web Pi release was found.');
  process.exit(2);
}
const archive = archiveFor(selected);
''',
)
patch(
    "deploy/bin/kems-update",
    '''  [[ -f "$DEST/deploy/manager.mjs" ]] && install -m 0644 "$DEST/deploy/manager.mjs" "$LIB/manager.mjs"
  [[ -f "$DEST/deploy/systemd/kems-web.service" ]] && install -m 0644 "$DEST/deploy/systemd/kems-web.service" /etc/systemd/system/kems-web.service
  [[ -f "$DEST/deploy/systemd/kems-web-manager.service" ]] && install -m 0644 "$DEST/deploy/systemd/kems-web-manager.service" /etc/systemd/system/kems-web-manager.service
''',
    '''  [[ -f "$DEST/deploy/manager.mjs" ]] && install -m 0644 "$DEST/deploy/manager.mjs" "$LIB/manager.mjs"
  [[ -f "$DEST/deploy/bundle-agent.mjs" ]] && install -m 0644 "$DEST/deploy/bundle-agent.mjs" "$LIB/bundle-agent.mjs"
  [[ -f "$DEST/deploy/systemd/kems-web.service" ]] && install -m 0644 "$DEST/deploy/systemd/kems-web.service" /etc/systemd/system/kems-web.service
  [[ -f "$DEST/deploy/systemd/kems-web-manager.service" ]] && install -m 0644 "$DEST/deploy/systemd/kems-web-manager.service" /etc/systemd/system/kems-web-manager.service
  [[ -f "$DEST/deploy/systemd/kems-web-bundle-agent.service" ]] && install -m 0644 "$DEST/deploy/systemd/kems-web-bundle-agent.service" /etc/systemd/system/kems-web-bundle-agent.service
''',
)
patch(
    "deploy/bin/kems-update",
    '''  systemctl enable kems-web-manager.service >/dev/null 2>&1 || true
  systemctl is-active --quiet kems-web-manager.service || systemctl start kems-web-manager.service || true
fi
''',
    '''  systemctl enable kems-web-manager.service >/dev/null 2>&1 || true
  systemctl is-active --quiet kems-web-manager.service || systemctl start kems-web-manager.service || true
  if [[ -f /etc/systemd/system/kems-web-bundle-agent.service && -f "$LIB/bundle-agent.mjs" ]]; then
    systemctl enable kems-web-bundle-agent.service >/dev/null 2>&1 || true
    systemctl is-active --quiet kems-web-bundle-agent.service || systemctl start kems-web-bundle-agent.service || true
  fi
fi
''',
)

# Fresh installs include and enable the agent too.
patch(
    "install.sh",
    'install -m 0644 "$SRC/deploy/manager.mjs" "$LIB_DIR/manager.mjs"\ninstall -m 0644 "$SRC/deploy/systemd/kems-web.service" /etc/systemd/system/kems-web.service\ninstall -m 0644 "$SRC/deploy/systemd/kems-web-manager.service" /etc/systemd/system/kems-web-manager.service\n',
    'install -m 0644 "$SRC/deploy/manager.mjs" "$LIB_DIR/manager.mjs"\ninstall -m 0644 "$SRC/deploy/bundle-agent.mjs" "$LIB_DIR/bundle-agent.mjs"\ninstall -m 0644 "$SRC/deploy/systemd/kems-web.service" /etc/systemd/system/kems-web.service\ninstall -m 0644 "$SRC/deploy/systemd/kems-web-manager.service" /etc/systemd/system/kems-web-manager.service\ninstall -m 0644 "$SRC/deploy/systemd/kems-web-bundle-agent.service" /etc/systemd/system/kems-web-bundle-agent.service\n',
)
patch(
    "install.sh",
    'systemctl enable --now kems-web-manager.service\n',
    'systemctl enable --now kems-web-manager.service\nsystemctl enable --now kems-web-bundle-agent.service\n',
)

# Server: expose a sanitised maintenance feed everywhere; policy remains direct-LAN only.
patch(
    "server.mjs",
    '''  if (url.pathname === "/api/system/status" && request.method === "GET") {
''',
    '''  if (url.pathname === "/api/maintenance" && request.method === "GET") {
    try {
      const system = await managerRequest("/status");
      const agent = system.bundleAgent || {};
      return sendJson(response, 200, {
        available: agent.available !== false,
        overallStatus: agent.overallStatus || "starting",
        bundle: agent.bundle?.bundle || null,
        release: agent.bundle?.release || null,
        maintenance: agent.maintenance || { status: "none" },
        components: agent.components || [],
        lastResult: agent.lastResult || null,
        checkedAt: agent.checkedAt || null
      });
    } catch (error) {
      return sendJson(response, 200, { available: false, overallStatus: "unavailable", maintenance: { status: "none" }, components: [], error: error.message });
    }
  }

  if (url.pathname === "/api/system/status" && request.method === "GET") {
''',
)
patch(
    "server.mjs",
    '''  if (url.pathname === "/api/system/logs" && request.method === "GET") {
''',
    '''  if (url.pathname === "/api/system/update-policy" && request.method === "GET") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Update policy is available only over a direct local-network KEMS address." });
    try { return sendJson(response, 200, await managerRequest("/policy")); }
    catch (error) { return sendJson(response, 503, { error: error.message }); }
  }

  if (url.pathname === "/api/system/update-policy" && request.method === "PUT") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Update policy can be changed only over a direct local-network KEMS address." });
    if (!sameOriginWrite(request)) return sendJson(response, 403, { error: "Cross-origin update-policy changes are not allowed." });
    try {
      const body = await readBody(request);
      return sendJson(response, 200, await managerRequest("/policy", { method: "PUT", body: JSON.stringify(body), timeout: 5000 }));
    } catch (error) { return sendJson(response, 503, { error: error.message }); }
  }

  if (url.pathname === "/api/system/logs" && request.method === "GET") {
''',
)
patch(
    "server.mjs",
    '''      const result = await managerRequest("/action", { method: "POST", body: JSON.stringify({ action }), timeout: 5000 });
''',
    '''      const result = await managerRequest("/action", { method: "POST", body: JSON.stringify({ action, targetVersion: body.targetVersion || null }), timeout: 5000 });
''',
)

# Website: poll the maintenance feed on every page and render one shared banner.
patch(
    "public/app.js",
    '''  system: null,
  site: null,
''',
    '''  system: null,
  maintenance: null,
  site: null,
''',
)
patch(
    "public/app.js",
    '''    const [snapshot, today, scenarios] = await Promise.all([
      getJson("/api/live"),
      getJson("/api/analytics?range=day"),
      getJson("/api/scenarios").catch((error) => ({ available: false, error: error.message, periods: {}, timeline: [] }))
    ]);
''',
    '''    const [snapshot, today, scenarios, maintenance] = await Promise.all([
      getJson("/api/live"),
      getJson("/api/analytics?range=day"),
      getJson("/api/scenarios").catch((error) => ({ available: false, error: error.message, periods: {}, timeline: [] })),
      getJson("/api/maintenance").catch(() => ({ available: false, overallStatus: "unavailable", maintenance: { status: "none" }, components: [] }))
    ]);
''',
)
patch(
    "public/app.js",
    '''    state.scenarios = scenarios;
    state.lastAnalyticsLoad = Date.now();
''',
    '''    state.scenarios = scenarios;
    state.maintenance = maintenance;
    state.lastAnalyticsLoad = Date.now();
''',
)
patch(
    "public/app.js",
    '''function render() {
  if (!state.snapshot) return;
''',
    '''function maintenanceBanner() {
  const feed = state.maintenance;
  const notice = feed?.maintenance || {};
  const status = String(notice.status || "none");
  if (["none", ""].includes(status)) return "";
  const tone = ["failed", "attention-required"].includes(status) ? "bad" : ["completed", "success"].includes(status) ? "good" : "warning";
  const scheduled = notice.scheduled_for ? formatDate(notice.scheduled_for, { time: true, year: true }) : null;
  const affected = Array.isArray(notice.affected_components) && notice.affected_components.length ? notice.affected_components.join(", ") : "KEMS services";
  const title = status === "completed" ? "KEMS maintenance complete" : status === "failed" ? "KEMS maintenance needs attention" : status === "in_progress" ? "KEMS maintenance in progress" : status === "restart-required" ? "KEMS restart required" : "Planned KEMS maintenance";
  const timing = scheduled ? ` · ${scheduled}` : "";
  const downtime = notice.expected_downtime_minutes ? ` · about ${notice.expected_downtime_minutes} min` : "";
  return `<section class="global-maintenance ${tone}"><div><span>${escapeHtml(title)}</span><strong>${escapeHtml(notice.reason || feed.overallStatus || "Coordinated KEMS update")}</strong><small>${escapeHtml(`Affected: ${affected}${timing}${downtime}`)}</small></div><b>${escapeHtml(status.replace(/-/g, " "))}</b></section>`;
}

function render() {
  if (!state.snapshot) return;
''',
)
patch(
    "public/app.js",
    '''  app.innerHTML = `${views[state.route]()}${footer()}`;
''',
    '''  app.innerHTML = `${maintenanceBanner()}${views[state.route]()}${footer()}`;
''',
)

# Pi Settings: show component convergence and allow update policy to be configured.
patch(
    "public/app.js",
    '''  const managerActivationRequired = Boolean(system.applianceActivationRequired || (system.managerVersion && system.installedVersion && system.managerVersion !== system.installedVersion));
''',
    '''  const managerActivationRequired = Boolean(system.applianceActivationRequired || (system.managerVersion && system.installedVersion && system.managerVersion !== system.installedVersion));
  const agent = system.bundleAgent || {};
  const policy = system.updatePolicy || agent.policy || {};
  const componentRows = (agent.components || []).map((item) => `<div><span>${escapeHtml(item.key)}</span><strong>${escapeHtml(item.status || "unknown")}</strong><small>${escapeHtml(`${item.installed || "—"} → ${item.target || "—"}`)}</small></div>`).join("");
  const coordinatedPanel = `<div class="coordinated-update-panel"><div class="system-status-line"><span class="system-dot ${escapeHtml(systemTone(agent.overallStatus === "up-to-date" ? "healthy" : agent.overallStatus))}"></span><strong>${escapeHtml(agent.overallStatus === "up-to-date" ? "Everything up to date" : agent.overallStatus || "Starting")}</strong><span>${escapeHtml(agent.bundle?.bundle || "Waiting for first KEMS bundle")}</span></div>${componentRows ? `<div class="system-grid component-grid">${componentRows}</div>` : ""}<form id="update-policy-form" class="update-policy-form"><label class="remember-row"><input id="automatic-updates" type="checkbox" ${policy.automaticUpdates ? "checked" : ""}/><span>Automatic coordinated updates</span></label><label><span>Update mode</span><select class="input" id="update-mode"><option value="safe-first" ${policy.mode !== "window-only" ? "selected" : ""}>Safe updates immediately; disruption in window</option><option value="window-only" ${policy.mode === "window-only" ? "selected" : ""}>All updates in maintenance window</option></select></label><div class="maintenance-time-grid"><label><span>Maintenance starts</span><input class="input" id="maintenance-start" type="time" value="${escapeHtml(policy.maintenanceStart || "03:00")}" /></label><label><span>Maintenance ends</span><input class="input" id="maintenance-end" type="time" value="${escapeHtml(policy.maintenanceEnd || "04:00")}" /></label></div><label class="remember-row"><input id="automatic-reboot" type="checkbox" ${policy.automaticReboot ? "checked" : ""}/><span>Allow automatic Pi reboot inside maintenance window</span></label><label class="remember-row"><input id="maintenance-notices" type="checkbox" ${policy.notifyMaintenance !== false ? "checked" : ""}/><span>Show maintenance notices in user areas</span></label><button class="button secondary" type="submit">Save automatic update policy</button><div id="update-policy-result" class="form-result"></div></form></div>`;
''',
)
patch(
    "public/app.js",
    '''    ${activationPanel}${updateCopy}${actionPanel}
    <div class="drawer-actions system-actions">
''',
    '''    ${coordinatedPanel}${activationPanel}${updateCopy}${actionPanel}
    <div class="drawer-actions system-actions">
''',
)
patch(
    "public/app.js",
    '''  document.querySelector("#restore-kems")?.addEventListener("click", showRestoreModal);
}
''',
    '''  document.querySelector("#restore-kems")?.addEventListener("click", showRestoreModal);
  document.querySelector("#update-policy-form")?.addEventListener("submit", saveUpdatePolicy);
}

async function saveUpdatePolicy(event) {
  event.preventDefault();
  const result = document.querySelector("#update-policy-result");
  if (result) { result.className = "form-result"; result.textContent = "Saving update policy…"; }
  try {
    const policy = await getJson("/api/system/update-policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automaticUpdates: document.querySelector("#automatic-updates")?.checked,
        coordinatedUpdates: true,
        mode: document.querySelector("#update-mode")?.value || "safe-first",
        maintenanceStart: document.querySelector("#maintenance-start")?.value || "03:00",
        maintenanceEnd: document.querySelector("#maintenance-end")?.value || "04:00",
        automaticReboot: document.querySelector("#automatic-reboot")?.checked,
        notifyMaintenance: document.querySelector("#maintenance-notices")?.checked,
        channel: "alpha"
      })
    });
    state.system = { ...(state.system || {}), updatePolicy: policy };
    if (result) { result.className = "form-result good"; result.textContent = "Automatic update policy saved."; }
    setTimeout(() => refreshSystemStatus(true), 500);
  } catch (error) {
    if (result) { result.className = "form-result danger"; result.textContent = error.message; }
  }
}
''',
)
patch(
    "public/app.js",
    '''    const [snapshot, today, scenarios, maintenance] = await Promise.all([
''',
    '''    const [snapshot, today, scenarios, maintenance] = await Promise.all([
''',
)

# Log modal includes the bundle agent.
patch(
    "public/app.js",
    '''    document.querySelector(".modal-body").innerHTML = `${block("Maintenance", logs.action)}${block("KEMS Web", logs.web)}${block("Pi manager", logs.manager)}${block("Home Assistant Container", logs.homeAssistant)}`;
''',
    '''    document.querySelector(".modal-body").innerHTML = `${block("Maintenance", logs.action)}${block("Coordinated update agent", logs.bundleAgent)}${block("KEMS Web", logs.web)}${block("Pi manager", logs.manager)}${block("Home Assistant Container", logs.homeAssistant)}`;
''',
)

# Tests describe the new Pi contract.
patch(
    "scripts/pi-deployment-test.mjs",
    'mustContain("deploy/systemd/kems-web-manager.service", ["User=root", "KEMS_MANAGER_PORT=4174", "manager.mjs"]);',
    'mustContain("deploy/systemd/kems-web-manager.service", ["User=root", "KEMS_MANAGER_PORT=4174", "manager.mjs"]);\nmustContain("deploy/systemd/kems-web-bundle-agent.service", ["User=root", "bundle-agent.mjs", "network-online.target"]);\nmustContain("deploy/bundle-agent.mjs", ["kems-bundle.json", "sha256", "automaticUpdates", "maintenanceStart", "public_web", "kems-update"]);',
)
patch(
    "scripts/pi-deployment-test.mjs",
    'mustContain("install.sh", ["kems-web-manager.service", "manager.mjs", "/var/lib/kems-web-management"]);',
    'mustContain("install.sh", ["kems-web-manager.service", "kems-web-bundle-agent.service", "bundle-agent.mjs", "manager.mjs", "/var/lib/kems-web-management"]);',
)
patch(
    "scripts/pi-deployment-test.mjs",
    'mustContain("deploy/bin/kems-update", ["Verifying release checksum", "deploy/manager.mjs", "kems-web-manager.service", "Rolling back automatically"]);',
    'mustContain("deploy/bin/kems-update", ["TARGET_VERSION", "Verifying release checksum", "deploy/manager.mjs", "bundle-agent.mjs", "kems-web-bundle-agent.service", "Rolling back automatically"]);',
)
patch(
    "scripts/pi-deployment-test.mjs",
    'mustContain("server.mjs", ["/api/site", "/api/home-assistant/status", "/api/home-assistant/action", "site.json"]);',
    'mustContain("server.mjs", ["/api/site", "/api/maintenance", "/api/system/update-policy", "/api/home-assistant/status", "/api/home-assistant/action", "site.json"]);',
)
patch(
    "scripts/pi-deployment-test.mjs",
    'mustContain("public/app.js", ["Site identity", "Host on this KEMS Pi", "Install Home Assistant", "Connect KEMS to local HA"]);',
    'mustContain("public/app.js", ["Site identity", "Automatic coordinated updates", "Planned KEMS maintenance", "Host on this KEMS Pi", "Install Home Assistant", "Connect KEMS to local HA"]);',
)

# Append small, isolated styles for maintenance/update controls.
styles = ROOT / "public/styles.css"
with styles.open("a", encoding="utf-8") as handle:
    handle.write(r'''

/* Coordinated KEMS updates / maintenance */
.global-maintenance{display:flex;justify-content:space-between;gap:18px;align-items:center;margin:0 0 18px;padding:14px 16px;border:1px solid rgba(243,199,108,.24);border-radius:17px;background:rgba(243,199,108,.055)}
.global-maintenance.good{border-color:rgba(139,227,162,.28);background:rgba(139,227,162,.055)}
.global-maintenance.bad{border-color:rgba(255,143,157,.3);background:rgba(255,143,157,.06)}
.global-maintenance>div{display:grid;gap:3px}.global-maintenance span{color:var(--muted);font-size:.58rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.global-maintenance strong{font-size:.78rem}.global-maintenance small{color:var(--muted);font-size:.61rem}.global-maintenance>b{padding:6px 9px;border:1px solid var(--line);border-radius:999px;font-size:.58rem;text-transform:uppercase;white-space:nowrap}
.coordinated-update-panel{display:grid;gap:12px;margin:14px 0;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.02)}
.component-grid{margin:0}.component-grid div{min-width:0}.component-grid small{word-break:break-word}
.update-policy-form{display:grid;gap:10px;padding-top:3px}.update-policy-form label:not(.remember-row){display:grid;gap:5px;color:var(--muted);font-size:.61rem}.maintenance-time-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.maintenance-time-grid label{display:grid;gap:5px}
@media(max-width:720px){.global-maintenance{align-items:flex-start;flex-direction:column}.maintenance-time-grid{grid-template-columns:1fr}}
''')

# One-shot helper and workflow should not remain in the finished branch.
for transient in (
    ROOT / "scripts/add_unified_update_orchestrator_once.py",
    ROOT / ".github/workflows/add-unified-update-orchestrator-once.yml",
):
    transient.unlink(missing_ok=True)
