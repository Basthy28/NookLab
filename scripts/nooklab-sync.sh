#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/streetwriters/notesnook.git"
UPSTREAM_BRANCH="master"
FORK_BRANCH="nooklab"

ensure_clean_tree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: working tree has uncommitted changes. Commit or stash them first." >&2
    exit 1
  fi
}

ensure_upstream_remote() {
  if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream "${UPSTREAM_URL}"
  fi
}

fetch_upstream() {
  ensure_upstream_remote
  echo "Fetching upstream/${UPSTREAM_BRANCH}..."
  git fetch --no-tags upstream "${UPSTREAM_BRANCH}"
}

cmd_status() {
  fetch_upstream
  local upstream_ref="refs/remotes/upstream/${UPSTREAM_BRANCH}"
  local base_sha behind ahead
  base_sha="$(git merge-base "${FORK_BRANCH}" "${upstream_ref}")"
  behind="$(git rev-list --count "${base_sha}..${upstream_ref}")"
  ahead="$(git rev-list --count "${base_sha}..${FORK_BRANCH}")"

  echo "Branch '${FORK_BRANCH}' status relative to upstream/${UPSTREAM_BRANCH}:"
  echo "  Upstream commits to integrate (behind): ${behind}"
  echo "  NookLab patch commits (ahead):          ${ahead}"
  echo ""
  echo "Patch stack:"
  git log --oneline --reverse "${upstream_ref}..${FORK_BRANCH}"
}

cmd_patches() {
  local out_dir="${1:-patches}"
  local upstream_ref="refs/remotes/upstream/${UPSTREAM_BRANCH}"
  mkdir -p "${out_dir}"
  rm -f "${out_dir}"/*.patch
  git format-patch --zero-commit "${upstream_ref}..${FORK_BRANCH}" -o "${out_dir}"
  echo "Exported NookLab patches to '${out_dir}/'."
}

cmd_verify() {
  echo "Running NookLab web unit tests..."
  (cd apps/web && npx vitest run nooklab-)
  echo "Running NookLab web build..."
  npm run build:web
}

cmd_sync() {
  ensure_clean_tree
  fetch_upstream

  git checkout "${FORK_BRANCH}"
  local upstream_ref="refs/remotes/upstream/${UPSTREAM_BRANCH}"
  local base_sha behind
  base_sha="$(git merge-base HEAD "${upstream_ref}")"
  behind="$(git rev-list --count "${base_sha}..${upstream_ref}")"

  if [ "${behind}" -eq 0 ]; then
    echo "Branch '${FORK_BRANCH}' is already up to date with upstream/${UPSTREAM_BRANCH}."
    git log --oneline --reverse "${upstream_ref}..HEAD"
    return 0
  fi

  local backup_branch="nooklab-backup-$(date +%Y%m%d-%H%M%S)"
  git branch -f "${backup_branch}" HEAD
  echo "Created safety backup branch '${backup_branch}'."
  echo "Rebasing ${FORK_BRANCH} onto upstream/${UPSTREAM_BRANCH} (${behind} new upstream commits)..."

  if ! git rebase "${upstream_ref}"; then
    echo "" >&2
    echo "=== NOOKLAB REBASE CONFLICT ===" >&2
    if [ -f .git/rebase-merge/stopped-sha ]; then
      local stopped_sha
      stopped_sha="$(cat .git/rebase-merge/stopped-sha)"
      echo "Conflicting patch: $(git log -1 --format='%h %s' "${stopped_sha}")" >&2
    fi
    echo "Conflicted files:" >&2
    git diff --name-only --diff-filter=U >&2 || true
    echo "" >&2
    echo "Resolve conflicts, run 'git add <files>' and 'git rebase --continue'," >&2
    echo "or abort cleanly with 'git rebase --abort'." >&2
    exit 1
  fi

  echo "Rebase succeeded! Running NookLab web unit tests..."
  (cd apps/web && npx vitest run nooklab-)
  echo ""
  echo "Sync verified. Push to origin with:"
  echo "  git push origin ${FORK_BRANCH} --force-with-lease"
  echo "Backup branch '${backup_branch}' can be deleted with 'git branch -D ${backup_branch}'."
}

case "${1:-sync}" in
  sync)
    cmd_sync
    ;;
  status)
    cmd_status
    ;;
  patches)
    cmd_patches "${2:-patches}"
    ;;
  verify)
    cmd_verify
    ;;
  *)
    echo "Usage: $0 {sync|status|patches [dir]|verify}" >&2
    exit 2
    ;;
esac
