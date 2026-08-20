# KEMS property login — Cloudflare Access

KEMS Web.19 uses Cloudflare Access as the identity and property-selection boundary. KEMS does not create or store a second username/password database on `kems.uk`.

## User flow

```text
kems.uk -> Sign in to KEMS -> kems-uk.cloudflareaccess.com
         -> Cloudflare authentication/MFA
         -> applications allowed by Access policy
         -> selected property, e.g. kyle.kems.uk
```

Each property remains a separate Cloudflare Access application and outbound Tunnel destination. A user sees only applications their Access policy permits.

## Kyle property

- Access application: `KEMS - Kyle`
- Property hostname: `kyle.kems.uk`
- Tunnel: `kems-kyle`
- Origin: `http://localhost:4173`
- Home Assistant, Pi management, SSH and the wider LAN remain private.

## App Launcher

Enable the Cloudflare Access App Launcher for the `kems-uk` team. The public KEMS login page links to:

`https://kems-uk.cloudflareaccess.com`

Use the exact KEMS SVG as the application tile/logo where Cloudflare accepts an HTTPS logo URL.

## Adding another property

Create a new Access application and property hostname, attach the correct user/group policy, and publish that property's own outbound Tunnel to its local KEMS Web `localhost:4173`. Do not reuse Kyle's tunnel token or Home Assistant credentials.
