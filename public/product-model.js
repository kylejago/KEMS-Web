export const KEMS_PRODUCTS = Object.freeze([
  Object.freeze({
    key: "live_data",
    label: "Live Data",
    shortLabel: "Live",
    description: "Measured property data from Home Assistant and KEMS, with no simulated hardware or KEMS control.",
    source: "observed",
    capabilities: Object.freeze(["Live power", "Tariff state", "History", "Cost & ROI evidence"]),
    href: "/#live"
  }),
  Object.freeze({
    key: "battery_solar",
    label: "Battery & Solar",
    shortLabel: "Battery & Solar",
    description: "The same home replayed with the configured solar array and battery using normal tariff-aware storage behaviour.",
    source: "simulation",
    capabilities: Object.freeze(["Solar routing", "Battery routing", "Import reduction", "Export income"]),
    href: "/compare.html"
  }),
  Object.freeze({
    key: "full_kems",
    label: "Full KEMS",
    shortLabel: "Full KEMS",
    description: "Forecast-aware KEMS optimisation, protecting the home while deciding when to charge, hold, use or export stored energy.",
    source: "simulation",
    capabilities: Object.freeze(["Demand forecast", "Solar forecast", "Smart import", "Reserve protection"]),
    href: "/compare.html"
  }),
  Object.freeze({
    key: "full_kems_agile",
    label: "Full KEMS Agile",
    shortLabel: "KEMS Agile",
    description: "Full KEMS plus dynamic export-price optimisation and the Alpha7 Agile digital-twin evidence chain.",
    source: "simulation",
    capabilities: Object.freeze(["Agile Outgoing", "Price horizon", "Smart export", "Shadow parity"]),
    href: "/agile.html"
  })
]);

export const KEMS_PRODUCT_KEYS = Object.freeze(KEMS_PRODUCTS.map((product) => product.key));

export function productByKey(key) {
  return KEMS_PRODUCTS.find((product) => product.key === String(key || "").trim().toLowerCase()) || null;
}

export function productLabel(key, fallback = "KEMS") {
  return productByKey(key)?.label || fallback;
}
