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
mustContain("deploy/manager.mjs", ["127.0.0.1", "kems-update", "kems-rollback", "systemctl", "latestRelease"]);
mustContain("install.sh", ["kems-web-manager.service", "manager.mjs", "/var/lib/kems-web-management"]);
mustContain("deploy/bin/kems-update", ["Verifying release checksum", "deploy/manager.mjs", "kems-web-manager.service", "Rolling back automatically"]);
mustContain(".github/workflows/release.yml", ["public config scripts deploy README.md", "sha256sum"]);
mustContain(".github/workflows/build-pi-image.yml", ["latest-v22.x/SHASUMS256.txt", "kems-setup-status.mjs", "KEMS-Pi-${VERSION}-headless.img.xz"]);
console.log("Pi deployment checks passed.");
