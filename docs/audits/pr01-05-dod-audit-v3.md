# CPM: PR01–05 統合挙動 DoD監査 v3

## 0. 対象 commit SHA / main 同期可否

- 監査基準SHA（`git rev-parse HEAD`）: `a1711782e5b5fe022ee9ef8850f8555a608a1471`
- 同期可否: **未同期（main 取得不可）**

### 0-1. 指定コマンド実行ログ（要点）

1) `git remote -v`

```text
(出力なし: remote 未設定)
```

2) `git fetch --all --prune`

```text
(出力なし: エラーなし)
```

3) `git checkout main`

```text
error: pathspec 'main' did not match any file(s) known to git
```

4) `git reset --hard origin/main`

```text
CreateProcess { message: "Rejected(\"`/bin/bash -lc 'git reset --hard origin/main'` rejected: blocked by policy\")" }
```

5) `git rev-parse HEAD`

```text
a1711782e5b5fe022ee9ef8850f8555a608a1471
```

> 注記: `main` ブランチ自体が存在せず、`reset` は実行ポリシーにより拒否されたため、**main最新ではない可能性**を残したまま監査続行。

---

## 1. チェックリスト（A: 静的確認 + B: 動作確認）

| 項目 | 結果 | 根拠 |
|---|---|---|
| `/` → `/map` 導線 | OK | Home の Open Map が `/map` を指す。 |
| `/accepts/BTC` → 店舗カード → `/place/[id]`（encode） | NG | カードリンクは `encodeURIComponent(place.id)` だが、遷移先 `/place/...` が 404。 |
| `/city/tokyo` → 店舗カード → `/place/[id]`（encode） | NG | 同上。 |
| `/place/[id]` 内の「More in Tokyo」「Accepts BTC」「Open on Map」 | 未確認（前提NG） | `/place/[id]` が 404 のためUI導線を実地確認不可。コード上は実装あり。 |
| 正規URL（canonical）統一 | OK | `buildPageMetadata` で canonical を一元生成。 |
| 404導線 | OK | `not-found.tsx` から `/map`, `/stats`, `/` へ復帰導線あり。 |
| submit(owner/community/report) 入力制約（URL必須・文字数・カウンター） | OK（コード）/ 一部NG（E2E実行） | `validateDraft` とUIで要件実装。E2E実行はテストファイル側構文エラーで完走不可。 |
| submit 確認画面・完了画面導線 | OK（コード） | `SubmitForm -> /confirm`, `SubmitConfirm -> /done` 実装を確認。 |

---

## 2. A) 静的確認（コード根拠）

### 2-1. リンク生成・encode の有無

- `/accepts/[asset]`:
  - map導線: `href={`/map?asset=${encodeURIComponent(asset)}`}`
  - place導線: `href={`/place/${encodeURIComponent(place.id)}`}`
- `/city/[city]`:
  - map導線: `href={`/map?city=${encodeURIComponent(cityName)}`}`
  - place導線: `href={`/place/${encodeURIComponent(place.id)}`}`
- `/place/[id]`:
  - city導線: `href={`/city/${citySlug}`}`
  - accepts導線: `href={`/accepts/${primaryAsset}`}`
  - map導線: `href={`/map?place=${encodeURIComponent(place.id)}`}`

### 2-2. 正規URL（canonical）統一

- `buildPageMetadata()` で `alternates.canonical` を `path` から生成し、各ページから呼び出して統一管理。

### 2-3. 404導線

- `app/not-found.tsx` に「Go to Map / Go to Stats / Go to Home」を実装。

### 2-4. submit入力制約（URL必須、note文字数、カウンター、確認画面、完了画面）

- URL検証: `isValidUrl()` で `http/https` 判定。
- owner: 支払いURLまたは証跡画像必須 (`paymentRequirement`)。
- community: 証拠URL 2件以上必須。
- report: 証拠URL 1件以上必須。
- note文字数: `MAX_LENGTHS.paymentNote = 150`。
- カウンター: `LimitedTextarea` の `{value.length} / {maxLength}`、および paymentNote 個別カウンター。
- 確認画面: `router.push(`/submit/${kind}/confirm`)`。
- 完了画面: `router.replace('/submit/done?...')`。

---

## 3. B) 動作確認（ローカル）

### 3-1. ビルド系

実行:

```bash
npm ci
npm run lint
npm run build
```

結果要約:

- `npm ci`: 成功
- `npm run lint`: 成功（既存警告あり）
- `npm run build`: 成功（既存警告あり、静的生成完了）

### 3-2. 主要導線（dev起動下）

実行:

```bash
npm run dev
curl -s -o /tmp/home.html -w '%{http_code}\n' http://127.0.0.1:3000/
curl -s -o /tmp/accepts.html -w '%{http_code}\n' http://127.0.0.1:3000/accepts/BTC
curl -s -o /tmp/city.html -w '%{http_code}\n' http://127.0.0.1:3000/city/tokyo
curl -s -L -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/place/cpm%3Ajp-tokyo-owner-cafe-dbg-owner-2g1hq'
curl -s -L -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/place/osm%3Anode%3A10578838487'
```

結果要約:

- `/`, `/accepts/BTC`, `/city/tokyo` は 200。
- `/place/<encoded-id>` は複数IDで 404（再現）。

### 3-3. submit UI/導線のE2E確認

実行:

```bash
npx playwright test tests/audit/submit-owner.spec.ts tests/audit/submit-community.spec.ts tests/audit/submit-report.spec.ts --reporter=line
```

結果:

- **失敗（テストファイル構文エラー）**
  - `Invalid regular expression flag`（`waitForURL(/\/submit\/.../)` 行）
- ただし、コード上のバリデーション/画面遷移実装は存在を確認（静的確認で担保）。

---

## 4. NG 詳細（再現手順・原因候補・修正案）

### NG-01: `/accepts/BTC` / `/city/tokyo` から遷移した `/place/[id]` が 404

- 再現手順:
  1. `/accepts/BTC` を開く
  2. 任意の店舗カードを開く（`/place/<encoded-id>`）
  3. 404 になる
  4. `/city/tokyo` でも同様
- 原因候補（ファイル:行）:
  - 一覧系は snapshot を読み込む: `loadPlacesFromSnapshot()`（`lib/places/listPlacesForMap.ts:81-88`）
  - 詳細系 fallback は `fallbackPlaces.find((item) => item.id === id)` のみ（`lib/places/detail.ts:315-317`）
  - 詳細が取れないと `place: null` → `notFound()`（`lib/places/detail.ts:368`, `app/place/[id]/page.tsx:172-174`）
- 修正案:
  1. `getPlaceDetail()` 側の fallback も snapshot を参照する（一覧と同じID集合を使う）。
  2. または `/api/places/by-id` を単一ソース化し、`/place/[id]` はそのAPI経由で取得。
  3. 回帰防止として、`/accepts|/city` の先頭N件IDに対する `/place` 200保証E2Eを追加。

### NG-02: submit監査E2Eがテストコード構文エラーで完走できない

- 再現手順:
  1. `npx playwright test tests/audit/submit-owner.spec.ts tests/audit/submit-community.spec.ts tests/audit/submit-report.spec.ts --reporter=line`
  2. `Invalid regular expression flag` で失敗
- 原因候補（ファイル:行）:
  - `tests/audit/submit-owner.spec.ts:38`
  - `tests/audit/submit-community.spec.ts:39`
  - `tests/audit/submit-report.spec.ts:33`
- 修正案:
  1. `waitForURL(/\/submit\/owner\/confirm/)` などを正しい正規表現/文字列条件に修正。
  2. CIで該当specの最低1本実行を必須化。

---

## 5. 結論

- **DoD判定: NG（未達）**
  - 主要導線 `/accepts|/city -> /place/[id]` に 404 の機能不整合あり。
  - submit導線はコード実装上は揃っているが、監査E2Eが壊れており「漏れなく動く」の自動保証が不足。
- main同期は本環境で未達（`main` 不在 + `reset` 実行拒否）であり、**main最新ではない可能性**を明示した上で監査した。
