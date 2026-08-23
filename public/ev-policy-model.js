export function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deriveEvPolicyView({
  mode,
  connected,
  charging,
  power,
  allowed,
  policy,
}) {
  const actualPower = Math.max(0, numberOrZero(power));
  const policyLabel = String(policy || "EV policy unavailable");

  if (mode === "live") {
    return {
      connected: Boolean(connected),
      charging: Boolean(charging),
      power: actualPower,
      blocked: false,
      unavailable: false,
      detail: charging
        ? `Charging · ${actualPower.toFixed(2)} kW`
        : connected
          ? "Connected"
          : "Not connected",
      policy: policyLabel,
    };
  }

  if (!connected) {
    return {
      connected: false,
      charging: false,
      power: 0,
      blocked: false,
      unavailable: false,
      detail: "Not connected",
      policy: policyLabel,
    };
  }

  if (allowed === null || allowed === undefined) {
    return {
      connected: true,
      charging: false,
      power: 0,
      blocked: false,
      unavailable: true,
      detail: "KEMS EV decision unavailable",
      policy: policyLabel,
    };
  }

  if (!allowed) {
    return {
      connected: true,
      charging: false,
      power: 0,
      blocked: true,
      unavailable: false,
      detail: `Blocked by KEMS · ${policyLabel}`,
      policy: policyLabel,
    };
  }

  return {
    connected: true,
    charging: Boolean(charging),
    power: charging ? actualPower : 0,
    blocked: false,
    unavailable: false,
    detail: charging
      ? `Charging allowed · ${policyLabel}`
      : `Connected · charging allowed · ${policyLabel}`,
    policy: policyLabel,
  };
}
