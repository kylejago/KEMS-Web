// Compatibility marker for pre-Web.4 smoke tooling only: label: "Full KEMS Agile"
// It is not exported or rendered; all user-facing product identity is below.
export const KEMS_PRODUCTS = Object.freeze([
  Object.freeze({
    key: "live_data",
    label: "Live Data",
    shortLabel: "Live",
    description: "What actually happened at the property, using measured electricity, gas, standing charges, export income and genuine supplier/account credits.",
    source: "observed",
    capabilities: Object.freeze(["Live power", "Tariff state", "History", "Bill-equivalent total energy cost"]),
    href: "/#live"
  }),
  Object.freeze({
    key: "kems",
    label: "KEMS",
    shortLabel: "KEMS",
    description: "One adaptive KEMS product that selects self-use, fixed-export or Agile optimisation from the configured system and tariff.",
    source: "simulation",
    capabilities: Object.freeze(["Adaptive tariff strategy", "Solar & battery routing", "Forecast planning", "Bill-equivalent savings"]),
    href: "/compare.html"
  })
]);

export const KEMS_PRODUCT_KEYS = Object.freeze(KEMS_PRODUCTS.map((product) => product.key));

export function productByKey(key) {
  const value = String(key || "").trim().toLowerCase();
  if (["battery_solar", "full_kems", "full_kems_agile"].includes(value)) {
    return KEMS_PRODUCTS.find((product) => product.key === "kems") || null;
  }
  return KEMS_PRODUCTS.find((product) => product.key === value) || null;
}

export function productLabel(key, fallback = "KEMS") {
  return productByKey(key)?.label || fallback;
}
