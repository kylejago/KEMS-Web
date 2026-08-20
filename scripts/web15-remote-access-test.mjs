import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const packageJson = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const index = read("public/index.html");
const page = read("public/remote-access.html");
const client = read("public/remote-access.js");
const manager = read("deploy/manager.mjs");
const remote = read("deploy/remote-access.mjs");
const worker = read("public/service-worker.js");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(packageJson.version === "0.7.0-alpha7-web.15", "package.json must identify Web.15");
expect(project.version === packageJson.version, "project version must match package.json");
expect(index.includes("/remote-access.html"), "property dashboard must link Remote Access setup");
expect(page.includes("http://localhost:4173"), "setup page must document the only intended Cloudflare origin");
expect(page.includes("local KEMS Pi address"), "setup page must make the local-only boundary explicit");
expect(client.includes(":4175"), "setup client must use the dedicated LAN-only helper port");
expect(client.includes("location.protocol === \"http:\""), "setup client must refuse remote HTTPS tunnel use for privileged setup");
expect(manager.includes("file:///opt/kems-web/current/deploy/remote-access.mjs"), "Pi manager must load the optional remote-access helper from the active release");
expect(remote.includes("const PORT = Number.parseInt(process.env.KEMS_REMOTE_ACCESS_PORT || \"4175\""), "remote helper must use dedicated setup port 4175");
expect(remote.includes("const WEB_PORT = 4173"), "remote helper must bind Cloudflare guidance to KEMS Web 4173");
expect(remote.includes("--token-file"), "cloudflared must use a root-only token file rather than embedding the token in the service command line");
expect(remote.includes("mode: 0o600"), "tunnel token must be stored with mode 0600");
expect(remote.includes("cloudflared\\s+service\\s+install"), "helper must recognise only the Cloudflare service-install command form");
expect(remote.includes("Nothing was executed"), "invalid pasted commands must explicitly remain non-executable");
expect(remote.includes('import { spawnSync } from "node:child_process"'), "remote helper must use argument-vector process execution");
expect(!remote.includes("execSync("), "remote helper must not use execSync shell execution");
expect(!remote.includes("execFile("), "remote helper must not use execFile for pasted input");
expect(!remote.includes("spawn(\"bash\""), "remote helper must not invoke a generic shell for pasted input");
expect(!remote.includes("bash -c") && !remote.includes("bash -lc"), "remote helper must not construct shell command strings");
expect(remote.includes("requestIsLocal"), "remote helper must verify local-network callers");
expect(remote.includes("localOrigin"), "remote helper must verify the local KEMS web origin");
expect(remote.includes("Do not route") === false, "routing warning belongs in the UI, not privileged server logic");
expect(worker.includes("kems-alpha7-web15-shell-v1"), "PWA cache must advance to Web.15");
expect(worker.includes("/remote-access.html"), "remote access page must be part of the Web.15 shell");

console.log("Web.15 remote-access contract passed.");
