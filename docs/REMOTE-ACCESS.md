# KEMS remote property access foundation

KEMS remote access is a separate security boundary from both the static `kems.uk` site and the local property appliance.

## Target path

```text
kems.uk
  → authenticated KEMS account
  → property selector
  → authenticated gateway
  → outbound tunnel created by that property's KEMS Pi
  → read-only KEMS property dashboard
```

No inbound router port-forward is required. Home Assistant is not exposed directly and the public static website never receives a Home Assistant token.

## Local-only operations

The following remain local-network operations even after remote dashboard access exists:

- KEMS Pi updates and rollback
- maintenance-window changes
- encrypted backup create/restore
- Home Assistant connection changes
- Home Assistant services or control calls
- inverter/charger control endpoints
- OS or container administration

`server.mjs` already treats forwarded/proxied requests as non-LAN for Pi-management writes. The remote gateway must preserve that property rather than attempting to impersonate a local request.

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
