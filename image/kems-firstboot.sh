#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${KEMS_GITHUB_REPO:-kylejago/KEMS-Web}"
BRANCH="${KEMS_GITHUB_BRANCH:-main}"
LOG=/var/log/kems-firstboot.log
STATE_DIR=/var/lib/kems-bootstrap
STATUS="$STATE_DIR/status.json"
DONE="$STATE_DIR/complete"

mkdir -p "$STATE_DIR"
exec > >(tee -a "$LOG") 2>&1

write_status() {
  local state="$1" stage="$2" progress="$3" message="$4"
  local tmp="$STATUS.tmp"
  printf '{"state":"%s","stage":"%s","progress":%s,"message":"%s","updated_at":"%s"}\n' \
    "$state" "$stage" "$progress" "${message//\"/\\\"}" "$(date -Is)" > "$tmp"
  mv "$tmp" "$STATUS"
}

on_error() {
  local rc=$?
  set +e
  write_status "error" "failed" 100 "Setup hit an error (code ${rc}). It will retry automatically in about a minute."
  echo "[$(date -Is)] KEMS first-boot failed with exit code ${rc}. Automatic retry is enabled."
  systemctl stop kems-web.service >/dev/null 2>&1 || true
  systemctl restart kems-setup-status.service >/dev/null 2>&1 || true
  exit "$rc"
}
trap on_error ERR

write_status "working" "boot" 5 "Raspberry Pi started. Preparing first-boot setup…"
echo "[$(date -Is)] KEMS first-boot bootstrap starting"

CURRENT_HOST="$(hostnamectl --static 2>/dev/null || hostname || true)"
if [[ -z "$CURRENT_HOST" || "$CURRENT_HOST" == "raspberrypi" ]]; then
  hostnamectl set-hostname kems-pi || true
  if grep -qE '^127\.0\.1\.1[[:space:]]+' /etc/hosts; then
    sed -i -E 's/^127\.0\.1\.1.*/127.0.1.1\tkems-pi/' /etc/hosts
  else
    printf '127.0.1.1\tkems-pi\n' >> /etc/hosts
  fi
fi

# Let Raspberry Pi OS finish its own first-boot/cloud-init work, but never
# block the KEMS bootstrap forever if cloud-init reports a problem.
if command -v cloud-init >/dev/null 2>&1; then
  write_status "working" "system" 10 "Waiting for Raspberry Pi OS first-boot configuration…"
  timeout 180 cloud-init status --wait || true
fi

write_status "working" "network" 18 "Waiting for Ethernet, DNS and internet access…"
for attempt in $(seq 1 180); do
  if getent ahostsv4 raw.githubusercontent.com >/dev/null 2>&1; then
    echo "[$(date -Is)] Network is ready."
    break
  fi
  echo "[$(date -Is)] Waiting for network (${attempt}/180)…"
  sleep 10
done
if ! getent ahostsv4 raw.githubusercontent.com >/dev/null 2>&1; then
  write_status "error" "network" 18 "No internet connection yet. Check Ethernet; setup will keep retrying."
  exit 20
fi

export DEBIAN_FRONTEND=noninteractive
write_status "working" "packages" 30 "Updating Raspberry Pi OS package information…"
apt-get update
write_status "working" "packages" 40 "Installing the small set of KEMS system requirements…"
apt-get install -y --no-install-recommends ca-certificates curl

write_status "working" "github" 52 "Downloading the KEMS installer from GitHub…"
INSTALLER=/tmp/kems-install.sh
curl -4 -fsSL --retry 10 --retry-delay 5 \
  "https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh" \
  -o "$INSTALLER"
chmod 0755 "$INSTALLER"

write_status "working" "kems" 62 "Installing the latest KEMS Web release from GitHub…"
KEMS_GITHUB_REPO="$REPO" KEMS_GITHUB_BRANCH="$BRANCH" bash "$INSTALLER"

write_status "working" "finalising" 95 "KEMS is installed. Finalising the appliance…"
touch "$DONE"
systemctl disable kems-firstboot.service >/dev/null 2>&1 || true
systemctl disable kems-setup-status.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/multi-user.target.wants/kems-firstboot.service || true
rm -f /etc/systemd/system/multi-user.target.wants/kems-setup-status.service || true

write_status "complete" "ready" 100 "KEMS is ready. Rebooting once to complete setup…"
echo "[$(date -Is)] KEMS installation complete"
sync
systemctl reboot
