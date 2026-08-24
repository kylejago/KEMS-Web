import fs from "node:fs";
import assert from "node:assert/strict";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const project = JSON.parse(fs.readFileSync("config/project.json", "utf8"));
const agile = fs.readFileSync("public/agile-page.js", "utf8");
const compare = fs.readFileSync("public/compare-page.js", "utf8");
const compareHtml = fs.readFileSync("public/compare.html", "utf8");

assert.equal(project.version, packageJson.version);
assert.match(project.tagline, /actual energy bill|KEMS would have done/i);
for (const marker of [
  "economic_opportunity_guard",
  "Remaining export plan",
  "Routing now vs today",
]) {
  assert.match(agile, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const marker of [
  "Live Data",
  "KEMS",
  "Total energy cost",
  "Estimated KEMS ROI",
]) {
  assert.match(compare, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(compare, /Battery & Solar|Full KEMS Agile/);
assert.match(compareHtml, /compare-page\.js\?v=build1/);
assert.doesNotMatch(compareHtml, /strategy-comparison\.js/);

console.log(`${packageJson.version} adaptive-KEMS comparison contract passed.`);
