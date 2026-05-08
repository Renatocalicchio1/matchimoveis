#!/usr/bin/env bash
# rollback-ds.sh — reverte para o último backup criado por apply-ds.sh

set -e

if [ ! -f ".last-ds-backup" ]; then
  echo "  ✗ Nenhum backup registrado (.last-ds-backup não encontrado)"
  exit 1
fi

BACKUP_DIR=$(cat .last-ds-backup)

if [ ! -d "$BACKUP_DIR" ]; then
  echo "  ✗ Pasta de backup '$BACKUP_DIR' não existe"
  exit 1
fi

echo ""
echo "  Revertendo do backup: $BACKUP_DIR"
echo ""

restore() {
  local rel="$1"
  if [ -f "$BACKUP_DIR/$rel" ]; then
    cp "$BACKUP_DIR/$rel" "$rel"
    echo "  ✓ restaurado  $rel"
  else
    echo "  ⚠ pulado      $rel (não havia backup)"
  fi
}

restore "views/partials/app-shell.ejs"
restore "views/app-home.ejs"
restore "public/app.css"

echo ""
echo "  Rollback concluído."
echo ""
