<p align="center">
  <img src="brand/kems-logo.svg" alt="KEMS" width="180">
</p>

# KEMS Web — 0.7.0-alpha7-web.19

KEMS Web is the read-only property companion and public-site source for the **KEMS Alpha7** platform. Home Assistant/KEMS remains the source of truth for each property.

## Canonical KEMS logo

Web.19 uses the exact user-supplied SVG at `brand/kems-logo.svg` as the single visual source of truth. It is **877 bytes** with SHA-256:

`ef53e22bdff4e4ebd81007c3a6d5f28da0384f547e9036a7be7e3bf2d420b464`

The property dashboard, `kems.uk`, Remote Access, PWA/favicons and Pi first-boot setup use byte-identical copies of that SVG. Web.19 no longer downloads or crops the older PNG concept and does not redraw the supplied mark.

## Property dashboard

The property UI remains read-only and provides Live Data, Battery & Solar, Full KEMS, Full KEMS Agile, Compare, History & scenarios, Cost & ROI and local-only Pi/Remote Access setup. Real Home Assistant/inverter control remains outside KEMS Web.

## Remote access

Private property access continues through Cloudflare Access plus the outbound property tunnel. For Kyle:

```text
kyle.kems.uk -> Cloudflare Access -> kems-kyle tunnel -> http://localhost:4173
```

The privileged connector setup helper remains root-owned and loopback-only on `127.0.0.1:4175`; management/setup requests are rejected when they arrive through Cloudflare or another forwarded proxy.

## Live delayed public demo

Web.19 adds a deliberately tiny public-demo surface:

```text
demo-api.kems.uk -> tunnel -> localhost:4173 -> GET /api/public-demo only
```

The gateway reads retained daily ledger evidence and excludes every day newer than seven days. It publishes sanitised daily aggregates only. All other paths on the demo hostname return 404. The static `kems.uk` demo consumes this feed and falls back safely if it is unavailable.

See `docs/PUBLIC-DEMO.md`.

## Property login

`kems.uk` does not implement its own password database. The **Sign in to KEMS** action opens the Cloudflare Access App Launcher at `https://kems-uk.cloudflareaccess.com/`. Cloudflare authenticates the user and shows only property applications allowed by their Access policies.

See `docs/PROPERTY-LOGIN.md`.

## Raspberry Pi appliance

Persistent data stays under `/var/lib/kems-web`; versioned releases stay under `/opt/kems-web/releases`. Published releases are checksum-verified and can roll back. The Web.17/18 Remote Access helper bootstrap and health checks remain intact.

## Validation

```bash
npm test
```

The suite checks syntax, exact SVG identity, public-demo host isolation, seven-day privacy delay, Cloudflare-login links, private-management boundaries, fixture compatibility, Alpha7 Agile evidence, comparison/ROI and Pi deployment behavior.
