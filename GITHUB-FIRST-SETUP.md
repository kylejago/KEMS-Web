# GitHub-first KEMS setup

Repository: `kylejago/KEMS-Web`

## Repository

Use the existing **Public** `KEMS-Web` repository. The package includes its own README, `.gitignore` and MIT licence.

Copy the contents of the web.5 package into the repository root, commit and push.

## Publish the web.5 website release

1. Open **Actions**.
2. Select **Publish KEMS Web release**.
3. Choose **Run workflow**.
4. Enter `0.7.0-alpha5-web.5`.
5. Run the workflow.

The workflow tests the complete site and publishes:

- `kems-web-0.7.0-alpha5-web.5-pi.tar.gz`
- `kems-web-0.7.0-alpha5-web.5-pi.tar.gz.sha256`

These are what the browser/CLI updater uses for future installs.

## Build the web.5 headless Pi image

The web.5 management helper requires one privileged appliance component that did not exist in the already-flashed web.4 image. For a Pi that has no SSH/admin login, **web.5 is the one final SD-card reflash**. After web.5 is installed, normal website releases are updated from the browser and the SD card should not need reflashing.

After pushing web.5:

1. Open **Actions** → **Build KEMS Pi headless image**.
2. Run the workflow if it has not already started automatically.
3. Wait for it to finish.
4. Open the generated GitHub Release `pi-image-v0.7.0-alpha5-web.5`.
5. Download `KEMS-Pi-0.7.0-alpha5-web.5-headless.img.xz`.
6. In Raspberry Pi Imager choose **Use custom** and select the `.img.xz`.
7. Write it to the SD card.
8. Insert the card, connect Ethernet and power on the Pi.

No keyboard, monitor or SSH session is needed. Open:

```text
http://kems-pi.local:4173
```

The first-boot status page shows progress. When setup completes it becomes the normal KEMS dashboard.

## First KEMS connection

Enter the Home Assistant URL reachable from the Pi and the long-lived access token in the KEMS connection page. Those credentials are stored on the Pi, not in GitHub or in the SD-card image.

## Future updates — browser only

After web.5:

1. publish the next GitHub KEMS Web release;
2. open KEMS locally;
3. open **Settings → KEMS Pi server**;
4. choose **Check now**;
5. choose **Install update**.

KEMS downloads the release and SHA-256 checksum, tests it, switches atomically and rolls back automatically if the new version does not become healthy.

Persistent connection/history data under `/var/lib/kems-web` is not replaced by updates or rollbacks.
