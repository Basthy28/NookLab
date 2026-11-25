#!/usr/bin/env bash
# NookLab — traz as updates do upstream e reaplica as alterações locais por cima.
# Uso: bash scripts/nooklab-sync.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/2] buscar upstream..."
git fetch upstream master

echo "[2/2] reaplicar NookLab por cima do upstream..."
if ! git rebase upstream/master; then
  echo "CONFLITO: resolve com 'git rebase --continue' ou aborta com 'git rebase --abort'." >&2
  exit 1
fi

echo "OK. Se queres publicar: git push --force-with-lease origin nooklab"
