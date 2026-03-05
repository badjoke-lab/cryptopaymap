# PR-01〜PR-05 再監査レポート v2

## 1) リポジトリ状態の証拠

実行コマンド:

```bash
pwd
git rev-parse --is-inside-work-tree
git remote -v
git branch --show-current
git log -1 --oneline
```

実測:

```text
/workspace/cryptopaymap-v2
true
(初回) remote なし
work
f82cb1e Add PR-01 to PR-05 validation audit report (#341)
```

## 2) origin 修正と main 同期

実行コマンド:

```bash
git remote add origin https://github.com/badjoke-lab/cryptopaymap-v2.git
git remote -v
git fetch origin
git checkout main
git pull --ff-only origin main
```

実測:

```text
origin https://github.com/badjoke-lab/cryptopaymap-v2.git (fetch)
origin https://github.com/badjoke-lab/cryptopaymap-v2.git (push)

fatal: unable to access 'https://github.com/badjoke-lab/cryptopaymap-v2.git/': CONNECT tunnel failed, response 403
error: pathspec 'main' did not match any file(s) known to git
```

判定:

- origin は修正済み。
- ただしネットワーク制約 (CONNECT tunnel 403) により `fetch/pull` が不能で、`main` ブランチの取得自体ができない状態。
- よって「同期済み main の commit hash」は環境制約で取得不可。代替として監査実行時 HEAD を記録する。

## 3) 監査ブランチ作成

実行コマンド:

```bash
git checkout -b audit/pr01-05-validation-v2
git rev-parse HEAD
```

実測:

```text
Switched to a new branch 'audit/pr01-05-validation-v2'
f82cb1ed286e6b99bf56ad5b2e1ccaec87145c96
```

## 4) ビルド系

実行コマンド:

```bash
npm ci
npm run lint
npm run build
npm run dev
```

実測要約:

- `npm ci`: 成功
- `npm run lint`: 成功（警告のみ）
- `npm run build`: 成功（警告のみ）
- `npm run dev`: `http://localhost:3000` で起動成功

## 5) URL 実測（HTTP status + 抜粋）

### 5.1 ページ系

| URL | HTTP | title 抜粋 | 先頭抜粋 |
|---|---:|---|---|
| `/` | 200 | `Find crypto-friendly places worldwide | CryptoPayMap` | `<!DOCTYPE html><html lang="en"><head>...` |
| `/accepts/BTC` | 200 | `Places accepting Bitcoin (BTC) | CryptoPayMap` | `<!DOCTYPE html><html lang="en"><head>...` |
| `/accepts/ETH` | 200 | `Places accepting Ethereum (ETH) | CryptoPayMap` | `<!DOCTYPE html><html lang="en"><head>...` |
| `/accepts/USDT` | 200 | `Places accepting Tether (USDT) | CryptoPayMap` | `<!DOCTYPE html><html lang="en"><head>...` |
| `/city/berlin` | 200 | `Places in Berlin | CryptoPayMap` | `<!DOCTYPE html><html lang="en"><head>...` |
| `/city/tokyo` | 200 | `Places in Tokyo | CryptoPayMap` | `<!DOCTYPE html><html lang="en"><head>...` |
| `/near-me` | 404 | `CryptoPayMap` | `<!DOCTYPE html><html id="__next_error__"><head>...` |

### 5.2 place 実ID検証（API経由で取得）

実行コマンド:

```bash
curl -sSI "http://localhost:3000/api/places?asset=BTC&limit=1"
curl -sS "http://localhost:3000/api/places?asset=BTC&limit=1"
```

実測:

- レスポンスヘッダ: `x-cpm-data-source: json`
- 取得ID: `cpm:jp-tokyo-owner-cafe-dbg-owner-2g1hq`

URLエンコードあり/なし検証:

| URL | HTTP | title |
|---|---:|---|
| `/place/cpm:jp-tokyo-owner-cafe-dbg-owner-2g1hq` | 404 | `CryptoPayMap` |
| `/place/cpm%3Ajp-tokyo-owner-cafe-dbg-owner-2g1hq` | 404 | `CryptoPayMap` |

### 5.3 Map 引継ぎの実測

| 起点 | 抽出したリンク | 判定 |
|---|---|---|
| `/accepts/BTC` | `href="/map?asset=BTC"`（2箇所） | OK |
| `/city/berlin` | `href="/map?city=Berlin"`（2箇所） | OK |

## 6) NG の原因特定（ファイル+行番号）

### NG-1: `/place/<id>` が 404（encoded / raw 両方）

断定根拠:

1. 一覧API (`/api/places`) は fallback snapshot を返す実装で、JSONスナップショットを読む経路を持つ。`x-cpm-data-source: json` 実測と一致。  
   - スナップショット読込: `loadPlacesFromSnapshot`。【lib/places/listPlacesForMap.ts:81-88】
2. 詳細ページは `getPlaceDetail(id)` を使い、fallback 側は `fallbackPlaces` 配列への完全一致検索のみ。  
   - fallback検索: `fallbackPlaces.find((item) => item.id === id)`。【lib/places/detail.ts:315-317】
3. DB取得も失敗した場合 `place: null` を返し、`app/place/[id]/page.tsx` で `notFound()` が実行される。  
   - `getPlaceDetail` の null 戻り: 【lib/places/detail.ts:348-368】  
   - notFound 発火: 【app/place/[id]/page.tsx:172-174】

結論: **一覧と詳細の fallback データソースが不一致（snapshot vs `fallbackPlaces`）で、一覧に出るIDでも詳細が 404 になり得る実装**。

## 7) 最終結論（マージ可否）

- `origin` 修正は完了したが、ネットワーク制約で `origin/main` 同期は未達（環境要因）。
- 実装検証結果としては、**`/place/<id>` の遷移整合性にNGがあるため、現時点ではマージ不可**。
- `/accepts/*` と `/city/*` の Open Map パラメータ引継ぎは OK。
