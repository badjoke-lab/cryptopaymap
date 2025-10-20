# 📘 docs/submission-to-map-policy.md

## 目的

この文書は、CryptoPayMap における **「新規申請 → マップ描画」までのデータフローとルール**を整理した方針書である。Owner / Community / Report の 3 種フォームを統一的に扱い、位置情報の扱い（住所・座標）を含めたデータ運用を標準化する。

---

## 🧭 基本原則

* **ユーザーは座標（lat/lng）を知らなくてOK。** 住所・都市・国があれば受理。
* **マップ描画は座標が確定したレコードのみ。** 承認（OPS）段階で座標を補完する。
* **Owner が座標を入れてきた場合は優先採用（ただし範囲チェックあり）**。
* **Report フォームは位置修正や閉店報告用で、マップには出さない。**

---

## 🧩 フォーム別の用途と入力フィールド

| フォーム          | 主な用途    | 必須項目                                     | 任意項目                                        | 備考               |
| ------------- | ------- | ---------------------------------------- | ------------------------------------------- | ---------------- |
| **Owner**     | 新規登録・修正 | Business name / Address / City / Country | Website / lat / lng / 画像                    | 店舗オーナー提出。信頼度高。   |
| **Community** | 新規登録・修正 | Address / City / Country                 | Website / lat / lng                         | 一般ユーザー投稿。レビュー必須。 |
| **Report**    | 既存修正専用  | placeId / Report type / Reason           | proposed_lat / proposed_lng / evidence_urls | 修正・閉店報告。非公開。     |

📍 **lat/lng は任意入力。** 入力されていれば即利用、なければ後段で住所から自動取得する。

---

## 🔄 データフロー（例付き）

### **Step 0: フォーム入力（例：Owner 新規申請）**

```json
{
  "Business name": "Satoshi Coffee",
  "Address": "1-2-3 Shibuya",
  "City": "Tokyo",
  "Country": "Japan",
  "Website": "https://satoshicoffee.jp",
  "lat": 35.658034,
  "lng": 139.701636
}
```

→ `submissions/owner/satoshi-coffee-2025-10-17.json` に保存。

---

### **Step 1: 事前分類（importSubmissions.ts）**

* `placeId` が既存なら **編集扱い（Edit）**。
* 無ければ **新規（New）**。

---

### **Step 2: 座標確定**

| 入力状況                      | 動作             | 結果                  |
| ------------------------- | -------------- | ------------------- |
| Ownerがlat/lngあり           | 妥当性チェック後に採用    | 精度高・即描画可            |
| Owner/Communityがlat/lngなし | 住所から自動ジオコード    | 成功→採用 / 失敗→review保留 |
| Reportでproposed_lat/lngあり | レビュー必須（即反映しない） | 承認後に更新              |

📌 **例:** 住所からジオコード結果が曖昧（候補3件）なら、OPSが1つ選び、`location.source="ops_fix"` としてplacesに記録。

---

### **Step 3: 反映（places更新）**

#### 新規作成

```json
{
  "id": "cpm:tokyo/satoshi-coffee",
  "name": "Satoshi Coffee",
  "lat": 35.658034,
  "lng": 139.701636,
  "address": "1-2-3 Shibuya, Tokyo, Japan",
  "verification": { "status": "owner" },
  "location": { "source": "owner_gps", "confidence": "high" }
}
```

#### 修正（例：Reportで位置ズレ）

```json
{
  "id": "cpm:tokyo/satoshi-coffee",
  "history": [
    {
      "at": "2025-10-20",
      "type": "position_change",
      "from": { "lat": 35.658034, "lng": 139.701636 },
      "to": { "lat": 35.657900, "lng": 139.701700 },
      "reason": "Google Maps座標の更新",
      "by": "report:community",
      "evidence": ["https://maps.google.com/..."]
    }
  ]
}
```

---

## 📏 距離ベースの更新ルール

| 移動距離    | 判定    | 扱い             |
| ------- | ----- | -------------- |
| ≤30m    | 小規模ズレ | 自動採用可（Ownerのみ） |
| 30–500m | 中規模修正 | 手動レビュー必須       |
| >500m   | 大幅変更  | 新規登録として扱う      |

✅ **距離計算:** Haversineで算出。レビュー画面で距離と旧座標を併記。

---

## 🧠 データ構造の補強提案

### submissions

```json
{
  "meta": { "kind": "owner", "submitted_at": "2025-10-17" },
  "fields": { "lat": 35.65, "lng": 139.70 }
}
```

### places

```json
{
  "location": { "source": "geocode", "confidence": "medium" },
  "history": []
}
```

---

## 🧾 承認フロー（OPS）

```
S0 提出（submissions）
 → S1 分類（新規 or 修正）
 → S2 座標確定（owner優先 / geocode補完）
 → S3 PR生成 → 承認 → places反映
```

**描画条件:** `lat/lng` があり、`verification.status` が `owner|community|ops`。

---

## 💡 実例まとめ

| ケース                   | 入力                 | 処理結果         |
| --------------------- | ------------------ | ------------ |
| 🆕 Ownerが住所だけ入力       | geocodeで座標補完       | 承認後マップ描画可    |
| 🧭 Ownerが正確なlat/lng入力 | そのままplaces反映       | 即マップ反映       |
| 🪧 Communityが住所だけ     | geocode + review   | マップ反映は承認後    |
| 🧱 Reportがズレ指摘        | proposed_lat/lng付き | review後に位置更新 |

---

## 🚦 優先順位まとめ

1. **Owner 提出（最優先）**：直接採用 or 軽レビュー。
2. **Community 提出**：レビュー経由。
3. **Report 提出**：レビュー後反映。マップ非表示。

---

## 🔒 品質保証

* lat/lngは範囲チェック（-90～90, -180～180）
* 同一名前 ±50m以内は重複警告
* Address/City/Countryの再正規化（trim + toTitleCase）
* `notes` にジオコード元・証拠URLを記録（例：`source: nominatim, 2025-10-17`）

---

## 🧾 将来拡張案

* フォームに地図ピッカー追加（lat/lng自動入力）
* Review画面で提案座標と旧座標を地図上比較
* `ops_fix` レイヤでOPSが微修正を直接記録できるUI

---

✅ **この方針により：**

* 新規申請でも位置不明問題を解消
* 既存修正も統一ルールで扱える
* マップ描画は常に正確な座標に基づき安定表示
