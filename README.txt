# CryptoPayMap Autopilot Kit

このZIPをリポジトリに展開して、以下を行ってください：
1) Neon登録→PostGIS有効化 `CREATE EXTENSION postgis;`
2) Vercel: `DATABASE_URL`（pooled）, `NEXT_PUBLIC_DATA_SOURCE=json`, `OPS_TOKEN`
3) GitHub Secrets: `ETL_DATABASE_URL`（direct/unpooled）
4) Actions: `etl-sync` → `Run workflow`（スキーマ適用＆ETL）
5) 必要なら `gen-stats` 実行
6) 切替: `NEXT_PUBLIC_DATA_SOURCE=db` に変更してデプロイ

依存ライブラリ（package.json に追加）:
- pg, fast-glob, zod, tsx
スクリプト:
- "cpm:etl": "tsx scripts/json-to-db.ts"
- "cpm:stats": "tsx scripts/gen-stats.ts"
