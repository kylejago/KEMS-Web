const nativeEventSource = globalThis.EventSource;

// The KEMS planning dashboard is a large read-only evidence surface. The
// legacy renderer opens /api/stream and rebuilds the whole page for every
// snapshot; on the full 48+48 slot view that is unnecessarily expensive.
// Suppress that stream while the renderer initialises and refresh the page
// state at a controlled cadence instead. Live Data remains the fast surface.
class KemsIdleEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
  }

  addEventListener() {}
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
}

let eventSourceSuppressed = false;
try {
  globalThis.EventSource = KemsIdleEventSource;
  eventSourceSuppressed = globalThis.EventSource === KemsIdleEventSource;
  await import("./agile-page.js?v=build2");
} finally {
  if (eventSourceSuppressed) globalThis.EventSource = nativeEventSource;
}

await import("./kems-flow-page.js?v=build2");

const REFRESH_INTERVAL_MS = 30_000;
window.setInterval(() => {
  if (document.hidden) return;
  document.querySelector("#refresh-button")?.click();
}, REFRESH_INTERVAL_MS);
