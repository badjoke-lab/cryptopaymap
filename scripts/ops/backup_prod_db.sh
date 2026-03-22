#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [ -z "${PROD_DATABASE_URL:-}" ]; then
  echo "ERROR: PROD_DATABASE_URL is required" >&2
  exit 1
fi

PG_DUMP_BIN=""
for candidate in \
  "/opt/homebrew/opt/libpq/bin/pg_dump" \
  "/opt/homebrew/bin/pg_dump" \
  "/usr/local/opt/libpq/bin/pg_dump" \
  "/usr/local/bin/pg_dump" \
  "/Library/PostgreSQL/18/bin/pg_dump" \
  "/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump"
do
  if [ -x "$candidate" ]; then
    PG_DUMP_BIN="$candidate"
    break
  fi
done

if [ -z "$PG_DUMP_BIN" ]; then
  echo "ERROR: pg_dump binary not found in known locations" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT="${HOME}/cpm-backups/auto"
OUT="${ROOT}/${STAMP}"

mkdir -p "$OUT"

"$PG_DUMP_BIN" "$PROD_DATABASE_URL" -Fc -f "$OUT/cpm-prod-full.dump"
"$PG_DUMP_BIN" "$PROD_DATABASE_URL" --schema-only -f "$OUT/cpm-prod-schema.sql"

OUT_DIR="$OUT" node - <<'NODE'
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const outDir = process.env.OUT_DIR;
const url = process.env.PROD_DATABASE_URL;

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();

  const tables = ['places', 'verifications', 'payment_accepts', 'socials'];
  const counts = {};

  for (const table of tables) {
    const rows = (await client.query(`select * from ${table} order by 1`)).rows;
    counts[table] = rows.length;
    fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
  }

  fs.writeFileSync(path.join(outDir, 'counts.json'), JSON.stringify(counts, null, 2));
  await client.end();
})();
NODE

shasum -a 256 "$OUT"/* > "$OUT/SHA256SUMS.txt"

find "$ROOT" -maxdepth 1 -mindepth 1 -type d | sort | sed -e :a -e '1,14!{P;N;D;};N;ba' | xargs rm -rf 2>/dev/null || true

echo "backup complete: $OUT"
echo "pg_dump_bin=$PG_DUMP_BIN"
