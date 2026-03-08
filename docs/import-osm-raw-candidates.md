# OSM raw candidate import (Phase 1 / implementation-only)

このジョブは `scripts/import_osm_raw_candidates.ts` を使って、OSM/Overpass から取得可能な構造を実装します。  
**このフェーズでは実データ取得を実行しません。** `--dry-run` が必須で、fixture からのみ生成します。

## 出力先

- Raw JSONL: `data/import/raw/raw_osm_candidates.<region>.jsonl`
- Log: `data/import/logs/raw_osm_candidates.<region>.log`

## 候補抽出ポリシー（BTC限定ではない）

- raw 段階は「仮想通貨受け入れらしきものを広く拾う」目的。
- Overpass クエリは以下を候補対象にする:
  - `payment:* = yes|limited|only`
  - `currency:*` 系のうち allowlist (`XBT/BTC/BCH/LTC/ETH/DOGE/USDT/USDC`) が `yes|limited|only`
- つまり raw は **BTC 限定でない**。最終的な絞り込みは後続の正規化・重複排除段階で行う。

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
- payment/currency タグはあるが上記に合致しない（例: `currency:BCH=yes`, `currency:ETH=yes`, `currency:USDT=yes`） → `raw_chain_candidate=null`, `raw_chain_confidence=low`
- payment/currency タグが存在しない → `raw_chain_candidate=null`, `raw_chain_confidence=none`

## 注意

- 実通信（Overpass/OSM API）は Phase 1 では禁止。
- DB への insert/update/delete はこのジョブでは行わない。
- region 単位で再実行可能（出力ファイルを region 別に分離）。

## dry-run 想定出力

標準出力（例）:

```text
dry-run complete: wrote 6 records to data/import/raw/raw_osm_candidates.japan.jsonl
log file: data/import/logs/raw_osm_candidates.japan.log
```

ログ要約（例）:

- loaded=9
- written=6
- skipped_missing_name=1
- skipped_missing_coords=1
- skipped_duplicate=1
- failed_transform=0

## JSONL 1レコード例

```json
{"candidate_source":"osm_overpass","source_id":"osm:node:5005","source_url":"https://www.openstreetmap.org/node/5005","ingested_at":"2026-01-01T00:00:00.000Z","raw_hash":"<sha256>","raw_name":"Osaka BCH Market","raw_category":"supermarket","raw_payment_tags":{"currency:BCH":"yes"},"raw_chain_candidate":null,"raw_chain_confidence":"low","lat":34.6937,"lng":135.5023,"address_raw":null,"city_raw":"Osaka","country_raw":"JP","website_raw":null,"socials_raw":[],"phone_raw":null,"osm_type":"node","osm_id":"5005","raw_json":{"type":"node","id":5005,"lat":34.6937,"lon":135.5023,"tags":{"name":"Osaka BCH Market","shop":"supermarket","currency:BCH":"yes","addr:city":"Osaka","addr:country":"JP"}}}
```
