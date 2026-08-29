import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const renderer = await readFile(new URL("../public/agile-page.js", import.meta.url), "utf8");
const loader = await readFile(new URL("../public/kems-page.js", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

assert.equal(pkg.version, "0.8.0-alpha8-web.7");
assert.match(loader, /agile-page\.js\?v=build2/);
assert.doesNotMatch(loader, /kems-flow-page/);
assert.match(shell, /kems-web-shell-build2/);
assert.match(shell, /agile-page\.js\?v=build2/);
assert.doesNotMatch(shell, /kems-flow-page/);

for (const heading of ["Time", "Price", "Est SOC", "Grid", "Solar", "Battery"]) {
  assert.match(renderer, new RegExp(`<th>${heading}</th>`));
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
  assert.match(renderer, new RegExp(field));
}

assert.match(renderer, /today_agile/);
assert.match(renderer, /Solar export/);
assert.match(renderer, /Replay through latest recorder sample/);
assert.match(renderer, /Live solar \+ settled battery export/);
assert.match(renderer, /Completed settled battery export/);
assert.match(renderer, /remaining slot/);
assert.match(renderer, /flow_battery_charge_kwh/);
assert.doesNotMatch(renderer, /services\.async_call|\/api\/services|providers\.foxess/i);
assert.equal((renderer.match(/fetch\("\/api\/live"/g) || []).length, 1);

console.log("Web.7 canonical flow presentation contract passed");
