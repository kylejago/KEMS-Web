const root = document.querySelector("#remote-access-app");
const statusRoot = document.querySelector("#remote-status");
const form = document.querySelector("#remote-install-form");
const commandInput = document.querySelector("#cloudflare-command");
const resultRoot = document.querySelector("#remote-result");
const toastRoot = document.querySelector("#toast-root");
const API = "/api/remote-access";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function tone(value) {
  return ["active", "healthy", "connected"].includes(String(value || "").toLowerCase()) ? "good" : ["failed", "error"].includes(String(value || "").toLowerCase()) ? "bad" : "neutral";
}

function toast(message, type = "good") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  toastRoot.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

async function json(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function render(status) {
  if (!status?.available) {
    statusRoot.innerHTML = `<div class="system-unavailable"><strong>Remote-access helper unavailable</strong><p>${escapeHtml(status?.error || "The local helper did not respond.")}</p></div>`;
    form.hidden = false;
    return;
  }
  const state = status.connected ? "Connected" : status.service === "active" ? "Starting / checking Cloudflare" : status.configured ? "Configured but stopped" : "Not configured";
  const logs = Array.isArray(status.recentLogs) ? status.recentLogs.slice(-5) : [];
  statusRoot.innerHTML = `
    <div class="system-status-line"><span class="system-dot ${tone(status.connected ? "connected" : status.service)}"></span><strong>${escapeHtml(state)}</strong><span>LAN-only setup API · helper ${escapeHtml(status.helperVersion || "current")}</span></div>
    <div class="system-grid">
      <div><span>cloudflared</span><strong>${escapeHtml(status.version || (status.installed ? "Installed" : "Not installed"))}</strong></div>
      <div><span>Service</span><strong>${escapeHtml(status.service || "Unknown")}</strong></div>
      <div><span>Starts at boot</span><strong>${status.enabled ? "Yes" : "No"}</strong></div>
      <div><span>Token</span><strong>${status.configured ? "Stored securely" : "Not configured"}</strong></div>
    </div>
    <div class="button-row">
      ${status.configured ? `<button class="button secondary" type="button" data-action="restart">Restart connector</button>` : ""}
      ${status.configured && status.service !== "active" ? `<button class="button secondary" type="button" data-action="enable">Enable connector</button>` : ""}
      ${status.configured && status.service === "active" ? `<button class="button secondary" type="button" data-action="disable">Disable connector</button>` : ""}
      ${status.configured ? `<button class="button danger" type="button" data-action="forget">Forget connector</button>` : ""}
    </div>
    ${logs.length ? `<details class="diagnostic-details"><summary>Recent connector log</summary><pre>${escapeHtml(logs.join("\n"))}</pre></details>` : ""}
  `;
  form.hidden = false;
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => runAction(button.dataset.action)));
}

async function refresh() {
  try {
    render(await json("/status"));
  } catch (error) {
    const localOnly = /direct local-network|local-network/i.test(error.message);
    statusRoot.innerHTML = `<div class="system-unavailable"><strong>${localOnly ? "Local network required" : "Remote-access helper unavailable"}</strong><p>${escapeHtml(error.message)}</p></div>`;
    form.hidden = localOnly;
  }
}

async function runAction(action) {
  const warnings = {
    disable: "Disable the Cloudflare connector? kyle.kems.uk will stop reaching this Pi until it is enabled again.",
    forget: "Forget the Cloudflare connector on this Pi? This removes the stored tunnel token and KEMS connector service."
  };
  if (warnings[action] && !window.confirm(warnings[action])) return;
  try {
    render(await json("/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }));
    toast(`Connector ${action} completed.`);
  } catch (error) {
    toast(error.message, "bad");
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = commandInput.value.trim();
  if (!command) {
    resultRoot.textContent = "Paste the Cloudflare connector command first.";
    return;
  }
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  resultRoot.textContent = "Installing and starting the Cloudflare connector…";
  try {
    const status = await json("/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command }) });
    commandInput.value = "";
    resultRoot.textContent = "Connector installed. The token has been removed from this form and is not returned by KEMS.";
    render(status);
    toast("Cloudflare connector installed.");
  } catch (error) {
    resultRoot.textContent = error.message;
    toast(error.message, "bad");
  } finally {
    button.disabled = false;
  }
});

root?.focus({ preventScroll: true });
refresh();
