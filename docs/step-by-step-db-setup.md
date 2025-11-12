# Step-by-step DB Setup (CryptoPayMap)

1. DBを用意（Neon推奨）：NeonのSQLエディタで `CREATE EXTENSION postgis;`
2. `psql "$ETL_DATABASE_URL" -f db/schema.sql` または Actions「etl-sync」を実行
3. `.env.local` に `DATABASE_URL`（Neon pooled）/ `NEXT_PUBLIC_DATA_SOURCE=json`
4. `pnpm cpm:etl` または Actions「etl-sync」でJSON→DB同期
5. 問題なければ `NEXT_PUBLIC_DATA_SOURCE=db` に切替デプロイ
