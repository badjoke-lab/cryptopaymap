# CPM /map cluster↔pin 切替時の空白時間 調査レポート（調査のみ）

## ① 関連ファイル一覧

入口から実際の layer 管理まで、実際に参照したファイルは以下。

1. `app/(map)/map/page.tsx`
   - `/map` のページ入口。`MapClient` を直接返す。 (`12-14` 行)
2. `components/map/MapClient.tsx`
   - Leaflet map 初期化、`moveend/zoomend` イベント、fetch、state 更新、cluster/pin layer 差し替えの実体。
3. `components/map/supercluster.ts`
   - place-level の cluster/pin 計算 (`createSuperclusterIndex`)。
4. `app/api/places/overview/route.ts`
   - overview API 実装（`bbox`,`zoom` 受理）。
5. `app/api/places/route.ts`
   - place-level API 実装（`bbox`,`limit` 等受理）。

---

## ② イベント発火 → fetch開始 → state更新 → layer remove/add の時系列

### 2-1. /map 入口

- `/map` は `MapPage` が `MapClient` を返して開始する。 (`app/(map)/map/page.tsx` `12-14` 行)

### 2-2. map イベント発火

- Leaflet に `moveend zoomend` を登録しており、いずれでも `handleMapViewChange` が実行される。 (`components/map/MapClient.tsx` `873` 行)
- `handleMapViewChange` の実行順は以下で固定。
  1) `scheduleFetchForBounds(...)`
  2) `updateVisibleMarkers()`
  (`868-871` 行)

### 2-3. fetch開始タイミング

- `scheduleFetchForBounds` は即 fetch しない。`window.setTimeout(..., 120)` で **120ms 遅延後** に fetch を開始する。 (`850-866` 行)
- 実 fetch 開始は `fetchOverviewForBbox` / `fetchPlacesForBbox` の先頭で、ここで `isFetchingMarkersRef.current = true` になる。 (`665`, `762` 行)
- したがって、`handleMapViewChange` 直後に呼ばれる `updateVisibleMarkers()` 実行時点では、まだ `isFetchingMarkersRef` は true でない区間がある。

### 2-4. layer remove/add の実装順

- `renderClusters` は `nextLayer` を構築し、完了時に
  1) `nextLayer.addTo(map)`
  2) `markerLayerRef.current = nextLayer`
  3) `map.removeLayer(previousLayer)`
  の順で差し替える。 (`509-514` 行)
- 旧 layer を先に remove する実装はない（remove は add 後）。

### 2-5. ただし「空配列描画」の場合

- `updateVisibleMarkers` は `clusterIndexRef.current.getClusters(bbox, zoom)` の結果をそのまま `renderClusters(clusters)` に渡す。 (`532-534` 行)
- `renderClusters` は `clusters.length === 0` でも実行されうる。抑止条件は
  - `clusters.length === 0`
  - `isFetchingMarkersRef.current === true`
  - `markersRef.current.size > 0`
  の全成立時のみ return。 (`425-427` 行)
- 上記が成立しない状態で `clusters=[]` が来ると、空の `nextLayer` が add され、旧 layer が remove されるため、地図上の marker は 0 になる。 (`443`, `509-514` 行)

### 2-6. overview / place-level 切替条件

- `pending.zoom <= OVERVIEW_MAX_ZOOM(=3)` で overview API (`/api/places/overview`)。
- それ以外は place-level API (`/api/places`)。 (`41`, `855-865` 行)

### 2-7. filters 変更時の追加遅延

- filters 変更時は別 `useEffect` で `fetchPlacesRef.current?.()` を `150ms` 後に呼ぶ。 (`1006-1013` 行)

---

## ③ 空白の主因（断定）

### 主因: **A. fetch開始前に旧表示が消える経路が実装されている**

以下を根拠に断定する。

1. `moveend/zoomend` 直後、`updateVisibleMarkers()` が fetch より先に呼ばれる。 (`868-871` 行)
2. fetch 自体は `120ms` 後に遅延開始で、その前は `isFetchingMarkersRef` が true にならない。 (`850-866`, `665`, `762` 行)
3. その間に `updateVisibleMarkers` が stale な `clusterIndexRef` と新 bbox/zoom で `clusters=[]` を返した場合、空 layer に差し替えて旧 layer を remove する。 (`521-534`, `425-427`, `509-514` 行)

この経路は「新データ ready 前に無表示へ遷移する」実装であり、体感上の「一度消えてから戻る」を直接発生させる。

---

## ④ 副因（該当あり）

### 副因1: **C. 120ms debounce が空白時間を延ばす**

- fetch 起動が `setTimeout(..., 120)` で必ず遅れるため、主因で無表示化した後の復帰開始が最低 120ms 後になる。 (`850-866` 行)

### 副因2: **C. filters 変更時の 150ms 遅延 fetch がさらに待ちを増やす**

- filters 変更時は `150ms` 後に fetch トリガ。 (`1006-1013` 行)

### B分類について

- `AbortController` による cancel (`643-645`, `743-745`) と `requestId` による stale 応答無視 (`689`, `793`) は実装されている。
- 本件の空白を直接生む箇所としては、上記 B より、A+C 経路がコード上で直接確認できる。

---

## ⑤ 最小修正案（3案まで）

※今回は修正禁止のため、案のみ提示。

1. **旧 layer を新 layer ready まで保持（A対策）**
   - `handleMapViewChange` で fetch前の `updateVisibleMarkers()` を抑制し、fetch成功時の `buildIndexAndRender` / `renderClusters` でのみ差し替える。
2. **空配列時の差し替えガードを強化（A対策）**
   - `clusters.length===0` かつ「新 fetch 完了前」は常に差し替え禁止にする（現行ガードは `isFetchingMarkersRef===true` 条件に依存し、fetch開始前窓を取りこぼす）。
3. **取得抑制のキー粒度を緩和（C対策）**
   - `bbox` を丸めた近似キー（現状 3 桁）と zoom 近似で同一視する範囲を広げ、再取得頻度を下げる。

---

## ⑥ どの案が最小で効くか（推奨）

**推奨: 案1（`handleMapViewChange` で fetch前 `updateVisibleMarkers()` を抑制）**

理由:
- 主因の発火点が `handleMapViewChange` の同期待ち順序（fetch予約→即 `updateVisibleMarkers`）であり、ここを止めるのが最短で直撃するため。 (`868-871`, `850-866`, `521-534` 行)

---

## ⑦ 修正PRで触るべきファイル一覧

1. `components/map/MapClient.tsx`
   - `handleMapViewChange` (`868-871`)
   - `scheduleFetchForBounds` (`839-866`)
   - `renderClusters` の空配列ガード (`425-427`)
   - 必要なら request/layer 切替状態管理 ref 群（同ファイル内）

2. （必要に応じて）`components/map/map.css`
   - 見た目上のフェード/ちらつき抑制を追加する場合のみ

