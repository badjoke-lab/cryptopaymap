# STEP7 — Vercel 最終化

## ローカル
```bash
npm install
cp .env.example .env.local

# places 実データを配置（STEP4のpublic/data/placesをコピー）
# cp -R ../cryptopaymap_STEP4/public/data/places ./public/data/

npm run build:agg
npm run news:fetch
npm run news:build
npm run dev
```

## Vercel
- Build Command: `next build`（`prebuild`で集計とニュース処理が自動実行）
- Env(Production):
  - `FEATURE_NOINDEX=false`
  - `NEWS_FETCH=off`（初期はoff推奨）
  - 必要なら `NEXT_PUBLIC_MAP_TILES_URL` を設定
- データ: `public/data/places/**` を**リポジトリに含めて**デプロイ

## 変更点
- Leaflet をクライアント限定で読み込み（SSR安全）
- モバイルヘッダの崩れ修正
- 簡易ニュースフェッチャ（RSS）。`NEWS_FETCH=on` で動作
