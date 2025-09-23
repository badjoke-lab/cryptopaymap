#!/usr/bin/env bash
set -euo pipefail

ROOT="public/data"
IDX="$ROOT/places.index.min.json"
VER="$(date +%Y%m%d%H%M%S)"
TMP_RAW="$(mktemp)"
TMP="$(mktemp)"
OUT="$ROOT/manifest.json"

cleanup(){ rm -f "$TMP_RAW" "$TMP"; }
trap cleanup EXIT

# 1) per-city JSON を抽出（配列/オブジェクト両対応）+ null/空/非文字列除外 + 重複排除
jq -r '
  if type=="array" then
    .[]
  elif has("cities") then
    .cities[]
  else
    empty
  end
  | .path? // empty
  | select(type=="string" and length>0)
' "$IDX" \
| sort -u \
| sed 's#^#public/data/places/#' > "$TMP_RAW"

# 2) 実在ファイルだけに限定
: > "$TMP"
while IFS= read -r f; do
  [[ -f "$f" ]] && echo "$f" >> "$TMP"
done < "$TMP_RAW"

# 3) all + shards を追記（必要に応じてここに国を追加/削除）
{
  echo "public/data/places.all.json"
  printf '%s\n' \
    public/data/shards/AR.json \
    public/data/shards/CA.json \
    public/data/shards/DE.json \
    public/data/shards/FR.json \
    public/data/shards/GB.json \
    public/data/shards/JP.json \
    public/data/shards/MX.json \
    public/data/shards/SV.json \
    public/data/shards/TH.json \
    public/data/shards/US.json
} >> "$TMP"

# 4) manifest.json を生成（sha256 付き）
{
  printf '{\n  "version":"%s",\n  "files": [\n' "$VER"
  n=$(wc -l < "$TMP" | tr -d ' ')
  i=0
  while IFS= read -r f; do
    i=$((i+1))
    sha=$(shasum -a 256 "$f" | cut -d' ' -f1)
    printf '    {"path":"%s","sha256":"%s"}' "$f" "$sha"
    [[ "$i" -lt "$n" ]] && printf ','
    printf '\n'
  done < "$TMP"
  printf '  ]\n}\n'
} > "$OUT"

echo "wrote $OUT"
jq -e '.files|length>0' "$OUT" >/dev/null || { echo "manifest empty"; exit 1; }
