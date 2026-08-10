# KEMS Web — 0.7.0-alpha5-web.4

Focused local companion website for **KEMS 0.7.0-alpha5**.

The dashboard remains read-only: Home Assistant/KEMS is the source of truth and the website does not call Home Assistant services.

## Main views

- Live Today
- Simulated Today
- Live vs Simulated
- Performance & ROI — Day / Week / Month / Year / All time

KEMS alpha5 native period summaries are used for long-term headline values, with recorder/statistics history used for chart detail.


## Zero-touch Raspberry Pi image

This release includes `image/` plus the **Build KEMS Pi headless image** GitHub
Actions workflow. The generated `.img.xz` can be selected directly with
Raspberry Pi Imager. With Ethernet connected, the Pi needs no monitor, keyboard
or SSH session: first boot downloads this repository's `install.sh`, installs
KEMS, enables the service and reboots.

See [GITHUB-FIRST-SETUP.md](GITHUB-FIRST-SETUP.md).

During first boot, port `4173` is available as a setup-status page almost immediately after networking comes up. It shows the current installation stage and diagnostic log. When KEMS passes its health check, the setup page is stopped and the normal dashboard takes over the same port.

## Raspberry Pi: one-command GitHub install

After flashing Raspberry Pi OS Lite 64-bit and enabling SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/kylejago/KEMS-Web/main/install.sh | sudo bash
```

Then open:

```text
http://kems-pi.local:4173
```

Enter the Home Assistant address and long-lived access token on first use.

See [docs/RASPBERRY-PI.md](docs/RASPBERRY-PI.md) for full details.

## Updates

```bash
sudo kems-update
```

The updater discovers the newest GitHub Release (including alpha/prerelease builds), downloads the Pi archive and its SHA-256 file, verifies and tests it, then switches versions atomically. A failed health check rolls back automatically.

```bash
kems-status
sudo kems-rollback
```

Persistent data is stored in `/var/lib/kems-web`, outside all versioned release folders.

## Android / installable website

This version is PWA-ready. When KEMS is later served from an HTTPS address, Android can install the website as an app from the browser. The installed app uses the same Pi backend and the same KEMS/Home Assistant data.

See [docs/ANDROID-PWA.md](docs/ANDROID-PWA.md).

## Windows local use

Windows launchers remain included:

- `start-kems.cmd`
- `start-kems.ps1`

Node.js 22 or newer is required.

## Development

```bash
npm test
npm start
```

Default port: `4173`.
