# KEMS Pi zero-touch image

This image layer turns the official Raspberry Pi OS Lite 64-bit image into a
headless KEMS appliance.

On first boot it:

1. waits for internet access;
2. downloads `install.sh` from `kylejago/KEMS-Web` on GitHub;
3. installs the current KEMS Web build and Node.js runtime;
4. enables the `kems-web` service;
5. disables the one-time bootstrapper;
6. reboots;
7. serves KEMS at `http://kems-pi.local:4173`.

For genuine zero-touch first boot, connect Ethernet before applying power.
Wi-Fi-only installs can use Raspberry Pi Imager OS customisation/cloud-init to
supply Wi-Fi credentials if available for the selected custom image.

No Home Assistant address or token is stored in the image or GitHub. Enter
those through the KEMS first-run web page.
