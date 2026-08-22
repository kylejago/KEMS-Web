import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const updater = read("deploy/bin/kems-update");
const installer = read("install.sh");
const helper = read("deploy/remote-access-service.mjs");
const helperUnit = read("deploy/systemd/kems-web-remote-access.service");
const client = read("public/remote-access.js");

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

expect(project.version === pkg.version, "project.json and package.json version drift");
expect(
  pkg.scripts.test.includes("web17-bootstrap-brand-test.mjs"),
  "Remote Access bootstrap regression must remain in npm test",
);

for (const marker of [
  'REMOTE_HELPER_URL="http://127.0.0.1:4175/health"',
  "systemctl restart kems-web-remote-access.service",
  'curl -fsS --max-time 2 "$REMOTE_HELPER_URL"',
  "Remote Access setup helper is healthy",
  "exit 8",
]) {
  expect(updater.includes(marker), `Bootstrap baseline missing updater marker: ${marker}`);
}
for (const marker of [
  "systemctl enable --now kems-web-remote-access.service",
  "http://127.0.0.1:4175/health",
  "Remote Access setup helper did not pass its loopback health check",
]) {
  expect(installer.includes(marker), `fresh installer missing helper verification: ${marker}`);
}

expect(
  helper.includes('const HOST = "127.0.0.1"'),
  "Remote Access helper must stay loopback-only",
);
expect(
  helper.includes("const HELPER_VERSION = JSON.parse(") &&
    helper.includes('../package.json"'),
  "Remote Access helper must derive release identity from package.json",
);
expect(
  !/const HELPER_VERSION = ["'][^"']+["']/.test(helper),
  "Remote Access helper must not duplicate a hard-coded release identity",
);
expect(
  helper.includes("--token-file"),
  "Remote Access helper must retain root-only token-file use",
);
expect(
  helperUnit.includes("User=root") &&
    helperUnit.includes("remote-access-service.mjs"),
  "privileged helper systemd unit missing",
);
expect(
  client.includes('const API = "/api/remote-access"') && !client.includes(":4175"),
  "browser must continue to use the same-origin Remote Access API",
);

console.log(
  `${pkg.version} retains the self-healing loopback Remote Access bootstrap baseline.`,
);
