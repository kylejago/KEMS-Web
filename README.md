# KEMS Web — 0.7.0-alpha7-web.13

KEMS Web is the read-only property companion and public-site source for the **KEMS Alpha7** platform.

Home Assistant/KEMS remains the source of truth for each property. The property dashboard displays live, observed, simulated, shadow and calculated data but does not call Home Assistant services. The public `kems.uk` site is a separate static build and receives no Home Assistant credentials or household telemetry.

## Property dashboard

The local/Pi application provides:

- Live today
- Simulated today
- **Agile Smart Export** — current rate, optimiser dispatch, live house demand, digital-twin routing, price-horizon qualification, selected export slots, independent safety and non-zero proof
- Actual vs KEMS
- Compare scenarios
- Performance & ROI — Day / Week / Month / Year / All time
- KEMS Pi health, coordinated update controls, backup/restore and optional Home Assistant Container management

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

Pi-management routes reject forwarded/reverse-proxy requests by design. A future internet-facing property login is a separate authenticated security boundary rather than an exposed local management interface.

Published Web releases are checksum-verified. The Pi stages a release, runs syntax/smoke checks, switches atomically, restarts, health-checks, and can roll back automatically if activation fails.

## kems.uk public website

The static source is under:

```text
public-site/
```

It is deliberately independent of `server.mjs` and the private property dashboard.

Recommended IONOS deployment:

1. Connect IONOS Deploy Now to `kylejago/KEMS-Web`.
2. Use `main` as the production branch.
3. Configure `public-site` as the static output/publish folder.
4. No application build command is required.
5. Assign the production deployment to `kems.uk`.

SFTP upload of the **contents** of `public-site/` to the `kems.uk` webspace is also supported as a manual fallback.

The public site must never contain a Home Assistant URL, long-lived token, household telemetry API or property-control endpoint. `scripts/kems-alpha7-agile-web-test.mjs` enforces this boundary.

## PWA / Android

The property dashboard remains installable as a PWA when served over HTTPS. Its Agile page is included in the Alpha7 application shell. The PWA uses the same property backend; it does not turn the public `kems.uk` website into a remote Home Assistant proxy.

## Windows local use

Windows launchers remain included:

- `start-kems.cmd`
- `start-kems.ps1`

Node.js 22 or newer is required. Pi-management controls show as unavailable on a normal Windows installation while the energy dashboard remains usable.

## Validation

```bash
npm test
```

The suite checks syntax, fresh setup, legacy fixture compatibility, live Home Assistant separation, Alpha7 Agile contract, Actual-vs-KEMS comparison, PWA routing, public/private isolation and Pi deployment behavior.

## Related documentation

- `public-site/README.md` — public `kems.uk` deployment boundary
- `docs/RASPBERRY-PI.md` — appliance installation
- `docs/UPDATES.md` — website update path
- `docs/ANDROID-PWA.md` — installable property dashboard
- `docs/MULTI-SITE-HOME-HUB.md` — multi-property direction
