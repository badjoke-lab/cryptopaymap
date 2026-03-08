# OSM raw candidate import (Phase 1 / raw候補取得)

このジョブは `scripts/import_osm_raw_candidates.ts` を使って、OSM 候補を **region 単位**で raw JSONL に保存します。  
Phase 1 では **DB 書込なし（insert / update / delete なし）** で、保存対象は raw JSONL とログのみです。

## 安全ガード（最重要）

- デフォルトは安全側: `--live` を付けない限り実通信しません。
- `--dry-run` 指定時: fixture を読み込んで変換のみ実行します。
- `--live` 指定時のみ: Overpass へ実通信します。
- `--dry-run` と `--live` の同時指定はエラーです。

## CLI オプション

- `--region`（必須）: 出力・ログを分離する region 名
- `--limit`（必須運用）: 最大書込件数
- `--out`: Raw JSONL 出力先（省略時: `data/import/raw/raw_osm_candidates.<region>.jsonl`）
- `--log`: ログ出力先（省略時: `data/import/logs/raw_osm_candidates.<region>.log`）
- `--dry-run`: fixture モード
- `--live`: Overpass 実通信モード（明示必須）
- `--fixture`: fixture JSON パス（dry-run 時に使用）
- `--overpass-url`: Overpass endpoint（live 時に使用）

## 出力先

- Raw JSONL: `data/import/raw/raw_osm_candidates.<region>.jsonl`
- Log: `data/import/logs/raw_osm_candidates.<region>.log`

## 候補抽出ポリシー（crypto payment 候補に限定）

raw 段階は「crypto payment candidate を広く拾う」目的で、次の合わせ技で抽出します。最終 accepted 判定は後段の正規化・審査で行います。

- `currency:*` allowlist
  - `currency:XBT|BTC|BCH|LTC|ETH|DOGE|USDT|USDC = yes|limited|only`
- `payment:*` は全件対象にせず **crypto payment key allowlist** のみ対象
  - `payment:lightning`
  - `payment:onchain`
  - `payment:bitcoin`
  - `payment:ethereum`
  - `payment:cryptocurrency`
  - `payment:crypto`
  - 上記が `yes|limited|only`

> `payment:cash` / `payment:credit_cards` / `payment:debit_cards` / `payment:contactless` など一般決済タグは対象外。

## dry-run 実行例（fixture のみ）

```bash
node --import tsx scripts/import_osm_raw_candidates.ts \
  --region japan \
  --limit 300 \
  --out data/import/raw/raw_osm_candidates.japan.jsonl \
  --log data/import/logs/raw_osm_candidates.japan.log \
  --fixture scripts/fixtures/osm_candidates_sample.json \
  --dry-run
```

## live 実行例（小規模）

```bash
node --import tsx scripts/import_osm_raw_candidates.ts \
  --region japan \
  --limit 300 \
  --out data/import/raw/raw_osm_candidates.japan.jsonl \
  --log data/import/logs/raw_osm_candidates.japan.log \
  --overpass-url https://overpass-api.de/api/interpreter \
  --live
```

## live 実行例（本番拡張時の region 分割）

```bash
node --import tsx scripts/import_osm_raw_candidates.ts --region japan --limit 500 --out data/import/raw/raw_osm_candidates.japan.jsonl --log data/import/logs/raw_osm_candidates.japan.log --live
node --import tsx scripts/import_osm_raw_candidates.ts --region germany --limit 500 --out data/import/raw/raw_osm_candidates.germany.jsonl --log data/import/logs/raw_osm_candidates.germany.log --live
node --import tsx scripts/import_osm_raw_candidates.ts --region europe-west --limit 500 --out data/import/raw/raw_osm_candidates.europe-west.jsonl --log data/import/logs/raw_osm_candidates.europe-west.log --live
```

## ログ項目（live / dry-run 共通）

- start/end timestamp
- region
- overpass url
- loaded
- written
- skipped_missing_name
- skipped_non_candidate
- skipped_missing_coords
- skipped_duplicate
- failed_transform
- failed_fetch
- mode（fixture / live）

想定ログ（例）:

```text
[mode] live
[start] timestamp=2026-03-08T16:10:00.000Z region=japan dry_run=false live=true limit=300
[overpass_url] https://overpass-api.de/api/interpreter
...
[summary] loaded=428
[summary] written=300
[summary] skipped_missing_name=8
[summary] skipped_non_candidate=60
[summary] skipped_missing_coords=5
[summary] skipped_duplicate=3
[summary] failed_transform=0
[summary] failed_fetch=0
[end] timestamp=2026-03-08T16:10:20.000Z region=japan
[done] out=data/import/raw/raw_osm_candidates.japan.jsonl
```

## 失敗時の再実行

- fetch 失敗時は region 単位で失敗終了します（他 region に影響なし）。
- 同一 region を同じ `--region` / `--out` / `--log` で再実行してください。
- 例:

```bash
node --import tsx scripts/import_osm_raw_candidates.ts \
  --region japan \
  --limit 300 \
  --out data/import/raw/raw_osm_candidates.japan.jsonl \
  --log data/import/logs/raw_osm_candidates.japan.log \
  --overpass-url https://overpass-api.de/api/interpreter \
  --live
```

## chain candidate 判定

- `payment:lightning=yes|only` → `raw_chain_candidate=Lightning`, `raw_chain_confidence=high`
- `payment:onchain=yes|only` かつ `currency:XBT=yes` (または `currency:BTC=yes`) → `raw_chain_candidate=Bitcoin`, `raw_chain_confidence=medium`
- payment/currency タグはあるが上記に合致しない（例: `currency:BCH=yes`, `currency:ETH=yes`, `currency:USDT=yes`） → `raw_chain_candidate=null`, `raw_chain_confidence=low`
- payment/currency タグが存在しない → `raw_chain_candidate=null`, `raw_chain_confidence=none`

## JSONL 1レコード例

```json
{"candidate_source":"osm_overpass","source_id":"osm:node:5005","source_url":"https://www.openstreetmap.org/node/5005","ingested_at":"2026-01-01T00:00:00.000Z","raw_hash":"<sha256>","raw_name":"Osaka BCH Market","raw_category":"supermarket","raw_payment_tags":{"currency:BCH":"yes"},"raw_chain_candidate":null,"raw_chain_confidence":"low","lat":34.6937,"lng":135.5023,"address_raw":null,"city_raw":"Osaka","country_raw":"JP","website_raw":null,"socials_raw":[],"phone_raw":null,"osm_type":"node","osm_id":"5005","raw_json":{"type":"node","id":5005,"lat":34.6937,"lon":135.5023,"tags":{"name":"Osaka BCH Market","shop":"supermarket","currency:BCH":"yes","addr:city":"Osaka","addr:country":"JP"}}}
```
