# Changelog

## 0.7.0-alpha5-web.3

- Added a zero-touch Raspberry Pi 4B image bootstrapper.
- Added a GitHub Actions workflow that builds a flashable `.img.xz` from the pinned official Raspberry Pi OS Lite 64-bit image.
- First boot now installs KEMS directly from the public `KEMS-Web` GitHub repository.
- No monitor, keyboard or SSH session is required for an Ethernet-connected Pi.
- The image contains no Home Assistant credentials and no universal Linux password.
- Normal website updates continue to use checksum-verified GitHub Release assets; SD-card reflashing is not required.

## 0.7.0-alpha5-web.3

- Added GitHub-first Raspberry Pi bootstrap installation via `install.sh`.
- Added a GitHub Release updater that includes alpha/prerelease builds.
- Added checksum verification, pre-switch validation, health checking and automatic rollback.
- Kept persistent HA credentials/history outside versioned website releases.
- Added `kems-status` and `kems-rollback` commands.
- Added GitHub Actions workflow to test and publish Raspberry Pi `.tar.gz` release assets and SHA-256 files from `web-v*` tags.
- Added PWA manifest icons, service worker, standalone app mode and browser install support.
- Explicitly excludes `/api/*` from PWA caching so live KEMS/Home Assistant readings remain network-only.
- Added an Android/PWA section in Settings.
- Updated cache-busting assets to `alpha5web2`.
- Retains the KEMS alpha5 four-view dashboard and native period-summary long-term accounting introduced in web.1.
