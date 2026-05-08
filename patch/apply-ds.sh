#!/usr/bin/env bash
# apply-ds.sh — aplica as atualizações do design system MatchImóveis
# Uso: dentro da pasta matchimoveis/, rode:  bash patch/apply-ds.sh

set -e

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="backups-ds-$TS"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  MatchImóveis · Design System patch"
echo "  Timestamp: $TS"
echo "  Backup em: $BACKUP_DIR/"
echo "  Lendo de:  $PATCH_DIR"
echo ""

if [ ! -f "server.js" ]; then
  echo "  ✗ Erro: rode dentro da pasta matchimoveis/ (server.js não encontrado no diretório atual)"
  echo "    Ex:  cd matchimoveis && bash patch/apply-ds.sh"
  exit 1
fi

if [ ! -f "$PATCH_DIR/public/app.css" ]; then
  echo "  ✗ Erro: arquivos do patch não encontrados em $PATCH_DIR"
  exit 1
fi

mkdir -p "$BACKUP_DIR/views/partials"
mkdir -p "$BACKUP_DIR/public"

backup_and_replace() {
  local rel="$1"
  if [ -f "$rel" ]; then
    cp "$rel" "$BACKUP_DIR/$rel"
    echo "  ✓ backup    $rel"
  fi
  cp "$PATCH_DIR/$rel" "$rel"
  echo "  ✓ aplicado  $rel"
}

backup_and_replace "views/partials/app-shell.ejs"
backup_and_replace "views/app-home.ejs"
backup_and_replace "public/app.css"

echo "$BACKUP_DIR" > .last-ds-backup
echo ""
echo "  Pronto. Rode:  node server.js"
echo "  Para reverter: bash patch/rollback-ds.sh"
echo ""
