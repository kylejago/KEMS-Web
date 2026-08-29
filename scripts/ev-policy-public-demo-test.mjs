import assert from "node:assert/strict";
import { sanitisePublicDemo } from "./build-public-demo.mjs";

const now = new Date("2026-08-23T12:00:00Z");
const payload = sanitisePublicDemo(
  {
    days: [
      {
        date: "2026-08-16",
        actual: { evKwh: 8.125, evSoc: 67, evConnected: true },
        kems: { evKwh: 5.5, evSoc: 80, chargeTimes: ["23:30"] },
        strategyLabel: "Agile export optimisation",
        agileSlots: [
          {
            time: "16:30",
            pricePence: 23.57,
            estimatedSocPercent: 68.7,
            gridAction: "EXPORT",
            gridKwh: 3.9,
            solarAction: "HOME/EXPORT",
            solarKwh: 2.3,
            batteryAction: "EXPORT",
            batteryKwh: 2.1,
            noData: false,
            entityId: "sensor.private",
            evSoc: 67,
          },
        ],
      },
    ],
  },
  { now, delayDays: 7 },
);

assert.equal(payload.schema, 3);
assert.equal(payload.days.length, 1);
assert.equal(payload.days[0].actual.evKwh, 8.125);
assert.equal(payload.days[0].kems.evKwh, 5.5);
assert.equal(payload.days[0].strategyLabel, "Agile export optimisation");
assert.equal("evSoc" in payload.days[0].actual, false);
assert.equal("evConnected" in payload.days[0].actual, false);
assert.equal("chargeTimes" in payload.days[0].kems, false);
assert.equal("fullKemsAgile" in payload.days[0], false);
assert.equal(payload.days[0].agileSlots.length, 1);
assert.deepEqual(payload.days[0].agileSlots[0], {
  time: "16:30",
  pricePence: 23.57,
  estimatedSocPercent: 68.7,
  gridAction: "EXPORT",
  gridKwh: 3.9,
  solarAction: "HOME/EXPORT",
  solarKwh: 2.3,
  batteryAction: "EXPORT",
  batteryKwh: 2.1,
  noData: false,
});
assert.equal("entityId" in payload.days[0].agileSlots[0], false);
assert.equal("evSoc" in payload.days[0].agileSlots[0], false);
assert.match(payload.privacy, /Sanitised daily totals and allow-listed half-hour KEMS routing evidence/);
assert.match(payload.privacy, /No live power, entity IDs, device identifiers, Home Assistant address, credentials or control endpoints/);

console.log("EV public-demo aggregate/delayed-routing privacy contract: PASS");
