import fs from "node:fs";

const mustContain = (file, pieces) => {
  const text = fs.readFileSync(file, "utf8");
  for (const piece of pieces) {
    if (!text.includes(piece)) throw new Error(`${file} missing: ${piece}`);
  }
};

mustContain("image/kems-firstboot.service", ["Restart=on-failure", "After=network-online.target"]);
mustContain("image/kems-setup-status.service", ["ExecStart=/usr/local/bin/node", "ConditionPathExists=!/var/lib/kems-bootstrap/complete"]);
mustContain("image/kems-firstboot.sh", ["write_status", "getent ahostsv4 raw.githubusercontent.com", "kems-setup-status.service"]);
mustContain("deploy/systemd/kems-web.service", ["User=kemsweb", "ReadWritePaths=/var/lib/kems-web", "HOST=0.0.0.0", "PORT=4173"]);
mustContain("deploy/systemd/kems-web-manager.service", ["User=root", "KEMS_MANAGER_PORT=4174", "manager.mjs"]);
mustContain("deploy/systemd/kems-web-bundle-agent.service", ["User=root", "bundle-agent.mjs", "network-online.target"]);
mustContain("deploy/bundle-agent.mjs", [
  "kems-bundle.json",
  "sha256",
  "automaticUpdates",
  "maintenanceStart",
  "public_web",
  "kems-update",
  "applianceVersionRelation",
  "ahead-of-target",
  "downgrade blocked",
  "automatic change blocked",
  "const AGENT_VERSION = \"0.7.0-alpha7-web.14\""
]);
mustContain("deploy/manager.mjs", ["127.0.0.1", "kems-update", "kems-rollback", "systemctl", "latestRelease", "const MANAGER_VERSION = installedVersion()", "applianceActivationRequired: MANAGER_VERSION !== installed", "home-assistant", "ghcr.io/home-assistant/home-assistant:stable", "download.docker.com/linux/debian"]);
mustContain("install.sh", ["kems-web-manager.service", "kems-web-bundle-agent.service", "bundle-agent.mjs", "manager.mjs", "/var/lib/kems-web-management"]);
mustContain("deploy/bin/kems-update", [
  "TARGET_VERSION",
  "Verifying release checksum",
  "deploy/manager.mjs",
  "bundle-agent.mjs",
  "kems-web-bundle-agent.service",
  "Rolling back automatically",
  "already installed; refreshing appliance helpers",
  "Refreshed KEMS Web",
  "systemctl enable kems-web-bundle-agent.service"
]);
mustContain(".github/workflows/release.yml", ["public config scripts deploy README.md", "sha256sum"]);
mustContain(".github/workflows/build-pi-image.yml", ["latest-v22.x/SHASUMS256.txt", "kems-setup-status.mjs", "KEMS-Pi-${VERSION}-headless.img.xz"]);
console.log("Pi deployment checks passed.");

mustContain("server.mjs", ["/api/site", "/api/maintenance", "/api/system/update-policy", "/api/home-assistant/status", "/api/home-assistant/action", "site.json"]);
mustContain("public/app.js", ["Site identity", "Automatic coordinated updates", "Planned KEMS maintenance", "Host on this KEMS Pi", "Install Home Assistant", "Connect KEMS to local HA"]);
