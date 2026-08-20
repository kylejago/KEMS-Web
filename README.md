<p align="center">
  <img src="public/brand-lockup.svg" alt="KEMS — Kyle Energy Management System" width="520">
</p>

# KEMS Web — 0.7.0-alpha7-web.18

KEMS Web is the read-only property companion and public-site source for the **KEMS Alpha7** platform.

Home Assistant/KEMS remains the source of truth for each property. The property dashboard displays live, observed, simulated, shadow and calculated data but does not call Home Assistant services. The public `kems.uk` site is a separate static build and receives no Home Assistant credentials or household telemetry.

## Exact approved KEMS brand

KEMS Web.18 no longer treats a redrawn SVG as the master logo. The visual source of truth is the exact approved KEMS PNG in the KEMS core repository:

```text
docs/assets/kems_full_brand_concept.png
```

Web.18 verifies that image as **2,156,120 bytes** with SHA-256 `67ad8c3ee349a35de23f5a9040ce27c18b5cf347454f777cf1f55a6f905eb01f` before tests, release packaging and `kems.uk` deployment. `brand-lockup.svg` and `logo.svg` contain no redrawn KEMS artwork: they are mechanical crop wrappers around the verified approved PNG.

The exact approved image is used across property headers, loading states, Remote Access setup, `kems.uk`, demo/login/privacy/404 pages and Pi first-boot setup. Web.18 advances the PWA cache so older Web.17 artwork cannot remain pinned.

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

### Web.17 bootstrap repair retained

Some Pis first reached Web.16 using the older Web.15 updater. Web.17 repaired that transition by converging the missing `kems-web-remote-access.service` and verifying `http://127.0.0.1:4175/health`. Web.18 retains that loopback-only helper and security boundary unchanged while aligning its reported helper version with the appliance release.

Pi-management routes reject forwarded/reverse-proxy requests by design. Internet-facing property access is a separate Cloudflare Access + outbound Tunnel boundary rather than an exposed local management interface.

Published Web releases are checksum-verified. The Pi stages a release, runs syntax/smoke checks, switches atomically, activates changed appliance helper/service definitions, health-checks both the property web and required local helper services, and can roll back the website if activation fails.

## kems.uk public website

The static source is under:

```text
public-site/
```

It is deliberately independent of the private property backend. Deployment synchronises and SHA-verifies the exact approved KEMS artwork before uploading the static site to IONOS.

The public site must never contain a Home Assistant URL, long-lived token, household telemetry API or property-control endpoint. Regression tests enforce this boundary.

## PWA / Android

The property dashboard remains installable as a PWA when served over HTTPS. Its product, comparison, Agile and Remote Access pages are in the Alpha7 application shell. The PWA uses the same property backend; it does not turn the public `kems.uk` website into a remote Home Assistant proxy.

## Windows local use

Windows launchers remain included:

- `start-kems.cmd`
- `start-kems.ps1`

Node.js 22 or newer is required. Pi-management controls show as unavailable on a normal Windows installation while the energy dashboard remains usable.

## Validation

```bash
npm test
```

The suite checks syntax, exact approved artwork identity, fresh setup through the production gateway, legacy fixture compatibility, live Home Assistant separation, Alpha7 Agile contract, comparison/ROI, helper-bootstrap convergence, PWA routing, public/private isolation and Pi deployment behavior.

## Related documentation

- `public-site/README.md` — public `kems.uk` deployment boundary
- `docs/RASPBERRY-PI.md` — appliance installation
- `docs/UPDATES.md` — website update path
- `docs/REMOTE-ACCESS.md` — Cloudflare Access/Tunnel boundary and local setup flow
- `docs/ANDROID-PWA.md` — installable property dashboard
- `docs/MULTI-SITE-HOME-HUB.md` — multi-property direction
