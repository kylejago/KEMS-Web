# KEMS Pi coordinated updates

KEMS Web `0.7.0-alpha6-web.8` introduces an opt-in bundle agent for unattended property-Pi updates.

## Update policy

The Pi manager stores a local policy with these defaults:

- automatic updates: off until the owner opts in;
- coordinated updates: on;
- mode: safe updates can install immediately, disruptive work waits for the maintenance window;
- maintenance window: 03:00–04:00 local Pi time;
- automatic Pi reboot: off until explicitly enabled;
- maintenance notices: on;
- release channel: alpha.

Settings are editable from the KEMS Web settings drawer on the direct LAN address. Management writes remain local-network only.

## Bundle agent

The root-only `kems-web-bundle-agent.service` checks releases from `kylejago/KEMS` for `kems-bundle.json` and `kems-bundle.json.sha256`. The manifest is rejected if the SHA-256 does not match.

For the property appliance, the agent compares the exact `property_web` and `pi_agent` targets with the installed versions. A changed appliance target is installed with:

```text
kems-update <exact-version>
```

The existing updater still checksum-verifies the Pi archive, runs syntax/smoke checks, health-checks the new website and automatically restores the previous website release if the health check fails. The coordinated agent then restarts and health-checks the Pi manager and verifies the target versions before recording success.

A target that has not changed is not reinstalled.

## Maintenance notices

The bundle agent writes one durable maintenance state containing the scheduled time, reason, expected downtime, affected components and result. `/api/maintenance` exposes a sanitised copy so every property-web view can show the same banner without exposing Pi management controls.

Completion remains visible after the transaction; failures remain visible with the error rather than silently disappearing.

## Pi system and public website

`pi_system` is reserved for explicit, supported runtime/OS migrations. The agent deliberately does not run a blanket operating-system upgrade simply because a KEMS application release exists.

`public_web` is also present in the shared bundle contract now. Until the public KEMS website is built it is reported as delegated/not targeted; the future public-site deployment agent can adopt that target without changing the bundle schema.

## Bootstrap

The first web release containing this agent still needs one normal/manual Pi update, because the currently installed Pi cannot run updater code that it does not yet have. After `web.8` is installed and automatic updates are enabled, future coordinated appliance targets can update unattended.
