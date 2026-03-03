# submit uploads audit (Owner / Community / Report)

- 調査日: 2026-03-03
- 対象: submit フローの画像添付（gallery / proof / evidence）
- 制約: コード修正なし（調査のみ）

## A. 現状フロー図（Owner / Community / Report）

### A-1. 入力UI（file input）
- Owner proof（支払いスクショ）: `components/submit/SubmitForm.tsx` の `input type="file"`（`multiple` なし）。(components/submit/SubmitForm.tsx:670-672)
- Owner/Community gallery: `input type="file" multiple`。`handleFileAdd("gallery", ...)` に渡す。(components/submit/SubmitForm.tsx:681-687)
- Report evidence: `input type="file" multiple`。`handleFileAdd("evidence", ...)` に渡す。(components/submit/SubmitForm.tsx:694-700)

### A-2. state保持（単数/配列）
- 添付stateは `SubmissionDraftFiles`（`gallery/proof/evidence` すべて `StoredFile[]`）で保持。(components/submit/types.ts:65-69)
- 初期値も配列。（`emptyFiles`）(components/submit/SubmitForm.tsx:17)
- 追加処理は既存配列をコピーして push（追記方式）。(components/submit/SubmitForm.tsx:183, 201, 205)
- セッション保存は `saveDraftBundle`。画像は `dataUrl` 化して保持。(components/submit/draftStorage.ts:17-29, 53-62)

### A-3. validation（形式/サイズ/枚数/必須）
- フロント共通定数: MIME `jpeg/png/webp`、2MB、上限 owner(8/1/0) community(4/0/0) report(0/0/4)。(components/submit/constants.ts:3-10)
- 追加時チェック: limit 超過で `Maximum N file(s)`、2MB超過、MIME不一致を弾く（違反ファイルは `continue` でスキップ）。(components/submit/SubmitForm.tsx:187-199)
- 送信前チェック（confirm前/最終送信前）: `validateDraft` で枚数/MIME/サイズ再検証。(components/submit/SubmitForm.tsx:216-220, components/submit/SubmitConfirm.tsx:135-137, components/submit/validation.ts:240-252)
- Ownerのみ「paymentUrl または proof 必須」。(components/submit/validation.ts:81-91)

### A-4. payload組み立て（FormData key）
- JSON payload は `buildSubmissionPayload` で作成（画像は含まない）。(components/submit/payload.ts:31-87)
- multipart組み立ては `submitMultipartSubmission`：`payload` キーにJSON文字列、ファイルは `gallery/proof/evidence` キーで `append` を繰り返す（複数対応）。(lib/submissions/client.ts:31-37)

### A-5. API送信先
- フロント送信先: `POST /api/submissions`。(lib/submissions/client.ts:40-43)
- ルート実装: `app/api/submissions/route.ts`。multipartなら `parseMultipartSubmission` を使用。(app/api/submissions/route.ts:56-58)

### A-6. backend multipart受信（単数/複数, key一致）
- 受信可能 file key は `proof|gallery|evidence` 固定。(lib/submissions/parseMultipart.ts:1, 25-29)
- 各 key は `form.getAll(field)` で `File[]` 取得（複数受信）。(lib/submissions/parseMultipart.ts:85-87)
- 想定外 key は `unexpectedFileFields` に集約して拒否。(lib/submissions/parseMultipart.ts:89-93, lib/submissions/validateMultipart.ts:153-161)

### A-7. backend validation・保存
- 種別ごとの許可 field と枚数上限: owner(proof<=4,gallery<=8), community(gallery<=4), report(evidence<=4)。(lib/submissions/validateMultipart.ts:32-54)
- MIME/サイズ検証あり（jpeg/png/webp, 2MB）。(lib/submissions/validateMultipart.ts:24-25, 113-127)
- 受理後、全ファイルを走査して画像処理→R2アップロード→`submission_media` へINSERT。(lib/submissions.ts:903-928)

### A-8. 保存先とメタデータ
- オブジェクト保存先は Cloudflare R2（S3 client）。(lib/storage/r2.ts:1, 33-53)
- key 形式: `submissions/{submissionId}/{kind}/{mediaId}.webp`。(lib/storage/r2.ts:50-54)
- DBメタは `submission_media` に `kind, media_id, r2_key, mime, width, height, url` 等を保存。(lib/db/media.ts:84-104)

### A-9. confirm表示
- submit confirm では「ファイル名リストのみ」表示（サムネなし）。(components/submit/SubmitConfirm.tsx:292-305)
- internal 画面では DBの `ORDER BY id ASC` で media を読み、`MediaPreviewGrid` で画像表示可能。(app/api/internal/submissions/[id]/route.ts:149-151, 166-176, components/internal/MediaPreviewGrid.tsx:49-65)

---

## B. “something went wrong” の発生源特定

### B-1. 文言の定義箇所
- グローバルエラーページ見出し: `Something went wrong`。(app/error.tsx:26)
- internal用 ErrorBox のフォールバック文言: `Something went wrong.`。(components/internal/ErrorBox.tsx:9)

### B-2. submitフロー上のエラーハンドリング
- SubmitConfirm は APIエラー時に `result.error.message` または `Submission failed.` を表示し、`something went wrong` は直接使っていない。(components/submit/SubmitConfirm.tsx:162-171, lib/submissions/client.ts:51)
- したがって submit操作中に「something went wrong」が見える場合、**このコンポーネント外（例: グローバルエラー境界）で例外が発生している**構造。

### B-3. 複数選択時に落ちる可能性のある箇所（断定）
1) **フロントとバックの proof 上限不一致**
- フロントは owner proof を実質1枚UI（`multiple`なし / 文言1 max / 定数1）。(components/submit/SubmitForm.tsx:670-672, components/submit/constants.ts:7)
- しかしバックは owner proof を最大4枚許可。(lib/submissions/validateMultipart.ts:34)
- 仕様の不一致があり、今後UIで複数proof対応を入れる際に判定分岐が分裂するのは確定。

2) **backendは「1件でも違反があると全体reject」**
- `validateFiles` は最初の不正ファイルで `return error` し、部分成功設計ではない。(lib/submissions/validateMultipart.ts:136-141)
- 複数選択時、1枚NGで全送信失敗になりやすい実装。

3) **SubmitConfirmの添付表示はファイル名のみでプレビュー文脈が不足**
- 並べ替え・視覚確認なしで最終送信されるため、ユーザーが「何を送るか」を誤認しやすい構造。(components/submit/SubmitConfirm.tsx:292-305)

---

## C. DoD適合性チェック（OK / NG / 不明）

| 要件 | 判定 | 根拠 |
|---|---|---|
| file picker 複数選択（multiple） | **部分OK** | gallery/evidence は `multiple`あり、owner proofは `multiple`なし。(components/submit/SubmitForm.tsx:671-672, 683-685, 696-698) |
| D&D実装有無 | **NG** | `SubmitForm.tsx` に dragenter/drop 等ハンドラなし、`input type=file` のみ。(components/submit/SubmitForm.tsx:670-700) |
| 追記方式か上書き方式か | **OK（追記）** | `nextFiles=[...files[field]]` へ push して set。(components/submit/SubmitForm.tsx:183, 201, 205) |
| 上限 owner=8, community=4, report=4（前後） | **部分NG** | gallery/evidence は前後一致、owner proof は front=1 / back=4 不一致。(components/submit/constants.ts:7-9, lib/submissions/validateMultipart.ts:34-47) |
| 2MB・JPEG/PNG/WebP（前後） | **OK** | front定数/検証あり、back定数/検証あり。(components/submit/constants.ts:3-4, components/submit/SubmitForm.tsx:192-197, lib/submissions/validateMultipart.ts:24-25, 113-127) |
| 違反だけ弾いて適合分追加（部分成功） | **フロント:OK / バック:NG** | front `continue` で違反だけ除外、backは1件NGで全体reject。(components/submit/SubmitForm.tsx:193-199, lib/submissions/validateMultipart.ts:136-141) |
| confirmでサムネ/順序表示可能か | **NG** | confirmはファイル名列挙のみ、サムネや順序UIなし。(components/submit/SubmitConfirm.tsx:292-305) |
| FormData key 名一致 | **OK** | front append key は `gallery/proof/evidence`、back受信 key 同一固定。(lib/submissions/client.ts:34-37, lib/submissions/parseMultipart.ts:1, 85-87) |
| backend複数ファイル受け取り対応 | **OK** | `form.getAll` + File[] 検証 + forループ保存で複数対応。(lib/submissions/parseMultipart.ts:85-87, lib/submissions/validateMultipart.ts:136-139, lib/submissions.ts:903-905) |

---

## D. 変更が必要な箇所リスト（漏れなく）

- [ ] `components/submit/SubmitForm.tsx`  
  添付UIを file picker + D&D + 複数追記 + 削除 + 並べ替え対応に再構成し、Payment URL と proof を同一セクションで近接配置する必要あり。現状は素の input と remove のみでD&D/並べ替えが未実装。(components/submit/SubmitForm.tsx:181-206, 663-703)

- [ ] `components/submit/validation.ts`  
  並べ替え後の順序保持前提でも検証できるよう、エラーキー設計（`field:file`）をUI部品と整合させる必要。現状は配列順を意識したエラー表現になっていない。(components/submit/validation.ts:240-250)

- [ ] `components/submit/payload.ts`  
  JSON payload自体は画像を持たないが、将来の順序反映（例: gallery order metadata）を送るならここに order 情報を載せる拡張が必要。現状は添付順序のメタが無い。(components/submit/payload.ts:31-87)

- [ ] `components/submit/SubmitConfirm.tsx`  
  confirmでサムネイル・順序を可視化する実装が必要。現状はファイル名一覧のみで、誤送信防止の確認性が不足。(components/submit/SubmitConfirm.tsx:145-149, 292-305)

- [ ] API route / handler（`app/api/submissions/route.ts`, `lib/submissions.ts`, `lib/submissions/validateMultipart.ts`）  
  部分成功ポリシーをbackendにも導入するか仕様確定が必要。現状は1件不正で全体400となるため、フロント部分成功と挙動不一致。(lib/submissions/validateMultipart.ts:136-141, lib/submissions.ts:999-1008, app/api/submissions/route.ts:110)

- [ ] アップロード保存処理（`lib/submissions.ts`, `lib/db/media.ts`, `lib/storage/r2.ts`）  
  並べ替え順を永続化するなら `submission_media` に sort列（またはpayload内 order）を追加してINSERT時保存が必要。現状は順序メタ保存なし。(lib/submissions.ts:903-928, lib/db/media.ts:84-104, lib/storage/r2.ts:50-54)

- [ ] internal表示（`app/api/internal/submissions/[id]/route.ts`, `components/internal/MediaPreviewGrid.tsx`, `components/internal/SubmissionDetail.tsx`）  
  submit側で順序を持たせる場合、internalもその順で表示/選択されるよう取得ORDERと描画順を揃える変更が必要。現状は `ORDER BY id ASC` + kindグループ描画のみ。(app/api/internal/submissions/[id]/route.ts:149-151, components/internal/MediaPreviewGrid.tsx:10-17, 44-49)

---

## E. 実装方針2案比較

### 案1: `react-dropzone` + `dnd-kit`（推奨）
- 影響範囲: `SubmitForm`（添付UI分離）、`SubmitConfirm`（サムネ表示）、必要なら順序メタを `payload`/backendへ拡張。  
- 新規ファイル（想定）: `components/submit/UploadGalleryField.tsx`, `components/submit/UploadThumbList.tsx`, `components/submit/uploadErrors.ts`。  
- 最小工数: 中。  
- リスク: 依存追加によるbundle増加、DNDアクセシビリティ調整。
- 適合性: D&D/並べ替え/複数追加を最短で安定実装しやすい。

### 案2: 依存追加なし（native drag events + 最小並べ替え）
- 影響範囲: `SubmitForm` のイベント処理を自前実装、`SubmitConfirm` も同様に自前プレビュー。  
- 新規ファイル（想定）: `components/submit/useUploadDnD.ts` 程度（任意）。  
- 最小工数: 小〜中（機能を削れば小）。  
- リスク: D&D境界条件（dragleave/drop重複、モバイル非対応）と並べ替え品質で不具合化しやすい。
- 適合性: 依存制約が厳しい場合の現実解。

---

## F. 受け入れテスト手順（コマンド + 目視）

### F-1. 事前
1. 開発サーバ起動: `npm run dev`
2. 画面: `/submit/owner`, `/submit/community`, `/submit/report`, internal submission detail。

### F-2. Owner
1. 8枚一括追加（gallery）→全て追加される。  
2. 9枚目追加→拒否＋理由表示。  
3. 並べ替え（新UI）→順序変更。  
4. Final submit→confirmでサムネ/順序一致→送信成功。  
5. internal詳細で表示順・promote選択対象が期待通り。

### F-3. Community / Report
- Community gallery 4枚上限、5枚目拒否。  
- Report evidence 4枚上限、5枚目拒否。

### F-4. 混在ファイル（部分成功）
- 正常画像 + 2MB超 + 非対応形式を同時投入。  
- 期待: 違反ファイルのみ拒否、適合ファイルは保持・送信可能（front/backの仕様統一後）。

### F-5. D&D
- 複数ファイルをドロップして一括追加。  
- 同一ファイル再追加時の扱い（重複許可/禁止）を仕様通り確認。

### F-6. エラーメッセージ品質
- 失敗時に `something went wrong` のみでなく、具体的理由（例: `FILE_TOO_LARGE`, `INVALID_MEDIA_TYPE`, `TOO_MANY_FILES`）が画面に出ること。現状backendはコード/メッセージを返している。(lib/submissions/validateMultipart.ts:8-12, 103-127, lib/submissions.ts:1005-1008)

### F-7. 監視ログ（確認ポイント）
- Browser Console: フロント例外有無、未処理rejection。  
- Network: `/api/submissions` の multipart payload key（`payload/gallery/proof/evidence`）と response `error.code/message`。  
- Server log: `[submissions] reject ... reason=...`、`UPLOAD_FAILED`、`MEDIA_PROCESSING_FAILED` 等。(lib/submissions.ts:971, 982-983, 1006-1007, 1025-1042)

---

## 実行コマンド記録
- `rg -n "gallery|screenshot|payment.*screen|FormData|multipart|upload|attachment|something went wrong" -S app components lib`
- `sed -n '1,260p' components/submit/SubmitForm.tsx`
- `sed -n '1,260p' components/submit/validation.ts`
- `sed -n '1,220p' components/submit/payload.ts`
- `sed -n '1,260p' components/submit/SubmitConfirm.tsx`
- `sed -n '1,220p' lib/submissions/client.ts`
- `sed -n '1,220p' app/api/submissions/route.ts`
- `sed -n '1,220p' lib/submissions/parseMultipart.ts`
- `sed -n '1,260p' lib/submissions/validateMultipart.ts`
- `sed -n '820,1085p' lib/submissions.ts`
- `sed -n '1,230p' lib/db/media.ts`
- `sed -n '1,220p' lib/storage/r2.ts`
- `sed -n '120,230p' app/api/internal/submissions/[id]/route.ts`
- `sed -n '1,160p' components/internal/MediaPreviewGrid.tsx`
- `sed -n '1,220p' components/internal/SubmissionDetail.tsx`
- `sed -n '1,80p' components/internal/ErrorBox.tsx`
- `sed -n '1,80p' app/error.tsx`
