# Changelog

## 0.7.0-alpha5-web.6 — Multi-site Home Hub foundation

- Adds per-property Site Identity: site name, slug/site ID and future `*.kems.co` hostname.
- Adds External Home Assistant vs Built-in Home Assistant mode.
- Adds browser-driven installation of official Home Assistant Container and Docker Engine on the KEMS Pi.
- Adds Home Assistant Container start/stop/restart/update/status and logs to the headless appliance manager.
- Keeps all privileged Home Assistant and Pi controls local-LAN-only.
- Adds per-site PWA manifest identity.
- Includes site identity in encrypted KEMS Web backups.
- Detects the web.5 → web.6 manager-version transition and asks for one browser-triggered reboot to activate the new manager.
- Retains alpha5 historical policy changes rather than rewriting earlier simulated decisions.
- Retains period-chart baseline filtering introduced in web.5.


## 0.7.0-alpha5-web.5

### Browser-managed Raspberry Pi appliance

- Adds a local-only KEMS Pi management panel under Settings for appliance health, Pi uptime, memory/storage, installed/latest GitHub release, persistent-data size and rollback availability.
- Adds browser actions for Check for update, Install update, manual rollback, Restart KEMS Web and Reboot Pi.
- Adds a root-owned management helper bound only to `127.0.0.1:4174`; the public KEMS process proxies a small allow-listed API rather than gaining root privileges itself.
- Blocks Pi administration routes when the request is arriving through forwarded/reverse-proxy headers or a non-local host, keeping future internet-facing KEMS access separate from appliance administration by default.
- Extends the checksum-verified GitHub updater with progress reporting, health checking, automatic rollback and safe self-replacement of updater/helper files.
- Includes `deploy/` in GitHub release assets so later releases can update the appliance helper without another SD-card reflash.

### Encrypted backup and recovery

- Adds password-protected browser backup and restore for KEMS Web persistent configuration/history.
- Backups are gzip-compressed and encrypted with AES-256-GCM using a key derived with scrypt; Home Assistant credentials are never exported as plaintext.
- Restore validates the archive and only permits the known KEMS persistent-data files before writing them atomically.

### Dashboard history refinements

- Adds policy-change markers to simulated and comparison charts for changes such as export-tariff status, no-export mode and simulation strategy. Historical simulation is preserved rather than retrospectively rewritten when policy changes later in the day.
- Keeps long-term-statistics baseline buckets for calculations but clips displayed Week/Month/Year/All-time chart data to the native KEMS period dates, preventing prior-month baseline days appearing in the selected period.

### Migration note

- An existing completely headless web.4 Pi has no privileged management helper and no SSH/admin path. Installing web.5 therefore requires one final SD-card reflash with the web.5 headless image. After web.5, normal website releases can be installed and rolled back from the browser without reflashing.

### Validation

- `npm test` passes the setup smoke suite, the 236-entity KEMS alpha5 fixture, native Day/Week/Month/Year/All-time period checks, policy marker checks, encrypted backup/restore checks and Pi deployment checks.
- Shell deployment scripts pass `bash -n` syntax validation.

## 0.7.0-alpha5-web.4

### Resilient headless Raspberry Pi bootstrap

- Adds an immediate first-boot setup/status page on port 4173.
- Pre-bakes the verified Node.js 22 ARM64 runtime into the Pi image so the status page does not depend on apt or GitHub.
- Shows setup stage, progress, IP address and the tail of the first-boot diagnostic log.
- Keeps retrying failed first-boot installs automatically and leaves the diagnostic page available when an error occurs.
- Removes the fragile `After=cloud-final.service` dependency; cloud-init completion is waited for inside the bootstrap with a bounded timeout instead.
- Uses a stable non-login `kemsweb` service account and a predictable `/var/lib/kems-web` persistent data directory rather than combining a pre-created data path with systemd `DynamicUser=StateDirectory=` handling.
- Hands port 4173 from the setup-status service to KEMS only when the real application is ready to start.

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
