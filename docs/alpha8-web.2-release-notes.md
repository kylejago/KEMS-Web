# KEMS Web 0.8.0-alpha8-web.2

This coordinated Alpha8.5 companion release adds EV shadow-policy presentation parity across the property Pi/PWA and delayed public demo without adding a Home Assistant control path.

## Property Pi / PWA

- Live Data continues to show actual Ohme connection, charging state and power.
- Full KEMS Agile Simulated now applies KEMS's current EV Allow/Block decision to the EV node instead of presenting actual daytime charging as though KEMS had authorised it.
- A KEMS-blocked plugged-in EV is shown as blocked with zero current simulated EV power and red presentation.
- An allowed EV shows observed charging power only when the real EV is actually charging.
- If the KEMS policy entity is unavailable, the simulated view fails closed and labels the decision unavailable.
- The current policy label is shown beside the decision.
- The historical EV chart remains retained observed EV demand. The UI explicitly states that this release does not fabricate shifted overnight EV energy that is not yet represented by the accounting replay.

## Public demo

- Aggregate `evKWh` may pass through the existing sanitised delayed demo payload.
- The minimum public delay remains seven days.
- EV identity, connection state, SoC and charge times remain private.
- Existing public panel, routing and trend surfaces show the delayed aggregate only when retained evidence exists.

## Safety

KEMS Web remains display-only. The property website does not call Home Assistant services and this release adds no Ohme or FoxESS control endpoint.
