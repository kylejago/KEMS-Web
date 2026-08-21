export const PANEL_POWER_THRESHOLD_KW = 0.03;

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function derivePanelState(data, threshold = PANEL_POWER_THRESHOLD_KW) {
  const metrics = data?.metrics || {};
  const availability = data?.availability || {};
  const gridNet = numberOrNull(metrics.gridPower);
  const gridKnown =
    availability.liveGrid !== false &&
    (numberOrNull(metrics.gridImportPower) !== null ||
      numberOrNull(metrics.gridExportPower) !== null ||
      gridNet !== null);
  const gridImport =
    numberOrNull(metrics.gridImportPower) ??
    (gridNet !== null ? Math.max(0, gridNet) : null);
  const gridExport =
    numberOrNull(metrics.gridExportPower) ??
    (gridNet !== null ? Math.max(0, -gridNet) : null);
  const solarKnown =
    metrics.solarDataAvailable !== false && availability.liveSolar !== false;
  const batteryKnown =
    metrics.batteryDataAvailable !== false && availability.liveBattery !== false;
  const solar = solarKnown ? numberOrNull(metrics.solarPower) : null;
  const battery = batteryKnown ? numberOrNull(metrics.batteryPower) : null;
  const batterySoc = batteryKnown ? numberOrNull(metrics.batterySoc) : null;
  const ev = numberOrNull(metrics.evPower);
  const evCharging =
    Boolean(metrics.evCharging) || (Number.isFinite(ev) && ev > threshold);
  const evConnected = Boolean(metrics.evConnected) || evCharging;
  const costToday = numberOrNull(data?.observed?.costToday);

  return {
    home: numberOrNull(metrics.housePower),
    solar,
    battery,
    batterySoc,
    gridImport: gridKnown ? gridImport : null,
    gridExport: gridKnown ? gridExport : null,
    gridAvailable: Boolean(data?.connected && gridKnown),
    ev,
    evSoc: numberOrNull(metrics.evSoc),
    evConnected,
    evCharging,
    costToday,
    gridImporting: Number.isFinite(gridImport) && gridImport > threshold,
    gridExporting: Number.isFinite(gridExport) && gridExport > threshold,
    solarProducing: Number.isFinite(solar) && solar > threshold,
    batteryCharging: Number.isFinite(battery) && battery < -threshold,
    batteryDischarging: Number.isFinite(battery) && battery > threshold,
  };
}
