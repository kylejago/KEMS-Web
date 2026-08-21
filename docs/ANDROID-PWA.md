# KEMS mobile app and PWA

KEMS Web.31 makes the authenticated property website the primary KEMS mobile application surface.

The property website includes:

- a web app manifest with 192px, 512px and maskable PNG icons;
- standalone display mode on Android and iOS home-screen installs;
- mobile safe-area handling for notches and home indicators;
- a shared PWA bootstrap on Live Data, Compare, Full KEMS Agile, Cost & ROI and Settings;
- a service worker that caches only the application shell;
- explicit exclusion of `/api/*` from offline data caching so live KEMS/Home Assistant readings are never replaced by stale cached telemetry;
- Cloudflare Access redirect detection so an expired remote session is never cached as if it were a KEMS page or JavaScript asset;
- a visible **Sign in again** prompt when an authenticated property's API session expires;
- an Install KEMS action in Settings on browsers that expose the installation prompt.

## Local Pi versus installed app

The local Pi dashboard remains available at `http://kems-pi.local:4173`. Modern PWA installation and service-worker features require a secure context, so the normal installed-app path uses the authenticated HTTPS property hostname published through Cloudflare Access.

The installed PWA uses the same Raspberry Pi backend, same Home Assistant/KEMS source data and same dashboard code as the property website. There is no second mobile dashboard implementation to keep in sync.

## Android

On Android:

1. Open the authorised KEMS property HTTPS address in Chrome.
2. Complete Cloudflare Access sign-in if prompted.
3. Open **Settings → KEMS as a web app** and choose **Install KEMS**, or use Chrome's **Install app** action.
4. Launch KEMS from the Android home screen.

The installed app opens in standalone mode and retains the five primary property sections: Live, Compare, Agile, Cost and Settings.

## iPhone / iPad

On Safari:

1. Open the authorised KEMS property HTTPS address.
2. Complete Cloudflare Access sign-in if prompted.
3. Use **Share → Add to Home Screen**.
4. Launch KEMS from the home-screen icon.

Web.31 includes `viewport-fit=cover`, Apple installed-app metadata and safe-area padding so the fixed mobile navigation remains clear of the home indicator.

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

`KEMS-Android` 1.4.1 is now a frozen legacy companion implementation. It should remain available as a reference and fallback while Web.31 is proved on real phones, but new KEMS dashboard features should not be duplicated into Flutter.

After the PWA has passed real-device acceptance, the legacy Android repository can be archived. If a Play Store package is wanted later, prefer a small Trusted Web Activity/native wrapper around the verified KEMS PWA rather than rebuilding Live, Compare and Agile in Flutter.

A native layer should only be reintroduced for capabilities that genuinely require it, such as Android widgets, specialised background services, biometrics or device integrations that are not practical from the web platform.
