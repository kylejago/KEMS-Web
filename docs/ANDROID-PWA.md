# KEMS mobile app and PWA

KEMS Web.33 makes the authenticated property website the primary KEMS mobile application surface and fixes the Cloudflare Access manifest-authentication gap exposed by the Web.32 real-phone test.

The property website includes:

- a web app manifest with 192px, 512px and maskable PNG icons;
- standalone display mode on Android and iOS home-screen installs;
- mobile safe-area handling for notches and home indicators;
- a shared PWA bootstrap on Live Data, Compare, Full KEMS Agile, Cost & ROI and Settings;
- `crossorigin="use-credentials"` on every property manifest link so the browser includes Cloudflare Access cookies when it fetches the protected manifest;
- a service worker that caches only the application shell;
- explicit exclusion of `/api/*` from offline data caching so live KEMS/Home Assistant readings are never replaced by stale cached telemetry;
- Cloudflare Access redirect detection so an expired remote session is never cached as if it were a KEMS page or JavaScript asset;
- a visible **Sign in again** prompt when an authenticated property's API session expires;
- one authoritative captured browser install prompt shared with Settings;
- Settings diagnostics for secure context, runtime manifest, manifest credentials, service-worker readiness/control, browser install prompt and standalone launch mode.

## Local Pi versus installed app

The local Pi dashboard remains available at `http://kems-pi.local:4173`. That address is plain HTTP and is therefore not the normal standalone PWA installation route.

Chrome may still offer **Add to Home screen** for the local HTTP page. In that case Chrome is creating a normal website shortcut: launching it opens Chrome with the address bar. That is expected and is not treated by KEMS as a successful PWA install.

The real installed-app path uses the authenticated HTTPS property hostname published through Cloudflare Access. Because the manifest itself sits behind Access, the browser manifest link must use credential inclusion; Web.33 now does that on every property page.

The installed PWA uses the same Raspberry Pi backend, same Home Assistant/KEMS source data and same dashboard code as the property website. There is no second mobile dashboard implementation to keep in sync.

## Android

On Android:

1. Open the authorised **HTTPS** KEMS property address in Chrome, not `http://kems-pi.local:4173`.
2. Complete Cloudflare Access sign-in if prompted.
3. Open **Settings → KEMS as a web app**.
4. Confirm the diagnostics show **HTTPS / secure**, **Manifest: Valid**, **Manifest credentials: Included** and **Service worker: Ready**. If Current page says **Reload once**, reload once and return to Settings.
5. Choose **Install KEMS** when the browser prompt is ready. If Chrome owns the prompt instead, use Chrome's **Install app** action.
6. Launch KEMS from the Android home screen.

A successful Android PWA opens without Chrome's normal address bar and reports **Launch mode: Standalone app** in KEMS Settings.

If Chrome still only offers **Create shortcut**, clear the stored site data for the property hostname once after upgrading from Web.31/Web.32, sign back in through Cloudflare Access, then revisit Settings. That removes the old service-worker/manifest state while leaving the Pi untouched.

## iPhone / iPad

On Safari:

1. Open the authorised KEMS property HTTPS address.
2. Complete Cloudflare Access sign-in if prompted.
3. Use **Share → Add to Home Screen**.
4. Launch KEMS from the home-screen icon.

Web.33 retains `viewport-fit=cover`, Apple installed-app metadata and safe-area padding so the fixed mobile navigation remains clear of the home indicator.

## Install diagnostics

Web.33 reports these values directly in Settings:

- **Page security** — whether the current page is HTTPS/secure or HTTP/shortcut-only;
- **Manifest** — whether the actual runtime `/site.webmanifest` contains the required standalone fields and 192px/512px icons;
- **Manifest credentials** — whether the browser manifest link is configured with `crossorigin="use-credentials"` so Cloudflare Access cookies are sent;
- **Service worker** — whether the KEMS app worker is registered and ready;
- **Current page** — whether this tab is actually controlled by the worker, or needs one reload after first activation;
- **Browser install prompt** — whether Chrome has exposed the real PWA install prompt;
- **Launch mode** — Browser tab or Standalone app.

The diagnostic manifest fetch itself uses `credentials: "include"`, matching the authenticated manifest path rather than checking a different request mode from the browser's installability fetch.

## Cloudflare Access boundary

The installed PWA does not contain a Home Assistant long-lived token. Remote access remains:

```text
phone / installed PWA
  → Cloudflare Access authentication
  → property-specific Cloudflare Tunnel
  → KEMS Pi localhost:4173
  → read-only KEMS property gateway
  → local Home Assistant/KEMS source data
```

Pi administration, connector provisioning, Home Assistant connection changes and future control endpoints remain local-network operations.

## Existing Flutter Android app

`KEMS-Android` 1.4.1 remains a frozen legacy companion implementation. It should remain available as a reference and fallback until Web.33 has passed real-phone standalone acceptance, but new KEMS dashboard features should not be duplicated into Flutter.

After the PWA opens standalone and the primary mobile pages are accepted on a real phone, the legacy Android repository can be archived. If a Play Store package is wanted later, prefer a small Trusted Web Activity/native wrapper around the verified KEMS PWA rather than rebuilding Live, Compare and Agile in Flutter.

A native layer should only be reintroduced for capabilities that genuinely require it, such as Android widgets, specialised background services, biometrics or device integrations that are not practical from the web platform.
