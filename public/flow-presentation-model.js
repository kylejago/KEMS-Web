export function displayFlowAction(action, kind = "") {
  const raw = String(action || "IDLE").toUpperCase();
  const tokens = raw.split("/").filter(Boolean);
  if (!tokens.length) return "IDLE";
  return tokens
    .map((token) => {
      if (token === "EXPO") return "EXPORT";
      if (token === "BATT" && kind === "solar") return "BATTERY";
      return token;
    })
    .join("/");
}

export function isHistoricalRuntimeGap(slot = {}) {
  const actions = Array.isArray(slot.actions) ? slot.actions : [];
  return (
    String(slot.flow_basis || "") === "settled/replayed KEMS slot" &&
    actions.length === 1 &&
    String(actions[0] || "").trim().toLowerCase() === "future slot"
  );
}
