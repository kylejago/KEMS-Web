# GitHub and headless Pi workflow — web.6

Repository: `kylejago/KEMS-Web` (public).

## Upgrade an existing web.5 appliance

1. Replace the repository contents with this web.6 package and push to `main`.
2. In **Actions → Publish KEMS Web release**, run the workflow with `0.7.0-alpha5-web.6`.
3. On the running Pi open **Settings → KEMS Pi server → Check now → Install update**.
4. When web.6 is installed it will detect that the web.5 Pi manager is still running in memory. Select **Reboot Pi** once.
5. After reboot, Settings exposes Site Identity and the optional Built-in Home Assistant controls.

No SD-card reflash or SSH is required for web.5 → web.6.

## New Pi

The existing headless image workflow can still create a fresh `KEMS-Pi-0.7.0-alpha5-web.6-headless.img.xz`. A fresh image boots headlessly, installs the current GitHub version, and then supports browser-managed updates.

## Release assets

The normal release workflow creates:

- `kems-web-0.7.0-alpha5-web.6-pi.tar.gz`
- `kems-web-0.7.0-alpha5-web.6-pi.tar.gz.sha256`
