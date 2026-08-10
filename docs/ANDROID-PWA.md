# Android and KEMS Web

KEMS Web is now PWA-ready. The website includes:

- a web app manifest;
- 192px, 512px and maskable Android icons;
- standalone display mode;
- a service worker that caches only the application shell;
- explicit exclusion of `/api/*` from the offline cache so live KEMS/HA data is never replaced by cached readings;
- an Install KEMS app action in Settings when the browser exposes the installation prompt.

## Local-only phase

The local Pi dashboard works normally at `http://kems-pi.local:4173`, but modern browser app-install/service-worker capabilities require a secure context. Therefore the full install-as-an-app experience is intended for the later HTTPS internet address.

## Once the public HTTPS address exists

On Android, opening KEMS in Chrome can offer **Install app**. The installed PWA launches from the Android home screen in standalone mode and uses the same Raspberry Pi backend, same Home Assistant connection, same data and same dashboard code.

This is the simplest way to avoid maintaining a second copy of the entire UI.

## Existing/native Android app

An APK cannot literally execute inside a web page. There are two good ways to unify it with KEMS Web later:

1. **PWA only** — use the installed website as the Android application.
2. **Trusted Web Activity wrapper** — keep a small Android package, but make its main content the verified KEMS PWA. This preserves an Android package/app-store path while the UI and most application logic are delivered by the website.

Native-only features can remain in a small Android layer if needed later, while the dashboard itself stays shared with the website.
