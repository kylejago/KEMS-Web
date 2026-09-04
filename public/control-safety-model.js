const IDS = Object.freeze({
  commissioning: "sensor.kems_commissioning_readiness",
  commissioned: "binary_sensor.kems_system_commissioned_for_control",
  realBackend: "binary_sensor.kems_real_control_backend_available",
  commandsPermitted: "binary_sensor.kems_control_commands_permitted",
  controlEnabled: "binary_sensor.kems_control_enabled",
  planSafe: "binary_sensor.kems_control_plan_safe",
  preflight: "sensor.kems_control_preflight",
  blockedReason: "sensor.kems_control_blocked_reason",
  phase: "sensor.kems_phase",
});

function entity(snapshot, entityId) {
  return (snapshot?.entities || []).find((item) => item?.entityId === entityId) || null;
}

function state(snapshot, entityId) {
  const item = entity(snapshot, entityId);
  if (!item?.available) return null;
  const value = String(item.state ?? "").trim();
  return value && !["unknown", "unavailable", "none"].includes(value.toLowerCase()) ? value : null;
}

function isOn(snapshot, entityId) {
  return state(snapshot, entityId)?.toLowerCase() === "on";
}

export function deriveControlSafety(snapshot) {
  const commissioningEntity = entity(snapshot, IDS.commissioning);
  const commissioning = state(snapshot, IDS.commissioning);
  const commissioned = isOn(snapshot, IDS.commissioned);
  const realBackend = isOn(snapshot, IDS.realBackend);
  const commandsPermitted = isOn(snapshot, IDS.commandsPermitted);
  const controlEnabled = isOn(snapshot, IDS.controlEnabled);
  const planSafe = isOn(snapshot, IDS.planSafe);
  const preflight = state(snapshot, IDS.preflight);
  const blockedReason = state(snapshot, IDS.blockedReason);
  const phase = state(snapshot, IDS.phase);
  const maximumStage = commissioningEntity?.attributes?.maximum_allowed_stage
    ?? commissioningEntity?.attributes?.maximum_stage
    ?? null;

  let status = "Safety evidence unavailable";
  if (commandsPermitted) status = "Commands permitted by KEMS";
  else if (commissioning) status = commissioning;
  else if (blockedReason) status = "Commands blocked";

  return {
    status,
    commissioning,
    commissioned,
    realBackend,
    commandsPermitted,
    controlEnabled,
    planSafe,
    preflight,
    blockedReason,
    maximumStage: maximumStage === null ? null : String(maximumStage),
    phase,
    websiteControl: false,
  };
}

export const CONTROL_SAFETY_ENTITY_IDS = IDS;
