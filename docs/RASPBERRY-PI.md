# KEMS Web on Raspberry Pi 4B

## Recommended first install

Use the standard Raspberry Pi Imager rather than a custom KEMS operating-system image. Flash **Raspberry Pi OS Lite (64-bit)** and use Imager's customisation page to configure:

- hostname (recommended: `kems-pi`)
- your normal Linux username/password
- Wi-Fi, if Ethernet will not be used
- SSH

After first boot, connect with SSH and run one command:

```bash
curl -fsSL https://raw.githubusercontent.com/kylejago/KEMS-Web/main/install.sh | sudo bash
```

The installer:

1. checks for 64-bit ARM Raspberry Pi OS;
2. installs the current official Node.js 22 ARM64 runtime and verifies its SHA-256 checksum;
3. downloads the KEMS Web repository from GitHub;
4. installs KEMS under `/opt/kems-web/releases/<version>`;
5. stores all persistent configuration/history separately in `/var/lib/kems-web`;
6. enables the `kems-web` systemd service;
7. enables `.local` hostname discovery using Avahi;
8. starts the dashboard on port `4173`.

Open:

```text
http://kems-pi.local:4173
```

On the first visit, enter the Home Assistant URL reachable from the Pi (normally the local HA address) and a long-lived access token.

## Updating

Published website releases are GitHub Release assets. The Pi asks GitHub for the newest published KEMS Web release, downloads the `.tar.gz` and matching `.sha256`, verifies it, syntax-checks and smoke-tests it, installs it next to the current release, and only then switches the `current` symlink.

```bash
sudo kems-update
```

If the new version fails the local health check, KEMS automatically returns to the prior version.

Manual rollback:

```bash
sudo kems-rollback
```

Status:

```bash
kems-status
```

Persistent data is not stored inside release folders, so updates and rollbacks do not replace the Home Assistant token, KEMS local history, or local ledger.

## Publishing a new release

1. Update `package.json` and `config/project.json` to the new website version.
2. Commit and push the code.
3. Tag the matching version, for example:

```bash
git tag web-v0.7.0-alpha5-web.3
git push origin web-v0.7.0-alpha5-web.3
```

The included GitHub Actions workflow runs the tests, creates a Raspberry Pi release archive plus SHA-256 file, and publishes both as a GitHub Release.

After that, every installed Pi can update with `sudo kems-update`.
