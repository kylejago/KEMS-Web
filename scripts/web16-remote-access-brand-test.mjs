import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const pkg = JSON.parse(read("package.json"));
const project = JSON.parse(read("config/project.json"));
const gateway = read("gateway.mjs");
const helper = read("deploy/remote-access-service.mjs");
const compatibility = read("deploy/remote-access.mjs");
const webUnit = read("deploy/systemd/kems-web.service");
const helperUnit = read("deploy/systemd/kems-web-remote-access.service");
const client = read("public/remote-access.js");
const page = read("public/remote-access.html");
const propertyIndex = read("public/index.html");
const publicIndex = read("public-site/index.html");
const updater = read("deploy/bin/kems-update");
const installer = read("install.sh");

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

expect(project.version === pkg.version, "project.json and package.json version drift");
expect(
  pkg.scripts.start === "node gateway.mjs",
  "Same-origin Remote Access must start through the gateway",
);

for (const marker of [
  "/api/remote-access/",
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-forwarded-host",
  "request.headers.forwarded",
  "127.0.0.1",
  "KEMS_BACKEND_PORT",
  "KEMS_REMOTE_ACCESS_PORT",
]) {
  expect(gateway.includes(marker), `gateway missing ${marker}`);
}
expect(
  gateway.includes('process.env.HOST = "127.0.0.1"'),
  "application backend must remain on loopback behind the gateway",
);
expect(
  gateway.includes('process.env.PORT = String(BACKEND_PORT)'),
  "gateway must assign a private backend port",
);
expect(
  !client.includes(":4175"),
  "browser must never connect directly to privileged port 4175",
);
expect(
  client.includes('const API = "/api/remote-access"'),
  "Remote Access client must use same-origin API",
);

expect(
  helper.includes('const HOST = "127.0.0.1"'),
  "privileged helper must bind loopback only",
);
expect(
  helper.includes("const HELPER_VERSION = JSON.parse(") &&
    helper.includes('../package.json"'),
  "remote helper identity must derive from package release metadata",
);
expect(
  !/const HELPER_VERSION = ["'][^"']+["']/.test(helper),
  "remote helper must not duplicate a hard-coded release version",
);
expect(helper.includes("mode: 0o600"), "tunnel token must be stored mode 0600");
expect(
  helper.includes("--token-file"),
  "cloudflared connector must read its token from a root-only file",
);
expect(
  helper.includes("cloudflared\\s+service\\s+install"),
  "helper must recognise only the Cloudflare install-command form",
);
expect(
  helper.includes("Nothing was executed"),
  "invalid pasted commands must remain non-executable",
);
expect(
  helper.includes('import { spawnSync } from "node:child_process"'),
  "helper must use argument-vector process execution",
);
expect(!helper.includes("execSync("), "helper must not invoke a command shell");
expect(
  !helper.includes('spawn("bash"'),
  "helper must not invoke bash for pasted input",
);
expect(
  compatibility.includes("compatibility shim") &&
    !compatibility.includes("server.listen"),
  "legacy browser-facing helper must remain retired",
);

expect(
  webUnit.includes("gateway.mjs") && webUnit.includes("KEMS_BACKEND_PORT=4176"),
  "property service must run through the same-origin gateway",
);
expect(
  helperUnit.includes("User=root") &&
    helperUnit.includes("remote-access-service.mjs"),
  "dedicated privileged helper service missing",
);
expect(
  updater.includes("kems-web-remote-access.service") &&
    updater.includes("remote-access-service.mjs"),
  "updater must converge the Remote Access helper service",
);
expect(
  installer.includes("kems-web-remote-access.service") &&
    installer.includes("gateway.mjs"),
  "fresh installer must include the gateway/helper",
);

expect(
  page.includes("brand-lockup.svg") && propertyIndex.includes("brand-lockup.svg"),
  "property pages must retain the shared KEMS lockup surface",
);
expect(
  publicIndex.includes("brand-lockup.svg"),
  "kems.uk must retain the shared KEMS lockup surface",
);

console.log(
  `${pkg.version} preserves the same-origin Remote Access security contract.`,
);
