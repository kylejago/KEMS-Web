<p align="center">
  <img src="brand/kems-logo.svg" alt="KEMS" width="180">
</p>

# KEMS Web — 0.7.0-alpha7-web.32

KEMS Web is the read-only property companion, installable mobile PWA and public-site source for the **KEMS Alpha7** platform. Home Assistant/KEMS remains the source of truth for each property.

## Canonical KEMS logo

`brand/kems-logo.svg` remains the single approved KEMS visual source of truth. The property dashboard, `kems.uk`, Remote Access and Pi setup use synced copies of the approved brand asset.

## Property dashboard

The property UI is read-only and provides:

- **Live Data** with the panel-inspired Solar / Grid / Home / Battery / EV view;
- **Compare** for Live Data, Battery & Solar, Full KEMS and Full KEMS Agile;
- **Full KEMS Agile** with Live / Simulated routing and optimiser evidence;
- **Cost & ROI** from commissioned live evidence;
- **Settings** for local property status, KEMS Web updates, maintenance policy, PWA install state and local-only Remote Access provisioning.

Real Home Assistant/inverter control remains outside KEMS Web.

## Mobile / installed app

Web.32 makes the authenticated HTTPS property website the primary KEMS mobile application surface and fixes the install-state ambiguity found during the first Web.31 real-phone test.

The same property UI can be installed as a standalone PWA on Android and added to the home screen on iPhone/iPad. It includes proper 192px, 512px and maskable icons, standalone mode, mobile safe-area handling and a shared service-worker bootstrap across all primary pages.

Settings now reports the actual install prerequisites and state: secure context, runtime manifest validity, service-worker readiness/control, browser install prompt and standalone launch mode. The browser install prompt is captured once by the shared bootstrap so Settings cannot miss it because of page-load timing.

The local `http://kems-pi.local:4173` page remains useful for LAN access, but Chrome may only create a normal shortcut from that HTTP address. A shortcut reopens with Chrome's address bar. The standalone KEMS app is installed from the authenticated HTTPS property hostname through Cloudflare Access.

The service worker caches only same-origin application-shell responses. `/api/*` telemetry is always network-only, and redirected Cloudflare Access login responses are never cached as KEMS pages or JavaScript assets. If an authenticated remote session expires while the installed app is open, KEMS surfaces a **Sign in again** prompt.

See `docs/ANDROID-PWA.md`.

## Remote access

Private property access continues through Cloudflare Access plus the outbound property tunnel:

```text
property.kems.uk -> Cloudflare Access -> property tunnel -> http://localhost:4173
```

The privileged connector setup helper remains root-owned and loopback-only on `127.0.0.1:4175`; management/setup requests are rejected when they arrive through Cloudflare or another forwarded proxy.

See `docs/REMOTE-ACCESS.md` and `docs/PROPERTY-LOGIN.md`.

## Seven-day-delayed public demo

The public demo remains a deliberately restricted surface:

```text
demo-api.kems.uk -> tunnel -> localhost:4173 -> GET /api/public-demo only
```

The gateway publishes sanitised daily product evidence only after the configured minimum seven-day privacy delay. It may include delayed aggregate EV energy, but never current household power, EV state/SOC/times, entity IDs, device IDs, Home Assistant credentials or a control endpoint.

See `docs/PUBLIC-DEMO.md`.

## Raspberry Pi appliance

Persistent data stays under `/var/lib/kems-web`; versioned releases stay under `/opt/kems-web/releases`. Published releases are checksum-verified, health-checked and can roll back. Pi updates, maintenance policy, connector provisioning and Home Assistant setup remain local-network operations even when the read-only dashboard is available remotely.

## Legacy Android app

The separate Flutter `KEMS-Android` 1.4.1 app remains a frozen legacy implementation while the Web.32 PWA completes real-device acceptance. New dashboard work belongs in KEMS Web so Live, Compare and Full KEMS Agile are maintained once. A future Play Store package, if required, should be a thin wrapper around the verified PWA rather than a second dashboard implementation.

## Validation

```bash
npm test
```

The suite checks syntax, brand identity, public-demo isolation and delay, Cloudflare-login boundaries, fixture compatibility, Alpha7 Agile evidence, comparison/ROI, Pi deployment behaviour, the Web.31 mobile shell contract, the Web.32 install-state contract and the actual runtime `/site.webmanifest` served by the Pi stack.
