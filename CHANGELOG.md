# Changelog

## 0.8.0-alpha8-web.9

- Re-publishes the proven Web.8 HA-parity payload under a new appliance version so Pis already reporting Web.8 receive a real `.8 → .9` update transition instead of being treated as already current.
- Advances the PWA service-worker shell cache to `kems-web-shell-build4`, forcing installed/browser clients to discard the previous shell cache and refetch the current property assets after the Pi update.
- Preserves the Web.8 full-day Agile table, rebased SOC, exact route labels, truthful NO DATA gaps and delayed public evidence unchanged.
- Read-only redeployment release; no Home Assistant optimiser, settlement, control or hardware-write logic changes.

## 0.8.0-alpha8-web.8

- Catch Pi Web up with the HA Alpha8.48–Alpha8.54 presentation contract: one full-day Agile table, canonical rebased estimated SOC, exact mixed-route labels, and truthful NO DATA runtime gaps.
- Keep Today export accounting on canonical elapsed-solar plus completed-settled-battery evidence.
- Extend the public demo with privacy-delayed, allow-listed half-hour KEMS routing evidence while keeping live power, device/entity identifiers, credentials and control endpoints private.
- Share exact route-label and runtime-gap presentation rules between Pi Web and the delayed public feed.
- Read-only presentation/data-publication release; no Home Assistant service calls or hardware control writes.

## 0.8.0-alpha8-web.1 — Release-independent KEMS product identity

- Keeps the product and user-facing identity simply **KEMS / KEMS Web** while retaining `0.8.0-alpha8-web.1` only as release metadata.
- Removes stale `KEMS Alpha7.40`, `Alpha7 shadow chain`, `alpha7web*` and `alpha8web*` wording from live property/public UI and cache identities.
- Uses neutral property/PWA cache identity `build1` and neutral public-site cache identity `site1`.
- Preserves the existing Home Assistant entity/API contract, Full KEMS Agile presentation, Cloudflare-authenticated PWA install path, seven-day public-demo privacy boundary and read-only property behavior.
- Adds a canonical product-identity regression so future Alpha, Beta, RC and stable releases cannot leak lifecycle/version names back into live product/cache naming.
- Historical regression filenames and release history remain unchanged evidence rather than being renamed or rewritten.

## 0.7.0-alpha7-web.14 — Four-product parity, delayed demo and remote-access foundation

- Aligns the property dashboard and public site to the canonical user-facing KEMS product model: **Live Data**, **Battery & Solar**, **Full KEMS**, and **Full KEMS Agile**.
- Adds a dedicated property Products page and updates navigation, PWA shortcuts, comparison labels and the Agile workspace naming.
- Replaces the temporary K/lightning web mark with the shared KEMS energy-system brand icon used across property and public surfaces.
- Adds the `kems.uk` **See KEMS in action** experience with a strict minimum seven-day privacy delay and an allow-listed sanitiser for daily totals.
- Adds Day / Week / Month / Year / All published evidence controls to the public demo while excluding precise live power, entity IDs, device identifiers, credentials and control endpoints.
- Adds a public Property login entry point that deliberately accepts no credentials until the authenticated gateway exists.
- Documents the target remote path as account → property → authenticated gateway → outbound Pi tunnel → read-only property dashboard, with Pi administration and Home Assistant control remaining LAN-only.
- Adds Web.14 contract regression checks for product labels, brand consistency, delayed-demo safety and the existing forwarded-request Pi-management guard.
- No public-site deployment, Pi release or remote tunnel is activated by this branch alone.

## 0.7.0-alpha6-web.11 — Reliable appliance activation state

- Fixes the stale “Reboot required” banner after KEMS Web updates by capturing the active appliance version when the Pi manager process starts instead of keeping a release-specific hard-coded manager version.
- Preserves the activation check across future updates: the old manager process keeps reporting the version it started on until the service restarts, then the new manager reports the newly active website version.
- Keeps coordinated Pi downgrade protection introduced in web.10 unchanged.
- Prepared for the first fully automatic coordinated Pi website update test.

## 0.7.0-alpha6-web.9 — Pi coordinated-update bootstrap repair

- Adds a browser-deliverable repair release for Pis where web.8 was installed by the previous updater before the coordinated bundle-agent service existed on the appliance.
- Makes `kems-update` refresh deployment helpers and systemd service definitions even when the requested website version is already installed, so future helper/service repairs do not require SSH or an SD-card reflash.
- Ensures the verified release can install and enable `kems-web-bundle-agent.service` from the normal browser update path.
- Keeps the existing checksum verification, smoke test, health check and automatic rollback protections unchanged.

## 0.7.0-alpha6-web.7 — Compare scenarios

- Added a dedicated **Compare scenarios** page driven directly by KEMS 0.7.0-alpha6 parallel replay entities.
- Compares **No system**, **Solar only**, **Solar + battery**, **KEMS no-export**, and **Full KEMS** against the same retained demand/tariff observations.
- Added Today / Yesterday / 7 days / 30 days period controls, cheapest-scenario highlighting and replay coverage.
- Added five scenario cost cards, the full cumulative-cost timeline for Today, grid import/export comparison, cheap/day-rate import comparison and a detailed energy/cost table.
- Added selectable per-scenario saving decomposition and solar/battery/grid routing detail.
- The new page is strictly read-only: comparison replay never changes the active KEMS operating strategy.
- Preserves the existing Live vs simulated page as a separate physical-vs-modelled comparison.
- Adds an alpha6 scenario API and regression test while retaining alpha5 compatibility if scenario entities are not present.

## 0.7.0-alpha5-web.6.1 — Pi updater smoke-test hotfix

- Isolates the release smoke test from the live appliance manager on port 4174.
- Fixes web.5 → web.6 updates failing validation on a real Pi even though the release itself is healthy.
- No dashboard, Home Assistant, site identity or stored-data behaviour is changed from web.6.

# Changelog

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
