# KEMS Web multi-site Home Hub

KEMS Web 0.7.0-alpha5-web.6 keeps each property independent. A Site Identity contains a display name, site ID and future remote hostname such as `kyle.kems.co` or `mike.kems.co`. No central KEMS server stores another property's Home Assistant token.

## Home Assistant modes

- **External**: KEMS Web connects to an existing Home Assistant elsewhere on the LAN.
- **Built-in**: the KEMS Pi installs Docker Engine and the official `ghcr.io/home-assistant/home-assistant:stable` container with host networking and persistent `/var/lib/kems-homeassistant/config`.

Home Assistant Container is not Home Assistant OS and does not include the Apps/Add-on system. The Pi manager handles container lifecycle separately from KEMS Web updates.

After built-in HA finishes onboarding, create a Home Assistant long-lived access token and connect KEMS Web to `http://127.0.0.1:8123`.

## web.5 → web.6

Install web.6 normally from Settings → KEMS Pi server. The web.5 updater writes the new manager to disk but the old manager remains in memory until reboot. web.6 detects this and displays a Reboot Pi action. No SD-card reflash or SSH is required.
