# GitHub-first KEMS setup

Repository: `kylejago/KEMS-Web`

## Repository

Use the existing **Public** `KEMS-Web` repository. The package includes its own README, `.gitignore` and MIT licence.

Copy the contents of the GitHub-ready package into the repository root, commit and push.

## Publish the web.7 website release

1. Open **Actions**.
2. Select **Publish KEMS Web release**.
3. Choose **Run workflow**.
4. Enter `0.7.0-alpha6-web.7`.
5. Run the workflow.

The workflow tests the complete site and publishes:

- `kems-web-0.7.0-alpha6-web.7-pi.tar.gz`
- `kems-web-0.7.0-alpha6-web.7-pi.tar.gz.sha256`

These are what the browser/CLI updater uses for future installs.

## Headless Pi image (new installations only)

Existing web.5+ appliances update to web.7 from the browser and do not need reflashing. Build the headless Pi image only for a new installation or disaster recovery.

For a fresh Pi image after pushing web.7:

1. Open **Actions** → **Build KEMS Pi headless image**.
2. Run the workflow if it has not already started automatically.
3. Wait for it to finish.
4. Open the generated GitHub Release `pi-image-v0.7.0-alpha6-web.7`.
5. Download `KEMS-Pi-0.7.0-alpha6-web.7-headless.img.xz`.
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

On an existing web.5+ appliance:

1. publish the next GitHub KEMS Web release;
2. open KEMS locally;
3. open **Settings → KEMS Pi server**;
4. choose **Check now**;
5. choose **Install update**.

KEMS downloads the release and SHA-256 checksum, tests it, switches atomically and rolls back automatically if the new version does not become healthy.

Persistent connection/history data under `/var/lib/kems-web` is not replaced by updates or rollbacks.
