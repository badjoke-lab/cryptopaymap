#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ENV_FILE="$HOME/.config/cpm/prod-backup.env"
REPO_DIR="$HOME/cryptopaymap-v2"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

PROD_DATABASE_URL="$(
python3 - <<'PY'
from pathlib import Path
import re
p = Path.home() / ".config" / "cpm" / "prod-backup.env"
text = p.read_text()
m = re.search(r'^\s*PROD_DATABASE_URL\s*=\s*(.*)\s*$', text, re.M)
if not m:
    raise SystemExit("PROD_DATABASE_URL not found in env file")
v = m.group(1).strip()
if len(v) >= 2 and ((v[0] == "'" and v[-1] == "'") or (v[0] == '"' and v[-1] == '"')):
    v = v[1:-1]
print(v)
PY
)"

export PROD_DATABASE_URL

cd "$REPO_DIR"
exec "$REPO_DIR/scripts/ops/backup_prod_db.sh"
