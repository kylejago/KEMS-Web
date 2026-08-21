const state = {
  installPrompt: null,
  installed:
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true,
  online: window.navigator.onLine,
  secureContext: window.isSecureContext,
  serviceWorkerReady: false,
};

function publicState() {
  return {
    installed: state.installed,
    online: state.online,
    secureContext: state.secureContext,
    installAvailable: Boolean(state.installPrompt),
    serviceWorkerReady: state.serviceWorkerReady,
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

async function promptInstall() {
  const prompt = state.installPrompt;
  if (!prompt) return { outcome: "unavailable" };

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

if (!state.online) document.documentElement.classList.add("kems-offline");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "KEMS_AUTH_REQUIRED") showAuthRequired();
  });

  navigator.serviceWorker
    .register("/service-worker.js", { scope: "/" })
    .then(async (registration) => {
      state.serviceWorkerReady = true;
      emitState();
      try {
        await registration.update();
      } catch {
        // The installed shell remains usable if an update check is temporarily offline.
      }
    })
    .catch(() => {
      state.serviceWorkerReady = false;
      emitState();
    });
}

emitState();
