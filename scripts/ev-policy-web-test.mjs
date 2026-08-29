import assert from "node:assert/strict";
import fs from "node:fs";
import { deriveEvPolicyView } from "../public/ev-policy-model.js";

const live = deriveEvPolicyView({
  mode: "live",
  connected: true,
  charging: true,
  power: 7,
  allowed: false,
  policy: "EV cheap-window mode",
});
assert.equal(live.power, 7);
assert.equal(live.charging, true);
assert.equal(live.blocked, false);

const blocked = deriveEvPolicyView({
  mode: "simulated",
  connected: true,
  charging: true,
  power: 7,
  allowed: false,
  policy: "EV cheap-window mode",
});
assert.equal(blocked.power, 0);
assert.equal(blocked.charging, false);
assert.equal(blocked.blocked, true);
assert.match(blocked.detail, /Blocked by KEMS/);

const allowed = deriveEvPolicyView({
  mode: "simulated",
  connected: true,
  charging: true,
  power: 7,
  allowed: true,
  policy: "EV cheap-window mode",
});
assert.equal(allowed.power, 7);
assert.equal(allowed.charging, true);
assert.equal(allowed.blocked, false);

const unavailable = deriveEvPolicyView({
  mode: "simulated",
  connected: true,
  charging: true,
  power: 7,
  allowed: null,
  policy: null,
});
assert.equal(unavailable.power, 0);
assert.equal(unavailable.unavailable, true);

const kemsHtml = fs.readFileSync("public/kems.html", "utf8");
assert.match(kemsHtml, /kems-page\.js\?v=build3/);
assert.match(kemsHtml, /agile\.css\?v=build3/);
assert.doesNotMatch(
  kemsHtml,
  /ev-policy-model\.js|ev-policy-parity\.js|web21-agile\.js/,
  "Canonical KEMS dashboard must not restore the legacy EV/Web21 overlay runtime",
);

const kemsRuntime = fs.readFileSync("public/kems-page.js", "utf8");
assert.match(kemsRuntime, /agile-page\.js\?v=build3/);

const legacyAgileHtml = fs.readFileSync("public/agile.html", "utf8");
assert.match(legacyAgileHtml, /\/kems\.html/);
assert.doesNotMatch(
  legacyAgileHtml,
  /ev-policy-model\.js|ev-policy-parity\.js|web21-agile\.js/,
  "Legacy Agile redirect must remain inert",
);

const parity = fs.readFileSync("public/ev-policy-parity.js", "utf8");
assert.match(parity, /binary_sensor\.kems_ev_charging_allowed_by_control/);
assert.match(parity, /select\.kems_ev_charging_policy/);
assert.match(parity, /does not fabricate shifted overnight EV energy/);
assert.doesNotMatch(parity, /services\.async_call|\/api\/config|\/api\/services/);

const worker = fs.readFileSync("public/service-worker.js", "utf8");
assert.match(worker, /ev-policy-model\.js\?v=build1/);
assert.match(worker, /ev-policy-parity\.js\?v=build1/);
assert.match(worker, /flow-presentation-model\.js\?v=build3/);

const demo = fs.readFileSync("public-site/demo.js", "utf8");
assert.match(demo, /metrics\.evKwh/);
assert.match(demo, /Aggregate delayed charging energy/);
assert.match(demo, /Delayed Agile Plan/);

console.log("EV policy Web/Pi/public presentation contract: model and privacy evidence retained without reintroducing the legacy KEMS-page overlay runtime: PASS");
