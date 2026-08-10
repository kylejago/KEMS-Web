# GitHub-first KEMS setup

Repository: `kylejago/KEMS-Web`

## Create the repository

Create a **Public** repository named `KEMS-Web`.

Leave these GitHub creation options **unticked**:

- Add a README file
- Add .gitignore
- Choose a license

This package already contains `README.md`, `.gitignore`, and an MIT `LICENSE`.
The default branch should be `main`.

Upload/commit the complete contents of this package to the repository root.

## Build the headless Pi image

After the first commit:

1. Open **Actions**.
2. Select **Build KEMS Pi headless image**.
3. Choose **Run workflow**.
4. Wait for the build to finish.
5. Download `KEMS-Pi-<version>-headless.img.xz` from the generated GitHub Release.
6. In Raspberry Pi Imager choose **Use custom** and select that `.img.xz` file.
7. Write it to the SD card.
8. Put the SD card in the Pi 4B, connect Ethernet and power it on.

The Pi needs no keyboard, monitor or SSH session. On first boot the embedded
bootstrapper downloads `main/install.sh` from GitHub and installs the current
KEMS website. It then reboots and serves KEMS at:

`http://kems-pi.local:4173`

The first installation can take several minutes because the Pi updates package
metadata and installs the current Node.js ARM64 runtime.

## Website release assets

Open **Actions** → **Publish KEMS Web release** and run it with the version from
`package.json`. The release workflow publishes the checksum-verified Pi website
archive used by `kems-update`.

## Future updates

The SD card image does not need rebuilding for normal website updates.
Publish a new KEMS Web GitHub Release, then run `sudo kems-update` on the Pi (or
use the web-based update UI when added). Persistent KEMS data remains under
`/var/lib/kems-web`.
