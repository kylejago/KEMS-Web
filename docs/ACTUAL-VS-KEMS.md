# Actual vs KEMS

Target: KEMS Web `0.7.0-alpha6-web.12`

The dedicated `/compare.html` view compares what actually happened with the KEMS simulation without mixing simulated solar/battery values into physical measurements.

## Periods

The page uses the existing read-only `/api/analytics` endpoint for:

- Day
- Week
- Month
- Year
- All time

Day uses the current-day KEMS/recorder timeline for the actual-versus-simulated net-grid chart. Longer periods use the native KEMS period ledger for authoritative actual and simulated totals, with Home Assistant/KEMS retained history used for historical context where available.

## Comparison

For each period the page shows:

- headline actual cost, KEMS simulated cost and the financial difference;
- grid import avoided and extra export;
- home, EV, solar and battery totals where available;
- actual and simulated grid import/export allocations;
- actual and simulated cost breakdowns;
- a full Actual / KEMS simulated / Difference table;
- explanations derived only from retained comparison totals;
- system cost, realised ROI, simulator evidence ROI and forecast ROI as separate concepts.

The page remains read-only. It performs GET requests only and never calls Home Assistant services or sends control commands.

## Data rules

Physical data stays physical. Missing live solar or battery values are not replaced with simulated values. A simulation can explain a modelled difference, but it must never be presented as a measured physical flow.

Incomplete/current periods are labelled provisional when the native KEMS ledger reports incomplete days. Coverage and source information remain visible so early alpha data cannot be mistaken for a complete historical record.
