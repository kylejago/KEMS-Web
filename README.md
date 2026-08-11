# KEMS Web — 0.7.0-alpha5-web.5

Focused local companion website for **KEMS 0.7.0-alpha5**.

Home Assistant/KEMS remains the source of truth. The energy dashboard does not call Home Assistant services and keeps live, observed, simulated and calculated data visibly separate.

## Main views

- Live Today
- Simulated Today
- Live vs Simulated
- Performance & ROI — Day / Week / Month / Year / All time

KEMS alpha5 native period summaries are authoritative for long-term headline values. Home Assistant recorder/statistics history supplies chart detail when available.

## web.5 — Raspberry Pi appliance management

When installed through the KEMS headless Pi image, **Settings → KEMS Pi server** now provides local browser management for the appliance:

- Pi/KEMS health and IP address
- installed and latest GitHub release versions
- Pi uptime, memory and storage usage
- KEMS persistent-data size
- Check for update / Install update
- update progress and result
- automatic health-check rollback remains in the updater
- manual rollback to the prior release
- restart KEMS Web
- reboot the Pi
- recent KEMS/manager/update logs
- password-encrypted backup download
- password-encrypted backup restore

System-control endpoints are intentionally available only when KEMS is opened directly using a local address such as `http://kems-pi.local:4173` or a private LAN IP. Requests arriving through a future reverse proxy/Cloudflare hostname are blocked from Pi-management actions by default.

Persistent website data remains under `/var/lib/kems-web`, outside versioned releases.

## Policy history and period-chart repair

The simulated and comparison power charts can now mark Home Assistant-recorded changes to:

- export tariff status
- no-export policy
- simulation strategy

This preserves the historical simulation that actually ran during the day while making a later policy change visible rather than retrospectively rewriting the graph.

Week/Month/Year/All-time chart buckets are now clipped to the **native alpha5 period start/end dates**. Baseline values used internally for cumulative-statistic calculations are no longer shown outside the selected period.

## Zero-touch Raspberry Pi image

The repository contains the **Build KEMS Pi headless image** GitHub Actions workflow. The generated `.img.xz` can be flashed directly with Raspberry Pi Imager.

With Ethernet connected, the Pi needs no monitor, keyboard or SSH session. Port `4173` first shows the setup-status page; once installation is healthy, the normal KEMS dashboard takes over that same address:

```text
http://kems-pi.local:4173
```

See [GITHUB-FIRST-SETUP.md](GITHUB-FIRST-SETUP.md) and [docs/RASPBERRY-PI.md](docs/RASPBERRY-PI.md).

## GitHub updates

Published website releases are checksum-verified GitHub Release assets. The Pi downloads, syntax-checks and smoke-tests a new release, switches atomically, restarts KEMS and health-checks the result. If the health check fails, it automatically returns to the previous release.

From web.5 onward the normal route is simply:

**Settings → KEMS Pi server → Check now → Install update**

The command-line tools remain available for recovery:

```bash
sudo kems-update
sudo kems-rollback
kems-status
```

## Encrypted backup / restore

A KEMS Web backup includes only the Pi website's persistent files (saved HA connection, its local encryption key, website ledger and retained power history). The backup is compressed and encrypted with **AES-256-GCM**, using a key derived from the password you enter with `scrypt`.

The backup never modifies or backs up Home Assistant itself. Keep the backup password somewhere safe; it is not stored by KEMS.

## Android / installable website

KEMS remains PWA-ready. When it is later served over HTTPS, Android can install the website as an app. The installed app uses the same Raspberry Pi backend and the same Home Assistant/KEMS data.

See [docs/ANDROID-PWA.md](docs/ANDROID-PWA.md).

## Windows local use

Windows launchers remain included:

- `start-kems.cmd`
- `start-kems.ps1`

Node.js 22 or newer is required. Pi-management controls will show as unavailable on a normal Windows installation, while the energy dashboard continues to work normally.

## Development

```bash
npm test
npm start
```

Default dashboard port: `4173`.
