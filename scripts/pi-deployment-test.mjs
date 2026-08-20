import fs from "node:fs";

const mustContain = (file, pieces) => {
  const text = fs.readFileSync(file, "utf8");
  for (const piece of pieces) if (!text.includes(piece)) throw new Error(`${file} missing: ${piece}`);
};

mustContain("image/kems-firstboot.service", ["Restart=on-failure", "After=network-online.target"]);
mustContain("image/kems-setup-status.service", ["ExecStart=/usr/local/bin/node", "ConditionPathExists=!/var/lib/kems-bootstrap/complete"]);
mustContain("image/kems-firstboot.sh", ["write_status", "getent ahostsv4 raw.githubusercontent.com", "kems-setup-status.service"]);
mustContain("image/kems-setup-status.mjs", ["KEMS — Kyle Energy Management System", "#ffbf00", "#36bd52"]);
mustContain("deploy/systemd/kems-web.service", ["User=kemsweb", "ReadWritePaths=/var/lib/kems-web", "HOST=0.0.0.0", "PORT=4173", "gateway.mjs", "KEMS_BACKEND_PORT=4176"]);
mustContain("deploy/systemd/kems-web-manager.service", ["User=root", "KEMS_MANAGER_PORT=4174", "manager.mjs"]);
mustContain("deploy/systemd/kems-web-bundle-agent.service", ["User=root", "bundle-agent.mjs", "network-online.target"]);
mustContain("deploy/systemd/kems-web-remote-access.service", ["User=root", "KEMS_REMOTE_ACCESS_PORT=4175", "remote-access-service.mjs"]);
mustContain("gateway.mjs", ["/api/remote-access/", "cf-connecting-ip", "x-forwarded-for", "127.0.0.1", "KEMS_BACKEND_PORT", "KEMS_REMOTE_ACCESS_PORT"]);
mustContain("deploy/bundle-agent.mjs", ["kems-bundle.json", "sha256", "automaticUpdates", "maintenanceStart", "public_web", "kems-update", "applianceVersionRelation", "ahead-of-target", "downgrade blocked", "automatic change blocked"]);
mustContain("deploy/manager.mjs", ["127.0.0.1", "kems-update", "kems-rollback", "systemctl", "latestRelease", "const MANAGER_VERSION = installedVersion()", "applianceActivationRequired: MANAGER_VERSION !== installed", "home-assistant", "ghcr.io/home-assistant/home-assistant:stable", "download.docker.com/linux/debian"]);
mustContain("deploy/remote-access.mjs", ["compatibility shim", "kems-web-remote-access.service"]);
mustContain("deploy/remote-access-service.mjs", ["const HOST = \"127.0.0.1\"", "4175", "cloudflared", "--token-file", "http://localhost:4173", "mode: 0o600"]);
mustContain("install.sh", ["gateway.mjs", "kems-web-manager.service", "kems-web-bundle-agent.service", "kems-web-remote-access.service", "remote-access-service.mjs", "/var/lib/kems-web-management"]);
mustContain("deploy/bin/kems-update", ["TARGET_VERSION", "Verifying release checksum", "gateway.mjs", "deploy/manager.mjs", "bundle-agent.mjs", "remote-access-service.mjs", "kems-web-remote-access.service", "Rolling back automatically", "already installed; refreshing appliance helpers", "Refreshed KEMS Web", "systemd-run --on-active=3s"]);
mustContain(".github/workflows/release.yml", ["package.json gateway.mjs server.mjs public config scripts deploy README.md", "sha256sum"]);
mustContain(".github/workflows/build-pi-image.yml", ["latest-v22.x/SHASUMS256.txt", "kems-setup-status.mjs", "KEMS-Pi-${VERSION}-headless.img.xz"]);

mustContain("server.mjs", ["/api/site", "/api/maintenance", "/api/system/update-policy", "/api/home-assistant/status", "/api/home-assistant/action", "site.json"]);
mustContain("public/app.js", ["Site identity", "Automatic coordinated updates", "Planned KEMS maintenance", "Host on this KEMS Pi", "Install Home Assistant", "Connect KEMS to local HA"]);
mustContain("public/remote-access.html", ["Remote access", "Cloudflare Tunnel connector", "http://localhost:4173", "kyle.kems.uk", "Install &amp; connect", "brand-lockup.svg"]);
mustContain("public/remote-access.js", ["/api/remote-access", "\"/install\"", "\"/action\""]);

console.log("Pi deployment checks passed for Web.16 gateway and loopback remote-access helper.");
