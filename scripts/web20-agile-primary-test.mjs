import fs from "node:fs";
import assert from "node:assert/strict";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const project = JSON.parse(fs.readFileSync("config/project.json", "utf8"));
const agile = fs.readFileSync("public/agile-page.js", "utf8");
const compare = fs.readFileSync("public/strategy-comparison.js", "utf8");
const compareHtml = fs.readFileSync("public/compare.html", "utf8");

assert.equal(packageJson.version, "0.7.0-alpha7-web.20");
assert.equal(project.version, "0.7.0-alpha7-web.20");
assert.match(project.tagline, /Full KEMS Agile/i);
assert.match(agile, /economic_opportunity_guard/);
assert.match(agile, /Remaining export plan/);
assert.match(agile, /Routing now vs today/);
assert.match(compare, /Overall strategy comparison/);
assert.match(compare, /Last 7 days/);
assert.match(compare, /Last 30 days/);
assert.match(compare, /at least two of the three available evidence horizons/);
assert.match(compareHtml, /strategy-comparison\.js\?v=alpha7web20/);

console.log("Web.20 Agile-primary comparison contract passed.");
