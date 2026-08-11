# KEMS Web on Raspberry Pi 4B

## Recommended appliance install

For a completely headless Pi, use the GitHub-built **KEMS Pi headless image** rather than a stock Raspberry Pi OS install.

1. Push the current KEMS-Web source to GitHub.
2. Run **Build KEMS Pi headless image** in GitHub Actions.
3. Download the `.img.xz` from the generated Pi-image release.
4. Select it in Raspberry Pi Imager with **Use custom**.
5. Flash the SD card.
6. Connect Ethernet and power on the Pi 4B.

The image contains Raspberry Pi OS Lite 64-bit, Node.js for the immediate first-boot status page, and the KEMS bootstrap. The actual current KEMS Web source is downloaded from `kylejago/KEMS-Web` on first boot.

Open:

```text
http://kems-pi.local:4173
```

During setup, that address shows installation progress and recent bootstrap log lines. When the real KEMS service passes its health check, it takes over port 4173 automatically.

## Persistent paths

Website releases:

```text
/opt/kems-web/releases/<version>
/opt/kems-web/current -> active release
```

Persistent website data:

```text
/var/lib/kems-web
```

Root Pi-management state/logs:

```text
/var/lib/kems-web-management
```

Home Assistant credentials/history are therefore separate from the release being upgraded or rolled back.

## Browser management (web.5+)

Open **Settings → KEMS Pi server** from the local KEMS address.

The page shows:

- KEMS service health
- Pi hostname/IP
- installed version
- latest GitHub release
- uptime
- memory/storage usage
- KEMS persistent-data size
- rollback availability
- maintenance progress

Available actions:

- Check now
- Install update
- View logs
- Backup
- Restore
- Rollback
- Restart KEMS
- Reboot Pi

The root management helper listens only on `127.0.0.1:4174`; it is not exposed to the LAN. The normal KEMS server proxies a very small allow-listed management API to it. Browser-facing system actions are additionally restricted to direct local `.local`/private-IP access and are rejected through forwarded/reverse-proxy requests.

## Update safety

The updater:

1. asks GitHub for the newest KEMS Web release;
2. downloads the Pi `.tar.gz` and matching `.sha256`;
3. verifies SHA-256;
4. extracts into a new version directory;
5. syntax-checks and smoke-tests it;
6. switches `/opt/kems-web/current` atomically;
7. restarts KEMS;
8. runs a local health check;
9. automatically rolls back if the new release does not become healthy.

The old CLI commands remain:

```bash
sudo kems-update
sudo kems-rollback
kems-status
```

## Encrypted backup

**Settings → KEMS Pi server → Backup** creates a `.kemsbackup` file. It contains only KEMS Web persistent data and is encrypted with the password entered in the browser.

Restore validates and decrypts the file, atomically replaces the stored website data and restarts the KEMS Web service. It does not write to Home Assistant.

## Manual stock-OS recovery install

If SSH is ever deliberately enabled on a recovery Pi, KEMS can still be installed on Raspberry Pi OS Lite 64-bit with:

```bash
curl -fsSL https://raw.githubusercontent.com/kylejago/KEMS-Web/main/install.sh | sudo bash
```

## Multi-site and optional built-in Home Assistant (web.6)

Settings now contains **Site identity** and **Home Assistant** mode. Existing installations should use **Existing Home Assistant**. A new property can select **Host on this KEMS Pi** and install the official Home Assistant Container through the local-only Pi manager.

The local Home Assistant configuration is stored outside KEMS Web releases at `/var/lib/kems-homeassistant/config`. The container uses host networking and is available on port 8123. After normal Home Assistant onboarding, create a long-lived access token and connect KEMS Web to `http://127.0.0.1:8123`.

Home Assistant Container is distinct from Home Assistant OS and does not include the Apps/Add-on system.
