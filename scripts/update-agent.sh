#!/usr/bin/env bash
set -euo pipefail

LOG_PREFIX="[update-agent]"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  local level="$1"; shift
  echo "${LOG_PREFIX} ${level} $*"
}

info() { log INFO "$*"; }
ok() { log OK "$*"; }
fail() { log ERROR "$*"; exit 1; }

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || fail "Run as root, for example: sudo bash $0"
}

sync_repository() {
  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    info "Repository metadata not found; skipping source sync."
    return 0
  fi

  cd "$REPO_DIR"
  if command -v gh >/dev/null 2>&1; then
    info "Syncing repository with GitHub CLI."
    gh repo sync
  else
    info "Syncing repository with git pull --ff-only."
    git pull --ff-only
  fi
}

main() {
  require_root
  sync_repository
  info "Reinstalling agent from ${REPO_DIR}."
  bash "${REPO_DIR}/scripts/install-agent.sh" "$@"
  info "Restarting mnscloud-agent.service."
  systemctl restart mnscloud-agent.service
  systemctl status mnscloud-agent.service --no-pager
  ok "mnscloud-agent update completed."
}

main "$@"
