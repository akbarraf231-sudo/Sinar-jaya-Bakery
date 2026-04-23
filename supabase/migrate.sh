#!/bin/bash
# ============================================================================
# Sinar Jaya Bakery — Data migration script
# Old project: epydslvgxgucjemzfuxn  →  New project: pjsdsfnufetaxpzqpmot
#
# USAGE:
#   export OLD_PW='your-old-db-password'
#   export NEW_PW='your-new-db-password'
#   export REGION='ap-southeast-1'   # opsional, cek di Supabase Dashboard
#   bash supabase/migrate.sh
# ============================================================================
set -euo pipefail

OLD_REF="epydslvgxgucjemzfuxn"
NEW_REF="pjsdsfnufetaxpzqpmot"

: "${OLD_PW:?Set OLD_PW env var dulu (password DB project lama)}"
: "${NEW_PW:?Set NEW_PW env var dulu (password DB project baru)}"
REGION="${REGION:-ap-southeast-1}"

HOST="aws-0-${REGION}.pooler.supabase.com"

# Session pooler (port 5432) — required untuk pg_dump
OLD_DB="postgresql://postgres.${OLD_REF}:${OLD_PW}@${HOST}:5432/postgres"
NEW_DB="postgresql://postgres.${NEW_REF}:${NEW_PW}@${HOST}:5432/postgres"

cd "$(dirname "$0")"

echo "==> 1/4 Testing connection ke kedua project..."
psql "$OLD_DB" -c "select 'OLD OK';" >/dev/null
psql "$NEW_DB" -c "select 'NEW OK';" >/dev/null
echo "    ✓ Kedua project terhubung"

echo "==> 2/4 Dump schema + data dari project LAMA..."
pg_dump "$OLD_DB" \
  --no-owner --no-privileges --no-publications --no-subscriptions \
  --schema=public \
  -f backup.sql
echo "    ✓ Dump selesai: $(wc -l < backup.sql) baris"

echo "==> 3/4 Restore ke project BARU..."
psql "$NEW_DB" -v ON_ERROR_STOP=1 -f backup.sql
echo "    ✓ Restore selesai"

echo "==> 4/4 Jalankan migration hardening (stock, RPC, RLS)..."
psql "$NEW_DB" -v ON_ERROR_STOP=1 -f migrations/001_schema_and_place_order.sql
echo "    ✓ Migration selesai"

echo ""
echo "==> Verifikasi:"
psql "$NEW_DB" -c "select count(*) as total_products from products;"
psql "$NEW_DB" -c "select count(*) as total_orders from orders;"
psql "$NEW_DB" -c "select proname from pg_proc where proname = 'place_order';"

echo ""
echo "✅ SELESAI. Jangan lupa:"
echo "   1. Hapus backup.sql (berisi data customer)"
echo "   2. RESET database password di Supabase Dashboard"
