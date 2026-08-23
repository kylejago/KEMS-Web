import assert from "node:assert/strict";
import { sanitisePublicDemo } from "./build-public-demo.mjs";

const now = new Date("2026-08-23T12:00:00Z");
const payload = sanitisePublicDemo({
  days: [{
    date: "2026-08-16",
    actual: { evKwh: 8.125, evSoc: 67, evConnected: true },
    fullKemsAgile: { evKwh: 5.5, evSoc: 80, chargeTimes: ["23:30"] },
  }],
}, { now, delayDays: 7 });

assert.equal(payload.days.length, 1);
assert.equal(payload.days[0].actual.evKwh, 8.125);
assert.equal(payload.days[0].fullKemsAgile.evKwh, 5.5);
assert.equal("evSoc" in payload.days[0].actual, false);
assert.equal("evConnected" in payload.days[0].actual, false);
assert.equal("chargeTimes" in payload.days[0].fullKemsAgile, false);
assert.match(payload.privacy, /Sanitised daily totals only/);

console.log("EV public-demo aggregate/privacy contract: PASS");
