let siteDetails = null;
let applying = false;

function pwaState() {
  return window.KEMSPWA?.getState?.() || {
    installed: false,
    secureContext: window.isSecureContext,
    installAvailable: false,
    installReason: window.isSecureContext ? "browser-menu" : "https-required",
    serviceWorkerSupported: "serviceWorker" in navigator,
    serviceWorkerRegistered: false,
    serviceWorkerReady: false,
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    manifestChecked: false,
    manifestValid: false,
  };
}

function valueRow(label, value) {
  return `<div class="status-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function browserGuidance(state) {
  if (!state.secureContext) {
    return "This HTTP page can only be added as a normal browser shortcut. Open the authenticated HTTPS KEMS property address first; a real PWA then opens without Chrome's address bar.";
  }
  if (!state.manifestChecked) return "KEMS is checking the install manifest.";
  if (!state.manifestValid) return "KEMS cannot offer a standalone install until the manifest check passes.";
  if (!state.serviceWorkerReady) return "The KEMS app worker is still activating. Wait a moment, then reload this page once if needed.";
  if (state.serviceWorkerReady && !state.serviceWorkerControlled) return "The KEMS app worker is ready but this tab is not controlled yet. Reload this page once, then return to Settings.";
  if (state.installAvailable) return "KEMS is ready for a standalone app install.";
  if (isIos()) return "In Safari, tap Share, then Add to Home Screen.";
  return "If Chrome does not show the KEMS install prompt here, open Chrome's menu and choose Install app. If it only says Add to Home screen and the shortcut reopens with an address bar, check the diagnostics below.";
}

function safeRemoteUrl() {
  const host = String(siteDetails?.remoteHostname || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return null;
  return `https://${host}/settings.html`;
}

async function loadSiteDetails() {
  if (siteDetails) return siteDetails;
  try {
    const response = await fetch("/api/site", { cache: "no-store" });
    if (response.ok) siteDetails = await response.json();
  } catch {
    // The install diagnostics still work without a configured remote hostname.
  }
  return siteDetails;
}

function diagnosticMarkup(state) {
  const secure = state.secureContext ? "HTTPS / secure" : "HTTP / shortcut only";
  const manifest = !state.manifestChecked ? "Checking" : state.manifestValid ? "Valid" : "Problem";
  let worker;
  if (!state.secureContext) worker = "Requires HTTPS";
  else if (!state.serviceWorkerSupported) worker = "Unsupported";
  else if (state.serviceWorkerReady) worker = "Ready";
  else if (state.serviceWorkerRegistered) worker = "Activating";
  else worker = "Not ready";
  const control = state.serviceWorkerControlled ? "Controlled" : state.serviceWorkerReady ? "Reload once" : "Not controlled";
  const prompt = state.installAvailable ? "Ready" : state.installed ? "Installed" : "Not offered yet";
  const launch = state.installed ? "Standalone app" : "Browser tab";

  return `<div class="kems-pwa-diagnostics"><h3>Install diagnostics</h3><div class="status-list">${valueRow("Page security", secure)}${valueRow("Manifest", manifest)}${valueRow("Service worker", worker)}${valueRow("Current page", control)}${valueRow("Browser install prompt", prompt)}${valueRow("Launch mode", launch)}</div></div>`;
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

async function applyPwaState(state = pwaState()) {
  if (applying) return;
  applying = true;
  try {
    const button = document.querySelector("#install-pwa");
    if (!button) return;
    button.dataset.kemsPwaBound = "true";

    await loadSiteDetails();
    const section = button.closest("section");
    if (!section) return;

    let diagnostics = section.querySelector("[data-kems-pwa-diagnostics]");
    if (!diagnostics) {
      diagnostics = document.createElement("div");
      diagnostics.dataset.kemsPwaDiagnostics = "true";
      section.append(diagnostics);
    }
    const nextDiagnostics = diagnosticMarkup(state);
    if (diagnostics.innerHTML !== nextDiagnostics) diagnostics.innerHTML = nextDiagnostics;

    let guidance = section.querySelector("[data-kems-pwa-guidance]");
    if (!guidance) {
      guidance = document.createElement("p");
      guidance.className = "web21-muted kems-pwa-guidance";
      guidance.dataset.kemsPwaGuidance = "true";
      section.append(guidance);
    }
    setText(guidance, browserGuidance(state));

    button.disabled = Boolean(state.installed);
    button.classList.toggle("primary", Boolean(state.installAvailable && !state.installed));

    if (state.installed) {
      setText(button, "KEMS is installed");
      button.dataset.kemsPwaAction = "installed";
    } else if (!state.secureContext) {
      setText(button, safeRemoteUrl() ? "Open secure KEMS" : "How to install KEMS");
      button.dataset.kemsPwaAction = safeRemoteUrl() ? "https" : "guide";
    } else if (state.installAvailable) {
      setText(button, "Install KEMS");
      button.dataset.kemsPwaAction = "prompt";
    } else if (state.serviceWorkerReady && !state.serviceWorkerControlled) {
      setText(button, "Reload to finish app setup");
      button.dataset.kemsPwaAction = "reload";
    } else {
      setText(button, "How to install KEMS");
      button.dataset.kemsPwaAction = "guide";
    }
  } finally {
    applying = false;
  }
}

function showGuidance(state) {
  window.alert(browserGuidance(state));
}

document.addEventListener(
  "click",
  async (event) => {
    const button = event.target.closest?.("#install-pwa");
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const state = pwaState();
    const action = button.dataset.kemsPwaAction;
    if (action === "prompt") {
      const result = await window.KEMSPWA?.promptInstall?.();
      await applyPwaState(pwaState());
      if (result?.outcome === "accepted") return;
      if (result?.outcome === "dismissed") return;
      showGuidance(pwaState());
      return;
    }
    if (action === "https") {
      const url = safeRemoteUrl();
      if (url) window.location.assign(url);
      else showGuidance(state);
      return;
    }
    if (action === "reload") {
      window.location.reload();
      return;
    }
    if (action !== "installed") showGuidance(state);
  },
  true,
);

window.addEventListener("kems:pwa-state", (event) => {
  applyPwaState(event.detail || pwaState());
});

const observer = new MutationObserver(() => {
  const button = document.querySelector("#install-pwa");
  if (!button) return;
  const section = button.closest("section");
  const alreadyBound =
    button.dataset.kemsPwaBound === "true" &&
    Boolean(section?.querySelector("[data-kems-pwa-diagnostics]"));
  if (!alreadyBound) applyPwaState(pwaState());
});
observer.observe(document.documentElement, { childList: true, subtree: true });

loadSiteDetails().finally(() => applyPwaState(pwaState()));
