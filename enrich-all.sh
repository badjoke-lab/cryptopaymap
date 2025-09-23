#!/usr/bin/env bash
set -euo pipefail

# ==== 基本設定（環境変数で上書き可）====
ROOT=${ROOT:-public/data/places}
CITY=${CITY:-}               # 例: CITY="jp/tokyo/tokyo.json"
MAX_NOMI=${MAX_NOMI:-800}    # 逆ジオ上限（都市ごとに自動で絞るループ例は別途）
SLEEP=${SLEEP:-2}            # Nominatim レート制限対策
UA=${UA:-"CryptoPayMap/1.0 (contact@example.com)"}
CACHE=${CACHE:-.cache-enrich}

mkdir -p "$CACHE"

# ==== 共通: 簡易リトライ ====
curl_retry() {
  # 使い方: curl_retry "実行コマンド(文字列)" [tries] [delay_base]
  local cmd="$1"
  local tries="${2:-5}"
  local delay="${3:-2}"
  local i=1
  while true; do
    if eval "$cmd"; then return 0; fi
    (( i >= tries )) && return 1
    sleep $((delay * i))
    ((i++))
  done
}

# ==== 処理対象の列挙 ====
list_targets() {
  local idx="$ROOT/index.json"
  if [[ -n "${CITY:-}" ]]; then
    # 単一都市
    echo "$ROOT/$CITY"
    return
  fi
  if [[ ! -f "$idx" ]]; then
    echo "index.json が見つかりません: $idx" >&2
    exit 1
  fi
  jq -r '.cities[].path' "$idx" | while read -r rel; do
    [[ -n "$rel" && -f "$ROOT/$rel" ]] && echo "$ROOT/$rel"
  done
}

# ==== Overpass から既存 OSM ID のタグ補足 ====
fetch_overpass_map() {
  local src="$1"   # 絶対パス (ROOT 下)
  # 既存 ID を (node|way|relation)(id); の形へ
  jq -r '
    .[] | .id
    | capture("osm:(?<t>node|way|relation):(?<i>\\d+)")
    | "\(.t)(\(.i));"
  ' "$src" > "$CACHE/ids.ql"

  # バッチ化
  split -l 200 "$CACHE/ids.ql" "$CACHE/ids.part." || true
  : > "$CACHE/overpass.ndjson"  # 追記用に空に
  shopt -s nullglob
  for f in "$CACHE"/ids.part.*; do
    local_body=$(printf '[out:json][timeout:60];(\n%s\n);\nout tags center;\n' "$(cat "$f")")
    local resp="$CACHE/resp.$(basename "$f").json"
    # 叩く
    curl_retry "curl -sS -A \"$UA\" --fail --data-urlencode 'data=$local_body' https://overpass-api.de/api/interpreter -o \"$resp\"" 5 2
    # 要素抽出して行毎に
    jq -e '.elements|type=="array"' "$resp" >/dev/null || true
    jq -c '.elements[]?' "$resp" >> "$CACHE/overpass.ndjson"
    sleep "$SLEEP"
  done
  shopt -u nullglob

  # Overpass 結果を key=id -> value=抽出プロパティ の map に変換
  jq -s '
    map({
      key: ("osm:"+.type+":" + (.id|tostring)),
      value: {
        website:        (.tags["contact:website"] // .tags.website // .tags.url),
        hours:          (.tags.opening_hours),
        last_verified:  (.tags["check_date:currency:XBT"] // .tags.check_date),
        instagram:      (.tags["contact:instagram"] // .tags.instagram),
        twitter:        (.tags["contact:twitter"]   // .tags.twitter   // .tags["contact:twitter:username"]),
        phone:          (.tags["contact:phone"]     // .tags.phone),
        cuisine:        (.tags.cuisine),

        # 決済推定（既存タグ → 後で .payment に畳み込み）
        pay_lightning:  ((.tags["payment:lightning"] // "") | test("^(yes|true)$"; "i")),
        pay_onchain:    ((.tags["payment:onchain"]   // .tags["payment:bitcoin"] // "") | test("^(yes|true)$"; "i")),
        pay_cards:      ((.tags["payment:credit_cards"] // .tags["payment:cards"] // "") | test("^(yes|true)$"; "i")),
        pay_cash:       ((.tags["payment:cash"] // "") | test("^(yes|true)$"; "i"))
      }
    })
    | from_entries
  ' "$CACHE/overpass.ndjson" > "$CACHE/enrich.map.json"
}

# ==== Nominatim で address を補完 ====
build_nominatim_map() {
  local step1="$1"  # Overpass マージ後の JSON (配列)
  : > "$CACHE/nomi.ndjson" || true

  # 住所が空のものを収集（必要数だけ）
  local count=0
  while IFS=$'\t' read -r lat lon oid; do
    ((count++))
    [[ $count -gt ${MAX_NOMI:-800} ]] && break
    local r="$CACHE/nomi.$(echo "$oid" | tr '/:' '_').json"
    curl_retry "curl -sS -A \"$UA\" --fail \
      \"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=$lat&lon=$lon&addressdetails=1\" \
      -o \"$r\"" 5 2 || true
    if jq -e 'has("display_name")' "$r" >/dev/null 2>&1; then
      jq -c --arg id "$oid" '{id:$id, address:(.display_name // "")}' "$r" >> "$CACHE/nomi.ndjson"
    fi
    sleep "$SLEEP"
  done < <(jq -r '.[] | select((.address//"")|length==0) | "\(.lat)\t\(.lng)\t\(.id)"' "$step1")

  # map 化
  jq -s 'map({key:.id, value:{address:.address}}) | from_entries' "$CACHE/nomi.ndjson" > "$CACHE/nomi.map.json"
}

# ==== 1都市処理 ====
enrich_one() {
  local src="$1"
  echo ">>> $src"

  # 1) Overpass で補足フィールド集約 → step1
  fetch_overpass_map "$src"
  jq -s '
    (.[0]) as $base | (.[1]) as $map |
    $base
    | map(. as $p | ($map[$p.id] // {}) as $e |
      . + {
        website:       (if (($p.website//"")|length>0) then $p.website else ($e.website // $p.website) end),
        hours:         (if (($p.hours  //"")|length>0) then $p.hours   else ($e.hours   // $p.hours)   end),
        last_verified: ($p.last_verified // $e.last_verified),
        instagram:     ($p.instagram // $e.instagram),
        twitter:       ($p.twitter   // $e.twitter),
        phone:         ($p.phone     // $e.phone),
        cuisine:       ($p.cuisine   // $e.cuisine),

        # 支払いは後で .payment に畳み込むため一旦中間フラグとして保持
        __pay__: {
          ln:   ($e.pay_lightning // false),
          onc:  ($e.pay_onchain   // false),
          card: ($e.pay_cards     // false),
          cash: ($e.pay_cash      // false)
        }
      })
  ' "$src" "$CACHE/enrich.map.json" > "$CACHE/step1.json"

  # 2) Nominatim で address 補完 → step2
  build_nominatim_map "$CACHE/step1.json"
  jq -s '
    (.[0]) as $base | (.[1]) as $nomi |
    $base
    | map( if ((.address//"")|length>0) then .
           else (. + ($nomi[.id] // {}))
           end )
  ' "$CACHE/step1.json" "$CACHE/nomi.map.json" > "$CACHE/step2.json"

  # 3) 正規化（空文字除去 / website 正規化 / tags→配列 / payment 畳み込み）→ step3
  jq '
    def trimstr: gsub("^\\s+|\\s+$";"");

    map(
      if type!="object" then . else
        . as $o
        | .website |= (
            if type=="string" and (.|length)>0
              then ( if test("^https?://") then . else "https://" + . end )
              else .
            end
          )
        | .tags |= (
            if type=="array" then .
            elif type=="string" then [ . ]
            elif . == null then []
            else .
            end
          )
        # 空文字値のキーは削除
        | reduce (keys_unsorted[]) as $k (.;
            if (.[ $k ] | type) == "string" and ((.[ $k ] | trimstr) | length) == 0
            then del(.[ $k ]) else . end
          )
        # payment 畳み込み（既存 .payment があれば尊重し、不足分は補う）
        | .payment = (
            (if (.payment|type)=="object" then .payment else {} end) as $p
            | {
                lightning: ( ($p.lightning // false) or (.__pay__.ln   // false) ),
                onchain:   ( ($p.onchain   // false) or (.__pay__.onc  // false) ),
                credit_cards: ( ($p.credit_cards // false) or (.__pay__.card // false) ),
                cash:      ( ($p.cash      // false) or (.__pay__.cash // false) )
              }
          )
        | del(.__pay__)
      end
    )
  ' "$CACHE/step2.json" > "$CACHE/step3.json"

  # 4) 永続化
  mv "$CACHE/step3.json" "$src"

  # 5) サマリ（★スペース抜け修正済み★）
  local ALL ADDR WEB HOUR PHONE IG TW LN ONC CARD CASH
  ALL=$( jq 'length'                                               "$src" || echo 0)
  ADDR=$(jq '[.[]|select((.address//"")|length>0)]|length'         "$src" || echo 0)
  WEB=$( jq '[.[]|select((.website//"")|length>0)]|length'         "$src" || echo 0)
  HOUR=$(jq '[.[]|select((.hours//"")|length>0)]|length'           "$src" || echo 0)
  PHONE=$(jq '[.[]|select((.phone//"")|length>0)]|length'          "$src" || echo 0)
  IG=$(   jq '[.[]|select((.instagram//"")|length>0)]|length'      "$src" || echo 0)
  TW=$(   jq '[.[]|select((.twitter//"")|length>0)]|length'        "$src" || echo 0)
  LN=$(   jq '[.[]|select(.payment.lightning==true)]|length'       "$src" || echo 0)
  ONC=$(  jq '[.[]|select(.payment.onchain==true)]|length'         "$src" || echo 0)
  CARD=$( jq '[.[]|select(.payment.credit_cards==true)]|length'    "$src" || echo 0)
  CASH=$( jq '[.[]|select(.payment.cash==true)]|length'            "$src" || echo 0)

  # 都市名を短く見せる
  local short
  short=$(basename "$src")
  echo "=> ${short}: ALL=$ALL ADDR=$ADDR WEB=$WEB HOUR=$HOUR PHONE=$PHONE IG=$IG TW=$TW | LN=$LN ONC=$ONC CARD=$CARD CASH=$CASH"
}

# ==== メイン ====
while read -r file; do
  enrich_one "$file"
done < <(list_targets)
