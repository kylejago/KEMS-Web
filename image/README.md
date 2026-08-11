# KEMS Pi zero-touch image

This image layer turns the official Raspberry Pi OS Lite 64-bit image into a completely headless KEMS appliance.

On first boot it:

1. starts a KEMS setup/status page on port `4173`;
2. waits for Ethernet/DNS/internet;
3. downloads `install.sh` from `kylejago/KEMS-Web`;
4. installs the current KEMS Web build and Pi management helper;
5. enables the KEMS and manager services;
6. disables the one-time bootstrapper;
7. reboots;
8. serves KEMS at `http://kems-pi.local:4173`.

For genuine zero-touch first boot, connect Ethernet before applying power.

No Home Assistant address or token is stored in the image or GitHub. Enter those through the KEMS first-run web page.

From web.5 onward normal website updates are performed through **Settings → KEMS Pi server** and do not require another SD-card image.
