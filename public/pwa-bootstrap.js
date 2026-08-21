const state = {
  installPrompt: null,
  installed:
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true,
  online: window.navigator.onLine,
  secureContext: window.isSecureContext,
  serviceWorkerSupported: "serviceWorker" in navigator,
  serviceWorkerRegistered: false,
  serviceWorkerReady: false,
  serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
  manifestChecked: false,
  manifestValid: false,
  manifestStandalone: false,
  manifestIcons: false,
  manifestCredentials: false,
  manifestLinkPresent: false,
  manifestName: null,
  manifestError: null,
};

function installReason() {
  if (state.installed) return "installed";
  if (!state.secureContext) return "https-required";
  if (!state.manifestChecked) return "checking-manifest";
  if (!state.manifestCredentials) return "manifest-credentials-missing";
  if (!state.manifestValid) return "manifest-invalid";
  if (!state.serviceWorkerSupported) return "service-worker-unsupported";
  if (!state.serviceWorkerReady) return "service-worker-not-ready";
  if (state.installPrompt) return "prompt-ready";
  return "browser-menu";
}

function publicState() {
  return {
    installed: state.installed,
    online: state.online,
    secureContext: state.secureContext,
    installAvailable: Boolean(state.installPrompt),
    installReason: installReason(),
    serviceWorkerSupported: state.serviceWorkerSupported,
    serviceWorkerRegistered: state.serviceWorkerRegistered,
    serviceWorkerReady: state.serviceWorkerReady,
    serviceWorkerControlled: state.serviceWorkerControlled,
    manifestChecked: state.manifestChecked,
    manifestValid: state.manifestValid,
    manifestStandalone: state.manifestStandalone,
    manifestIcons: state.manifestIcons,
    manifestCredentials: state.manifestCredentials,
    manifestLinkPresent: state.manifestLinkPresent,
    manifestName: state.manifestName,
    manifestError: state.manifestError,
  };
}

function emitState() {
  window.dispatchEvent(
    new CustomEvent("kems:pwa-state", {
      detail: publicState(),
    }),
  );
}

function authBanner() {
  let banner = document.querySelector("#kems-auth-required");
  if (banner) return banner;

  banner = document.createElement("aside");
  banner.id = "kems-auth-required";
  banner.className = "kems-auth-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <div>
      <strong>KEMS session expired</strong>
      <span>Sign in again through Cloudflare Access to continue viewing this property.</span>
    </div>
    <button type="button" data-kems-sign-in>Sign in again</button>
  `;
  banner.querySelector("[data-kems-sign-in]")?.addEventListener("click", () => {
    window.location.reload();
  });
  document.body.append(banner);
  return banner;
}

function showAuthRequired() {
  authBanner().hidden = false;
}

function hideAuthRequired() {
  const banner = document.querySelector("#kems-auth-required");
  if (banner) banner.hidden = true;
}

function iconHasSize(icons, wanted) {
  return Array.isArray(icons) && icons.some((icon) =>
    String(icon?.sizes || "")
      .split(/\s+/)
      .includes(wanted),
  );
}

function manifestLinkState() {
  const link = document.querySelector('link[rel="manifest"]');
  return {
    link,
    present: Boolean(link),
    credentialed:
      link?.crossOrigin === "use-credentials" ||
      link?.getAttribute("crossorigin") === "use-credentials",
  };
}

async function refreshManifestDiagnostics() {
  state.manifestChecked = false;
  state.manifestError = null;
  const manifestLink = manifestLinkState();
  state.manifestLinkPresent = manifestLink.present;
  state.manifestCredentials = manifestLink.credentialed;
  emitState();

  try {
    if (!manifestLink.link) throw new Error("Manifest link is missing from this page.");
    if (!manifestLink.credentialed) {
      throw new Error("Manifest link is not configured to include Cloudflare Access credentials.");
    }

    const response = await fetch(manifestLink.link.href || "/site.webmanifest", {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/manifest+json,application/json;q=0.9,*/*;q=0.1" },
    });
    if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);

    const manifest = await response.json();
    const startUrl = new URL(manifest.start_url || "/", window.location.href);
    const scopeUrl = new URL(manifest.scope || "/", window.location.href);
    const sameOrigin = startUrl.origin === window.location.origin && scopeUrl.origin === window.location.origin;
    const named = Boolean(String(manifest.name || manifest.short_name || "").trim());
    const standalone = ["standalone", "fullscreen", "minimal-ui"].includes(String(manifest.display || ""));
    const icons = iconHasSize(manifest.icons, "192x192") && iconHasSize(manifest.icons, "512x512");

    state.manifestChecked = true;
    state.manifestStandalone = standalone;
    state.manifestIcons = icons;
    state.manifestName = manifest.name || manifest.short_name || null;
    state.manifestValid = Boolean(named && sameOrigin && standalone && icons && state.manifestCredentials);
    state.manifestError = state.manifestValid ? null : "Manifest is missing an installability requirement.";
  } catch (error) {
    state.manifestChecked = true;
    state.manifestValid = false;
    state.manifestStandalone = false;
    state.manifestIcons = false;
    state.manifestName = null;
    state.manifestError = error instanceof Error ? error.message : String(error);
  }

  emitState();
  return publicState();
}

async function promptInstall() {
  const prompt = state.installPrompt;
  if (!prompt) return { outcome: "unavailable", reason: installReason() };

  state.installPrompt = null;
  emitState();
  await prompt.prompt();
  try {
    return await prompt.userChoice;
  } catch {
    return { outcome: "unknown" };
  }
}

window.KEMSPWA = Object.freeze({
  getState: publicState,
  promptInstall,
  refreshDiagnostics: refreshManifestDiagnostics,
  showAuthRequired,
  hideAuthRequired,
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  emitState();
});

window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  state.installed = true;
  emitState();
});

window.addEventListener("online", () => {
  state.online = true;
  document.documentElement.classList.remove("kems-offline");
  emitState();
});

window.addEventListener("offline", () => {
  state.online = false;
  document.documentElement.classList.add("kems-offline");
  emitState();
});

window.addEventListener("pageshow", () => {
  state.installed =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true;
  state.serviceWorkerControlled = Boolean(navigator.serviceWorker?.controller);
  emitState();
});

if (!state.online) document.documentElement.classList.add("kems-offline");

refreshManifestDiagnostics();

if (state.serviceWorkerSupported && state.secureContext) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "KEMS_AUTH_REQUIRED") showAuthRequired();
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    state.serviceWorkerControlled = Boolean(navigator.serviceWorker.controller);
    emitState();
  });

  navigator.serviceWorker
    .register("/service-worker.js", { scope: "/" })
    .then(async (registration) => {
      state.serviceWorkerRegistered = true;
      emitState();

      try {
        await navigator.serviceWorker.ready;
        state.serviceWorkerReady = true;
        state.serviceWorkerControlled = Boolean(navigator.serviceWorker.controller);
        emitState();
      } catch {
        state.serviceWorkerReady = false;
        emitState();
      }

      try {
        await registration.update();
      } catch {
        // The installed shell remains usable if an update check is temporarily offline.
      }
    })
    .catch(() => {
      state.serviceWorkerRegistered = false;
      state.serviceWorkerReady = false;
      state.serviceWorkerControlled = false;
      emitState();
    });
}

emitState();
