import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const updater = read("deploy/bin/kems-update");
const installer = read("install.sh");
const helper = read("deploy/remote-access-service.mjs");
const helperUnit = read("deploy/systemd/kems-web-remote-access.service");
const client = read("public/remote-access.js");

const expect = (condition, message) => { if (!condition) throw new Error(message); };
const webNumber = Number.parseInt(pkg.version.match(/-web\.(\d+)$/)?.[1] || "0", 10);

expect(/^0\.7\.0-alpha7-web\.\d+$/.test(pkg.version) && webNumber >= 17, "Web.17 bootstrap baseline requires Web.17 or newer");
expect(project.version === pkg.version, "project.json and package.json version drift");
expect(pkg.scripts.test.includes("web17-bootstrap-brand-test.mjs"), "Web.17 bootstrap regression must remain in npm test");

for (const marker of [
  'REMOTE_HELPER_URL="http://127.0.0.1:4175/health"',
  "systemctl restart kems-web-remote-access.service",
  'curl -fsS --max-time 2 "$REMOTE_HELPER_URL"',
  "Remote Access setup helper is healthy",
  "exit 8"
]) expect(updater.includes(marker), `Web.17 bootstrap baseline missing updater marker: ${marker}`);
for (const marker of [
  "systemctl enable --now kems-web-remote-access.service",
  "http://127.0.0.1:4175/health",
  "Remote Access setup helper did not pass its loopback health check"
]) expect(installer.includes(marker), `fresh installer missing helper verification: ${marker}`);

expect(helper.includes('const HOST = "127.0.0.1"'), "Remote Access helper must stay loopback-only");
expect(helper.includes("--token-file"), "Remote Access helper must retain root-only token-file use");
expect(helperUnit.includes("User=root") && helperUnit.includes("remote-access-service.mjs"), "privileged helper systemd unit missing");
expect(client.includes('const API = "/api/remote-access"') && !client.includes(":4175"), "browser must continue to use the same-origin Remote Access API");

console.log(`Web.${webNumber} retains the Web.17 self-healing loopback Remote Access bootstrap baseline.`);
