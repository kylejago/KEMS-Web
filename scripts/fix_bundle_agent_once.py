"""Harden bundle-agent verification and completion persistence once."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "deploy" / "bundle-agent.mjs"
text = path.read_text(encoding="utf-8")

old = '''  if (!localChanges.length) {
    const overall = blockingSystem ? "attention-required" : publicRequired ? "waiting-external" : "up-to-date";
    saveStatus({ available: true, bundle, overallStatus: overall, components: statuses, maintenance: { status: "none" }, lastError: blockingSystem?.detail || null });
    return;
  }
'''
new = '''  if (!localChanges.length) {
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
'''
if old not in text:
    raise SystemExit("completion persistence anchor not found")
text = text.replace(old, new, 1)

old = '''  const target = webTarget || agentTarget;
  if (!target) throw new Error("Bundle has local Pi changes but no installable appliance target");

  saveStatus({ available: true, bundle, overallStatus: "updating", components: statuses, maintenance: maintenanceNotice(bundle, "in_progress", null, { target }), lastError: null });
'''
new = '''  const target = webTarget || agentTarget;
  if (!target) throw new Error("Bundle has local Pi changes but no installable appliance target");
  const agentChanged = Boolean(agentTarget && !sameVersion(agentTarget, AGENT_VERSION));

  saveStatus({ available: true, bundle, overallStatus: "updating", components: statuses, maintenance: maintenanceNotice(bundle, "in_progress", null, { target }), lastError: null });
'''
if old not in text:
    raise SystemExit("agent change anchor not found")
text = text.replace(old, new, 1)

old = '''  appendLog(`Converging appliance to exact bundle target ${target}`);
  await runCommand("/usr/local/sbin/kems-update", [target]);

  const verified = componentStatuses(bundle);
'''
new = '''  appendLog(`Converging appliance to exact bundle target ${target}`);
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
'''
if old not in text:
    raise SystemExit("manager verification anchor not found")
text = text.replace(old, new, 1)

old = '''  saveStatus({ available: true, bundle, overallStatus: rebootRequired ? "rebooting" : "up-to-date", components: verified, maintenance: maintenanceNotice(bundle, rebootRequired ? "in_progress" : "completed", null), lastResult: result, lastError: null });
  if (rebootRequired) {
    appendLog("Bundle requests Pi reboot; rebooting inside the maintenance window.");
    spawn("systemctl", ["reboot"], { detached: true, stdio: "ignore" }).unref();
  }
'''
new = '''  saveStatus({ available: true, bundle, overallStatus: rebootRequired ? "rebooting" : "up-to-date", components: verified, maintenance: maintenanceNotice(bundle, rebootRequired ? "in_progress" : "completed", null), lastResult: result, lastError: null });
  if (rebootRequired) {
    appendLog("Bundle requests Pi reboot; rebooting inside the maintenance window.");
    spawn("systemctl", ["reboot"], { detached: true, stdio: "ignore" }).unref();
  } else if (agentChanged) {
    appendLog("Updated Pi agent verified; restarting the bundle agent onto its new code.");
    setTimeout(() => {
      try { spawn("systemctl", ["restart", "kems-web-bundle-agent.service"], { detached: true, stdio: "ignore" }).unref(); } catch {}
    }, 1000);
  }
'''
if old not in text:
    raise SystemExit("agent restart anchor not found")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")

for transient in (
    ROOT / "scripts" / "fix_bundle_agent_once.py",
    ROOT / ".github" / "workflows" / "fix-bundle-agent-once.yml",
):
    transient.unlink(missing_ok=True)
