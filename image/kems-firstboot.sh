#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${KEMS_GITHUB_REPO:-kylejago/KEMS-Web}"
BRANCH="${KEMS_GITHUB_BRANCH:-main}"
LOG=/var/log/kems-firstboot.log
STATE_DIR=/var/lib/kems-bootstrap
DONE="$STATE_DIR/complete"

mkdir -p "$STATE_DIR"
exec > >(tee -a "$LOG") 2>&1

echo "[$(date -Is)] KEMS first-boot bootstrap starting"

# Keep the appliance hostname predictable unless cloud-init / Raspberry Pi Imager
# has deliberately supplied a different hostname.
CURRENT_HOST="$(hostnamectl --static 2>/dev/null || hostname || true)"
if [[ -z "$CURRENT_HOST" || "$CURRENT_HOST" == "raspberrypi" ]]; then
  hostnamectl set-hostname kems-pi || true
  if grep -qE '^127\.0\.1\.1[[:space:]]+' /etc/hosts; then
    sed -i -E 's/^127\.0\.1\.1.*/127.0.1.1\tkems-pi/' /etc/hosts
  else
    printf '127.0.1.1\tkems-pi\n' >> /etc/hosts
  fi
fi

# Wait for actual internet access. Ethernet DHCP needs no preconfiguration;
# Wi-Fi can be supplied by Raspberry Pi Imager/cloud-init.
for attempt in $(seq 1 180); do
  if getent hosts raw.githubusercontent.com >/dev/null 2>&1; then
    break
  fi
  echo "[$(date -Is)] Waiting for network (${attempt}/180)..."
  sleep 10
done

if ! getent hosts raw.githubusercontent.com >/dev/null 2>&1; then
  echo "[$(date -Is)] No internet connection yet; bootstrap will retry on next boot." >&2
  exit 20
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl

INSTALLER=/tmp/kems-install.sh
curl -fsSL --retry 10 --retry-delay 5 \
  "https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh" \
  -o "$INSTALLER"
chmod 0755 "$INSTALLER"

KEMS_GITHUB_REPO="$REPO" KEMS_GITHUB_BRANCH="$BRANCH" bash "$INSTALLER"

touch "$DONE"
systemctl disable kems-firstboot.service || true
rm -f /etc/systemd/system/multi-user.target.wants/kems-firstboot.service || true

echo "[$(date -Is)] KEMS installation complete"
echo "Open http://kems-pi.local:4173 after reboot."
sync
systemctl reboot
