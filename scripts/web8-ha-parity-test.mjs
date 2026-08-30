import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  displayFlowAction,
  isHistoricalRuntimeGap,
} from "../public/flow-presentation-model.js";
import { sanitisePublicDemo } from "./build-public-demo.mjs";

assert.equal(displayFlowAction("EXPORT", "grid"), "EXPORT");
assert.equal(displayFlowAction("HOME/EXPO", "solar"), "HOME/EXPORT");
assert.equal(displayFlowAction("HOME/BATT", "solar"), "HOME/BATTERY");
assert.equal(
  displayFlowAction("HOME/BATT/EXPO", "solar"),
  "HOME/BATTERY/EXPORT",
);
assert.equal(displayFlowAction("HOME/EXPO", "battery"), "HOME/EXPORT");
assert.ok(!displayFlowAction("EXPORT", "grid").includes("EXPORTRT"));

const gap = {
  actions: ["future slot"],
  flow_basis: "settled/replayed KEMS slot",
};
assert.equal(isHistoricalRuntimeGap(gap), true);
assert.equal(
  isHistoricalRuntimeGap({ ...gap, actions: [] }),
  false,
  "a genuine recorded idle slot is not a runtime gap",
);
assert.equal(
  isHistoricalRuntimeGap({
    ...gap,
    flow_basis: "KEMS forecast + final rolling allocation",
  }),
  false,
  "a future placeholder is not a historical runtime gap",
);

const renderer = await readFile(
  new URL("../public/agile-page.js", import.meta.url),
  "utf8",
);
const gateway = await readFile(new URL("../gateway.mjs", import.meta.url), "utf8");
const demo = await readFile(
  new URL("../public-site/demo.js", import.meta.url),
  "utf8",
);
const privacy = await readFile(
  new URL("../public-site/privacy.html", import.meta.url),
  "utf8",
);
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

assert.equal(pkg.version, "0.8.0-alpha8-web.9");
assert.match(renderer, /flow-presentation-model\.js\?v=build3/);
assert.match(renderer, /isHistoricalRuntimeGap\(slot\)/);
assert.match(renderer, /NO DATA/);
assert.match(renderer, /00:00 to 23:30/);
assert.doesNotMatch(renderer, /00:00 to 07:30/);
assert.doesNotMatch(renderer, /08:00 to 15:30/);
assert.doesNotMatch(renderer, /16:00 to 23:30/);
assert.doesNotMatch(renderer, /replace\(["']EXPO["']/);
assert.doesNotMatch(renderer, /services\.async_call|\/api\/services|providers\.foxess/i);

assert.match(gateway, /sensor\.kems_agile_slots/);
assert.match(gateway, /PUBLIC_EVIDENCE_VERSION = 4/);
assert.match(gateway, /agileSlots/);
assert.match(gateway, /flow-presentation-model\.js/);
assert.match(demo, /Delayed Agile Plan/);
assert.match(demo, /agileSlots/);
assert.match(privacy, /half-hour KEMS routing evidence/);

const candidate = {
  days: [
    {
      date: "2026-08-20",
      kems: { gridExportKwh: 3.9, endSocPercent: 68.7 },
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
        },
        {
          time: "12:00",
          pricePence: 15.91,
          estimatedSocPercent: null,
          gridAction: "NO DATA",
          gridKwh: null,
          solarAction: "NO DATA",
          solarKwh: null,
          batteryAction: "NO DATA",
          batteryKwh: null,
          noData: true,
        },
      ],
    },
  ],
};
const publicPayload = sanitisePublicDemo(candidate, {
  delayDays: 7,
  now: new Date("2026-08-29T12:00:00Z"),
});
assert.equal(publicPayload.schema, 3);
assert.equal(publicPayload.days[0].agileSlots.length, 2);
assert.deepEqual(publicPayload.days[0].agileSlots[0], candidate.days[0].agileSlots[0]);
assert.equal(publicPayload.days[0].agileSlots[1].noData, true);
assert.equal(publicPayload.days[0].agileSlots[1].gridKwh, null);

console.log("Web.8 HA parity catch-up contract preserved by Web.9 redeploy");
