import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../public/kems-flow-page.js", import.meta.url), "utf8");
const loader = await readFile(new URL("../public/kems-page.js", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

assert.equal(pkg.version, "0.8.0-alpha8-web.7");
assert.match(loader, /kems-flow-page\.js\?v=build2/);
assert.match(shell, /kems-web-shell-build2/);
assert.match(shell, /kems-flow-page\.js\?v=build2/);

for (const heading of ["Time", "Price", "Est SOC", "Grid", "Solar", "Battery"]) {
  assert.match(page, new RegExp(`<th>${heading}</th>`));
}

for (const field of [
  "flow_grid_action",
  "flow_grid_kwh",
  "flow_solar_action",
  "flow_solar_kwh",
  "flow_battery_action",
  "flow_battery_kwh",
  "flow_estimated_soc_percent",
  "flow_scope",
  "flow_basis",
]) {
  assert.match(page, new RegExp(field));
}

assert.match(page, /Solar export/);
assert.match(page, /today_agile/);
assert.match(page, /Live solar \+ settled battery export/);
assert.match(page, /remaining/);
assert.doesNotMatch(page, /services\.async_call|foxess/i);

console.log("Web.7 flow presentation contract passed");
