# OSM raw candidate import (Phase 1 / implementation-only)

このジョブは `scripts/import_osm_raw_candidates.ts` を使って、OSM/Overpass から取得可能な構造を実装します。  
**このフェーズでは実データ取得を実行しません。** `--dry-run` が必須で、fixture からのみ生成します。

## 出力先

- Raw JSONL: `data/import/raw/raw_osm_candidates.<region>.jsonl`
- Log: `data/import/logs/raw_osm_candidates.<region>.log`

## 小試走（fixture / dry-run のみ）

```bash
node --import tsx scripts/import_osm_raw_candidates.ts \
  --region japan \
  --limit 1000 \
  --out data/import/raw/raw_osm_candidates.japan.jsonl \
  --dry-run
```

fixture を差し替える場合:

```bash
node --import tsx scripts/import_osm_raw_candidates.ts \
  --region germany \
  --limit 200 \
  --fixture scripts/fixtures/osm_candidates_sample.json \
  --dry-run
```

## 本番取得コマンド例（将来運用時の参考。今回実行禁止）

> 以下は将来の運用時に使う想定の例です。Phase 1 では実行しません。

```bash
node --import tsx scripts/import_osm_raw_candidates.ts \
  --region europe-west \
  --limit 5000 \
  --out data/import/raw/raw_osm_candidates.europe-west.jsonl \
  --dry-run
```

## chain candidate 判定

- `payment:lightning=yes|only` → `raw_chain_candidate=Lightning`, `raw_chain_confidence=high`
- `payment:onchain=yes|only` かつ `currency:XBT=yes` (または `currency:BTC=yes`) → `raw_chain_candidate=Bitcoin`, `raw_chain_confidence=medium`
- payment/currency タグはあるが上記に合致しない → `raw_chain_candidate=null`, `raw_chain_confidence=low`
- payment/currency タグが存在しない → `raw_chain_candidate=null`, `raw_chain_confidence=none`

## 注意

- 実通信（Overpass/OSM API）は Phase 1 では禁止。
- DB への insert/update/delete はこのジョブでは行わない。
- region 単位で再実行可能（出力ファイルを region 別に分離）。

## dry-run 想定出力

標準出力（例）:

```text
dry-run complete: wrote 2 records to data/import/raw/raw_osm_candidates.japan.jsonl
log file: data/import/logs/raw_osm_candidates.japan.log
```

ログ要約（例）:

- loaded=5
- written=2
- skipped_missing_name=1
- skipped_missing_coords=1
- skipped_duplicate=1
- failed_transform=0

## JSONL 1レコード例

```json
{"candidate_source":"osm_overpass","source_id":"osm:node:1001","source_url":"https://www.openstreetmap.org/node/1001","ingested_at":"2026-01-01T00:00:00.000Z","raw_hash":"<sha256>","raw_name":"Tokyo Crypto Cafe","raw_category":"cafe","raw_payment_tags":{"payment:lightning":"yes","payment:onchain":"yes","currency:XBT":"yes"},"raw_chain_candidate":"Lightning","raw_chain_confidence":"high","lat":35.6804,"lng":139.769,"address_raw":"Marunouchi 1-1","city_raw":"Tokyo","country_raw":"JP","website_raw":"https://tokyo-crypto.example","socials_raw":["https://t.me/tokyocrypto"],"phone_raw":"+81-00-1111-2222","osm_type":"node","osm_id":"1001","raw_json":{"type":"node","id":1001,"lat":35.6804,"lon":139.769,"tags":{"name":"Tokyo Crypto Cafe","amenity":"cafe","payment:lightning":"yes","payment:onchain":"yes","currency:XBT":"yes","addr:street":"Marunouchi","addr:housenumber":"1-1","addr:city":"Tokyo","addr:country":"JP","website":"https://tokyo-crypto.example","contact:telegram":"https://t.me/tokyocrypto","phone":"+81-00-1111-2222"}}}
```
