#!/usr/bin/env bash
set -euo pipefail

# KEMS Web Raspberry Pi bootstrap installer.
# Intended usage:
# curl -fsSL https://raw.githubusercontent.com/kylejago/KEMS-Web/main/install.sh | sudo bash

REPO="${KEMS_GITHUB_REPO:-kylejago/KEMS-Web}"
BRANCH="${KEMS_GITHUB_BRANCH:-main}"
NODE_MAJOR="${KEMS_NODE_MAJOR:-22}"
BASE=/opt/kems-web
DATA_DIR=/var/lib/kems-web
LIB_DIR=/usr/local/lib/kems-web

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "Run this installer with sudo." >&2; exit 1; }

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$ARCH" in
  arm64|aarch64) NODE_ARCH=arm64 ;;
  *) echo "KEMS Pi install requires 64-bit Raspberry Pi OS (arm64). Found: $ARCH" >&2; exit 2 ;;
esac

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils tar avahi-daemon

TMP="$(mktemp -d /tmp/kems-bootstrap.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

install_node() {
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
    arch="$(node -p 'process.arch' 2>/dev/null || true)"
    if [[ "$major" == "$NODE_MAJOR" && "$arch" == "arm64" ]]; then
      return
    fi
  fi

  echo "Installing official Node.js ${NODE_MAJOR}.x ARM64 runtime..."
  sums_url="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt"
  curl -fsSL --retry 4 "$sums_url" -o "$TMP/SHASUMS256.txt"
  archive="$(awk '$2 ~ /^node-v[0-9.]+-linux-arm64\.tar\.xz$/ {print $2; exit}' "$TMP/SHASUMS256.txt")"
  [[ -n "$archive" ]] || { echo "Could not resolve Node.js ${NODE_MAJOR}.x ARM64 archive." >&2; exit 3; }
  version="${archive#node-v}"; version="${version%-linux-arm64.tar.xz}"
  curl -fsSL --retry 4 "https://nodejs.org/dist/v${version}/${archive}" -o "$TMP/$archive"
  (cd "$TMP" && grep "  ${archive}$" SHASUMS256.txt | sha256sum -c -)
  rm -rf "/usr/local/lib/node-v${NODE_MAJOR}"
  mkdir -p "/usr/local/lib/node-v${NODE_MAJOR}"
  tar -xJf "$TMP/$archive" --strip-components=1 -C "/usr/local/lib/node-v${NODE_MAJOR}"
  for bin in node npm npx corepack; do
    ln -sfn "/usr/local/lib/node-v${NODE_MAJOR}/bin/$bin" "/usr/local/bin/$bin"
  done
}

install_node

# Download the repository itself for the first installation. Later upgrades use
# checksum-verified GitHub Release assets via kems-update.
echo "Downloading KEMS Web from GitHub: ${REPO}@${BRANCH}..."
curl -fsSL --retry 4 "https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz" -o "$TMP/repo.tar.gz"
tar -xzf "$TMP/repo.tar.gz" -C "$TMP"
SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -name 'KEMS-Web-*' -print -quit)"
if [[ -z "$SRC" ]]; then
  SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -print -quit)"
fi
[[ -n "$SRC" && -f "$SRC/package.json" && -f "$SRC/server.mjs" ]] || { echo "Downloaded repository is not a KEMS Web project." >&2; exit 4; }

VERSION="$(node -e 'const p=require(process.argv[1]); process.stdout.write(String(p.version||""))' "$SRC/package.json")"
[[ -n "$VERSION" ]] || { echo "KEMS Web package has no version." >&2; exit 5; }

mkdir -p "$BASE/releases" "$LIB_DIR" "$DATA_DIR" /var/lib/kems-web-management

# Use a stable non-login service account. This avoids DynamicUser/StateDirectory
# relocation of /var/lib/kems-web and keeps the persistent data path predictable.
if ! getent group kemsweb >/dev/null 2>&1; then
  groupadd --system kemsweb
fi
if ! id -u kemsweb >/dev/null 2>&1; then
  useradd --system --gid kemsweb --home-dir "$DATA_DIR" --shell /usr/sbin/nologin --no-create-home kemsweb
fi
chown -R kemsweb:kemsweb "$DATA_DIR"
chmod 700 "$DATA_DIR"
chown root:kemsweb /var/lib/kems-web-management
chmod 750 /var/lib/kems-web-management
DEST="$BASE/releases/$VERSION"
rm -rf "$DEST"
mkdir -p "$DEST"

# Runtime copy. Keep GitHub/deployment metadata out of the active web process.
for item in package.json server.mjs public config scripts README.md CHANGELOG.md LICENSE .env.example; do
  [[ -e "$SRC/$item" ]] && cp -a "$SRC/$item" "$DEST/"
done
mkdir -p "$DEST/data"

install -m 0755 "$SRC/deploy/bin/kems-update" /usr/local/sbin/kems-update
install -m 0755 "$SRC/deploy/bin/kems-rollback" /usr/local/sbin/kems-rollback
install -m 0755 "$SRC/deploy/bin/kems-status" /usr/local/sbin/kems-status
install -m 0644 "$SRC/deploy/healthcheck.mjs" "$LIB_DIR/healthcheck.mjs"
install -m 0644 "$SRC/deploy/manager.mjs" "$LIB_DIR/manager.mjs"
install -m 0644 "$SRC/deploy/systemd/kems-web.service" /etc/systemd/system/kems-web.service
install -m 0644 "$SRC/deploy/systemd/kems-web-manager.service" /etc/systemd/system/kems-web-manager.service
printf '%s\n' "$REPO" > "$LIB_DIR/github-repo"

node --check "$DEST/server.mjs"
node --check "$DEST/public/app.js"
ln -sfn "$DEST" "$BASE/current"

# Only replace the factory hostname. Respect any hostname the user already chose
# in Raspberry Pi Imager.
CURRENT_HOST="$(hostnamectl --static 2>/dev/null || hostname)"
if [[ "$CURRENT_HOST" == "raspberrypi" || -z "$CURRENT_HOST" ]]; then
  hostnamectl set-hostname kems-pi
  CURRENT_HOST=kems-pi
  if grep -qE '^127\.0\.1\.1[[:space:]]+' /etc/hosts; then
    sed -i -E 's/^127\.0\.1\.1.*/127.0.1.1\tkems-pi/' /etc/hosts
  else
    printf '127.0.1.1\tkems-pi\n' >> /etc/hosts
  fi
fi

systemctl daemon-reload
systemctl enable --now avahi-daemon.service
systemctl enable --now kems-web-manager.service
# The headless image uses port 4173 for its setup status page. Hand the port
# over to the real KEMS service only when the application is ready to start.
if systemctl list-unit-files kems-setup-status.service >/dev/null 2>&1; then
  systemctl stop kems-setup-status.service || true
fi
systemctl enable --now kems-web.service

OK=0
for _ in $(seq 1 30); do
  if node "$LIB_DIR/healthcheck.mjs" http://127.0.0.1:4173/api/health >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done

if [[ "$OK" != 1 ]]; then
  systemctl --no-pager --full status kems-web.service || true
  echo "KEMS installed but did not pass its health check." >&2
  exit 6
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "KEMS Web ${VERSION} is installed and running."
echo "Open: http://${CURRENT_HOST}.local:4173"
[[ -n "$IP" ]] && echo "Or:   http://${IP}:4173"
echo
echo "First visit: enter your Home Assistant local URL and long-lived token."
echo "Check for updates later with: sudo kems-update"
echo "Status:                       kems-status"
echo "Rollback:                     sudo kems-rollback"
