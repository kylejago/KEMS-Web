# KEMS Web Compare scenarios

Target: KEMS 0.7.0-alpha6

The page consumes `sensor.kems_scenario_comparison_today` plus the Yesterday, 7-day and 30-day comparison period entities. The Today entity supplies the cumulative timeline. Individual Today cost entities are used as a fallback if a Home Assistant registry/state payload omits the nested Today period.

Scenarios:

1. No system
2. Solar only
3. Solar + battery
4. KEMS no-export
5. Full KEMS

The page remains read-only and does not call Home Assistant services.
