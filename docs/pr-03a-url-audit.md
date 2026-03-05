# PR-03a URL統一（/places→/place）監査メモ

## 1) PR-03a差分確認
- Commit: `e72b958` (`fix: unify internal place detail link to /place/[id] (#338)`)
- 変更ファイル: `components/internal/SubmissionDetail.tsx`
- 変更内容: toast内の詳細リンクを `href={`/places/${toast.placeId}`}` から `href={`/place/${toast.placeId}`}` に1行のみ修正。
- 変更理由: 正規詳細ページが `/place/[id]` のため、誤ルート `/places/${id}` 生成を是正。

## 2) 残骸スキャン
実行コマンド:

```bash
rg -n '"/places/|/places/\$\{|href=.*\/places\/|router\.(push|replace)\(.*\/places\/' app components -S
```

出力:

```text
components/map/MapClient.tsx:810:    safeFetch<Place>(`/api/places/${selectedPlaceId}`, {
```

- ヒットは API エンドポイント `/api/places/...` のみで、ページ遷移リンク `/places/...` の生成は検出なし。

## 3) 正規ルート確認（/place/[id]）
実行コマンド:

```bash
find app -type f -maxdepth 5 | rg -n 'app/.*/place|place/\[|/place/' -S
```

出力:

```text
29:app/place/[id]/page.tsx
46:app/api/places/route.ts
47:app/api/places/[id]/route.ts
48:app/api/places/by-id/route.ts
```

- ページルートとしては `app/place/[id]/page.tsx` のみ。
- その他は `/api/places/*` の API ルート。

## 4) 最低限テスト
- `npm run lint`: 成功（既存 Warning のみ）
- `npm run build`: 成功（既存 Warning のみ）

## 結論
- PR-03a は **OK（最小差分で整合）**。
- `/places/${id}` のリンク生成残骸は今回スキャン範囲（`app`, `components`）では検出なし。
