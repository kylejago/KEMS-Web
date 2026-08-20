# KEMS remote property access

KEMS remote access is a separate security boundary from both the static `kems.uk` site and the local property appliance.

## Current Web.16 path

```text
kyle.kems.uk
  → Cloudflare Access authentication
  → Cloudflare Tunnel
  → outbound connector created by that property's KEMS Pi
  → http://localhost:4173
  → KEMS same-origin gateway
  → read-only KEMS property dashboard
```

No inbound router port-forward is required. Home Assistant is not exposed directly and the public static website never receives a Home Assistant token.

## Local connector setup without SSH

Web.16 keeps the browser-managed **Remote Access** setup page introduced in Web.15 but removes the browser-to-port-4175 connection that could fail under modern browser/network policy.

The normal KEMS origin on port `4173` now owns a small allow-listed API under `/api/remote-access/*`. Those routes are accepted only for a direct local-network KEMS request: the host must be local/private, the browser origin must match, and Cloudflare/forwarded headers are rejected. The gateway then forwards the request internally to the root-owned helper on `127.0.0.1:4175`.

The privileged helper therefore listens on **loopback only**. Port `4175` is not a LAN service, is not a browser destination, and must never be published through Cloudflare.

The setup page accepts either the Cloudflare tunnel token itself or the dashboard-generated command of the form:

```text
sudo cloudflared service install <TUNNEL_TOKEN>
```

KEMS does **not** execute pasted shell text. It extracts only the token from the recognised Cloudflare command form, rejects anything else, downloads the current Cloudflare `cloudflared` package for the appliance architecture, stores the token in a root-only file with mode `0600`, and starts a dedicated `kems-cloudflared.service` using `--token-file`.

For Kyle's property the published application route is:

- hostname: `kyle.kems.uk`
- service type: HTTP
- service URL: `http://localhost:4173`
- access control: Cloudflare Access

## Appliance activation

Web.16 installs and enables the dedicated `kems-web-remote-access.service` during both fresh install and browser-driven updates. A changed `kems-web.service` definition is restarted immediately so the same-origin gateway becomes active without a Pi reboot. The manager refresh is scheduled after the updater exits so an update initiated by the manager does not terminate its own cgroup mid-action.

## Local-only operations

The following remain local-network operations even after remote dashboard access exists:

- KEMS Pi updates and rollback
- maintenance-window changes
- Cloudflare connector provisioning, restart, disable and token replacement
- encrypted backup create/restore
- Home Assistant connection changes
- Home Assistant services or control calls
- inverter/charger control endpoints
- OS or container administration

The KEMS gateway and `server.mjs` both preserve the local-management boundary. Forwarded/proxied traffic cannot be used to impersonate a local request.

The tunnel must not publish Pi manager port `4174`, helper port `4175`, application backend port `4176`, Home Assistant `8123`, SSH, or a private subnet. Only the read-only KEMS property web service on `localhost:4173` is an approved origin.

## Gateway requirements

The gateway implementation must provide:

1. account authentication with modern MFA/passkey support where the selected provider allows it;
2. property-level authorisation so one account only sees assigned properties;
3. short-lived gateway sessions rather than storing a Home Assistant long-lived token centrally;
4. an outbound tunnel identity unique to each property appliance;
5. TLS from browser to gateway and authenticated encryption from gateway to property tunnel;
6. explicit route allow-listing for the read-only property UI and read-only API calls;
7. denial of local management routes through the tunnel, even for the property owner;
8. audit logs for account sign-in, property selection and tunnel session creation without logging household telemetry;
9. revocation for a lost Pi or compromised account without changing Home Assistant itself;
10. no dependency on exposing `8123`, `4173`, SSH or any router port publicly.

## Multi-property model

An account can own or be granted access to multiple properties. Each property keeps its own Home Assistant/KEMS credentials locally and registers only a gateway identity plus public display metadata such as property name. Different inverter backends can therefore present the same KEMS product model without sharing credentials or implementation details.

## Public demo is separate

The seven-day-delayed public demo is not a tunnel and is not generated from a browser request to a live property. It is a sanitised publish step with an explicit allow-list and a minimum seven-day cutoff.
