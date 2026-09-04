import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const entities = JSON.parse(read("config/entities.json"));
const project = JSON.parse(read("config/project.json"));

assert.equal(pkg.version, "0.8.0-alpha8-web.11");
assert.equal(project.version, pkg.version);
assert.equal(entities.commissioning_readiness, "sensor.kems_commissioning_readiness");

const retiredRuntimeFiles = [
  "public/web21-live.js",
  "public/web21-agile.js",
  "public/strategy-comparison.js",
  "public/panel-face-mask.png",
  "public/panel-face-mask.svg",
];
for (const file of retiredRuntimeFiles) {
  assert.equal(fs.existsSync(file), false, `${file} must remain removed after the Alpha8 cleanup`);
  assert.doesNotMatch(read("package.json"), new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} must not remain in package scripts`);
}

assert.equal(fs.existsSync("public/app.js"), true, "A tiny app.js updater sentinel is required for pre-Web.10 appliance updaters");
const updaterSentinel = read("public/app.js");
assert.match(updaterSentinel, /Compatibility sentinel/);
assert.match(updaterSentinel, /legacy Alpha6 renderer[^\n]*intentionally gone/i);
assert.doesNotMatch(read("package.json"), /public\/app\.js/, "The updater sentinel must not become an active package runtime/check owner");
assert.doesNotMatch(read("public/service-worker.js"), /(?:^|\/)app\.js(?:[?'"`]|$)/m, "The updater sentinel must not enter the PWA shell cache");

for (const compatibilityFile of ["public/agile.html", "public/products.html"]) {
  assert.equal(fs.existsSync(compatibilityFile), true, `${compatibilityFile} is an intentional compatibility route`);
}
for (const activeCss of ["public/web21.css", "public/web26.css"]) {
  assert.equal(fs.existsSync(activeCss), true, `${activeCss} remains active until a separate CSS consolidation`);
}

const model = read("public/control-safety-model.js");
for (const entityId of [
  "sensor.kems_commissioning_readiness",
  "binary_sensor.kems_system_commissioned_for_control",
  "binary_sensor.kems_real_control_backend_available",
  "binary_sensor.kems_control_commands_permitted",
  "binary_sensor.kems_control_enabled",
  "binary_sensor.kems_control_plan_safe",
  "sensor.kems_control_preflight",
  "sensor.kems_control_blocked_reason",
]) assert.match(model, new RegExp(entityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(model, /phase/);
assert.match(model, /commandsPermitted/);
assert.doesNotMatch(model, /phase[^\n]*===?[^\n]*(?:control|write)/i, "Development phase must not decide command permission");

const widget = read("public/control-safety-widget.js");
assert.match(widget, /deriveControlSafety/);
assert.match(widget, /\/api\/live/);
assert.match(widget, /Website control/);
assert.match(widget, /None — display only/);
assert.doesNotMatch(widget, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
assert.doesNotMatch(widget, /homeassistant\.(?:turn_|set_|service)|\/api\/services/i);

const settings = read("public/settings.html");
assert.match(settings, /control-safety-widget\.js\?v=build1/);
const worker = read("public/service-worker.js");
assert.match(worker, /kems-web-shell-build5/);
assert.match(worker, /control-safety-model\.js\?v=build1/);
assert.match(worker, /control-safety-widget\.js\?v=build1/);

for (const publicFile of [
  "public-site/index.html",
  "public-site/demo.html",
  "public-site/demo-compare.html",
  "public-site/login.html",
  "public-site/privacy.html",
]) {
  const source = read(publicFile);
  assert.doesNotMatch(source, /control-safety|commissioning_readiness|commands_permitted/i, `${publicFile} must not expose private commissioning detail`);
}

console.log("KEMS Web.11 cleanup/bootstrap contract passed: authoritative read-only safety evidence remains on the property Pi, the legacy renderer remains removed, the inert updater sentinel is not a runtime owner, compatibility routes remain, and the public site stays outside private commissioning detail.");
