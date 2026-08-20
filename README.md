<p align="center">
  <img src="public/brand-lockup.svg" alt="KEMS — Kyle Energy Management System" width="520">
</p>

# KEMS Web — 0.7.0-alpha7-web.17

KEMS Web is the read-only property companion and public-site source for the **KEMS Alpha7** platform.

Home Assistant/KEMS remains the source of truth for each property. The property dashboard displays live, observed, simulated, shadow and calculated data but does not call Home Assistant services. The public `kems.uk` site is a separate static build and receives no Home Assistant credentials or household telemetry.

## Canonical KEMS brand

`public/brand-lockup.svg` and `public-site/brand-lockup.svg` are byte-identical Web copies of the canonical KEMS energy-system lockup defined in the KEMS repository. Web.17 forces a fresh brand/PWA cache and uses that full lockup for property headers, loading states, Remote Access setup, `kems.uk`, demo/login/privacy/404 pages and Pi first-boot setup. The compact square `logo.svg` remains a deliberate derivative only for favicons, PWA icons and similarly constrained square slots.

## Property dashboard

The local/Pi application provides:

- **Live Data**
- **Battery & Solar**
- **Full KEMS**
- **Full KEMS Agile** — current rate, optimiser dispatch, live house demand, digital-twin routing, price-horizon qualification, selected export slots, independent safety and non-zero proof
- Compare
- History & scenarios
- Cost & ROI — Day / Week / Month / Year / All time
- KEMS Pi health, coordinated update controls, backup/restore and optional Home Assistant Container management
- Local browser-managed Cloudflare Tunnel provisioning without SSH

KEMS native period summaries remain authoritative for long-term headline values. Home Assistant Recorder/statistics history supplies chart detail when available.

## Alpha7 Agile boundary

The Agile page is read-only. It reports KEMS' existing shadow entities and never creates a FoxESS write path. Real control remains governed by the Home Assistant KEMS integration and its commissioning/safety gates.

The Web regression suite requires the Alpha7 page to retain the current horizon, routing, 13/13 safety and hardware-write-block evidence.

## Raspberry Pi appliance

A KEMS Pi keeps persistent property configuration/history outside versioned releases under `/var/lib/kems-web`.

Local browser management is available only when the dashboard is opened directly over the LAN, for example:

```text
http://kems-pi.local:4173
```

The same-origin gateway owns port `4173`. The normal KEMS application runs behind it on loopback, while the privileged Cloudflare setup helper is a separate root-owned service on `127.0.0.1:4175`. Only the allow-listed `/api/remote-access/*` setup routes can reach that helper, and those routes reject Cloudflare/forwarded requests. Browsers never connect directly to the privileged port.

### Web.17 bootstrap repair

Some Pis first reached Web.16 using the older Web.15 updater. That updater could switch the website to Web.16 but did not yet know how to install Web.16's newly introduced `kems-web-remote-access.service`, leaving the new same-origin gateway correctly running while `127.0.0.1:4175` refused connections.

Web.17 deliberately uses the now-installed newer updater to converge that missing helper/service through the normal browser update path. The updater installs and restarts the loopback-only helper, polls `http://127.0.0.1:4175/health`, and refuses to report successful helper activation if that health check fails. Fresh installs perform the same helper health check. No SSH or Pi reflash is required.

Pi-management routes reject forwarded/reverse-proxy requests by design. Internet-facing property access is a separate Cloudflare Access + outbound Tunnel boundary rather than an exposed local management interface.

Published Web releases are checksum-verified. The Pi stages a release, runs syntax/smoke checks, switches atomically, activates changed appliance helper/service definitions, health-checks both the property web and required local helper services, and can roll back the website if activation fails.

## kems.uk public website

The static source is under:

```text
public-site/
```

It is deliberately independent of the private property backend. The visible public-site brand uses the same canonical KEMS lockup as the property appliance.

Recommended IONOS deployment:

1. Connect IONOS Deploy Now to `kylejago/KEMS-Web`.
2. Use `main` as the production branch.
3. Configure `public-site` as the static output/publish folder.
4. No application build command is required.
5. Assign the production deployment to `kems.uk`.

SFTP upload of the **contents** of `public-site/` to the `kems.uk` webspace is also supported as a manual fallback.

The public site must never contain a Home Assistant URL, long-lived token, household telemetry API or property-control endpoint. Regression tests enforce this boundary.

## PWA / Android

The property dashboard remains installable as a PWA when served over HTTPS. Its product, comparison, Agile and Remote Access pages are in the Alpha7 application shell. Web.17 advances the application-shell cache so old Web.16 header/loading artwork cannot remain pinned after the update. The PWA uses the same property backend; it does not turn the public `kems.uk` website into a remote Home Assistant proxy.

## Windows local use

Windows launchers remain included:

- `start-kems.cmd`
- `start-kems.ps1`

Node.js 22 or newer is required. Pi-management controls show as unavailable on a normal Windows installation while the energy dashboard remains usable.

## Validation

```bash
npm test
```

The suite checks syntax, fresh setup through the production gateway, legacy fixture compatibility, live Home Assistant separation, Alpha7 Agile contract, comparison/ROI, canonical branding, Web.17 helper-bootstrap convergence, PWA routing, public/private isolation and Pi deployment behavior.

## Related documentation

- `public-site/README.md` — public `kems.uk` deployment boundary
- `docs/RASPBERRY-PI.md` — appliance installation
- `docs/UPDATES.md` — website update path
- `docs/REMOTE-ACCESS.md` — Cloudflare Access/Tunnel boundary and local setup flow
- `docs/ANDROID-PWA.md` — installable property dashboard
- `docs/MULTI-SITE-HOME-HUB.md` — multi-property direction
