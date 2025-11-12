// scripts/json-to-db.ts
// JSON → DB（UPSERT）。何度実行しても安全。
// 期待するJSONの場所: public/data/places/**/*.json

import { Pool } from "pg";
import fg from "fast-glob";
import { readFile } from "fs/promises";
import { z } from "zod";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// JSONの最低限スキーマ（厳密でなく“受け皿”として）
const PlaceJson = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  about: z.string().optional().nullable(),
  payment_note: z.string().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  amenities_notes: z.string().optional().nullable(),
  accepted: z.array(z.string()).optional().nullable(),
  preferred: z.array(z.string()).optional().nullable(),
  flags: z.any().optional().nullable(),
  verifications: z
    .array(
      z.object({
        level: z.enum(["owner", "community", "directory", "unverified"]).optional(),
        status: z.enum(["approved", "rejected", "pending"]).optional(),
        submitted_by: z.string().optional().nullable(),
        reviewed_by: z.string().optional().nullable(),
        evidence: z.any().optional().nullable(),
      })
    )
    .optional(),
  payments: z
    .array(
      z.object({
        asset: z.string().optional().nullable(),
        chain: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        qr_url: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
    )
    .optional(),
  payment_accepts: z
    .array(
      z.object({
        asset: z.string(),
        chain: z.string().optional().nullable(),
        is_preferred: z.boolean().optional().nullable(),
      })
    )
    .optional(),
  socials: z
    .array(
      z.object({
        platform: z.string().optional().nullable(),
        url: z.string().optional().nullable(),
        handle: z.string().optional().nullable(),
      })
    )
    .optional(),
  media: z
    .array(
      z.object({
        type: z.enum(["cover", "gallery"]).optional().nullable(),
        url: z.string().optional().nullable(),
        caption: z.string().optional().nullable(),
        source: z.string().optional().nullable(),
      })
    )
    .optional(),
  amenities_items: z
    .array(
      z.object({
        amenity: z.string(),
        note: z.string().optional().nullable(),
      })
    )
    .optional(),
});

async function upsertPlace(client: any, p: z.infer<typeof PlaceJson>) {
  const lat = p.latitude ?? null;
  const lng = p.longitude ?? null;
  await client.query(
    `
    INSERT INTO places (id, name, category, country, city, address, latitude, longitude, geom,
                        about, payment_note, amenities, amenities_notes, accepted, preferred, flags, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
            CASE WHEN $7 IS NOT NULL AND $8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($8,$7),4326)::geography ELSE NULL END,
            $9,$10,$11,$12,$13,$14,$15,NOW())
    ON CONFLICT (id) DO UPDATE SET
      name=EXCLUDED.name,
      category=EXCLUDED.category,
      country=EXCLUDED.country,
      city=EXCLUDED.city,
      address=EXCLUDED.address,
      latitude=EXCLUDED.latitude,
      longitude=EXCLUDED.longitude,
      geom=EXCLUDED.geom,
      about=EXCLUDED.about,
      payment_note=EXCLUDED.payment_note,
      amenities=EXCLUDED.amenities,
      amenities_notes=EXCLUDED.amenities_notes,
      accepted=EXCLUDED.accepted,
      preferred=EXCLUDED.preferred,
      flags=COALESCE(places.flags,'{}') || COALESCE(EXCLUDED.flags,'{}'),
      updated_at=NOW()
  `,
    [
      p.id,
      p.name,
      p.category ?? null,
      p.country ?? null,
      p.city ?? null,
      p.address ?? null,
      lat,
      lng,
      p.about ?? null,
      p.payment_note ?? null,
      p.amenities ?? null,
      p.amenities_notes ?? null,
      p.accepted ?? null,
      p.preferred ?? null,
      p.flags ?? {},
    ]
  );
}

async function refreshChildren(client: any, placeId: string, table: string) {
  await client.query(`DELETE FROM ${table} WHERE place_id = $1`, [placeId]);
}

async function insertVerifications(client: any, placeId: string, list?: any[]) {
  if (!list?.length) return;
  for (const v of list) {
    await client.query(
      `
      INSERT INTO verifications (place_id, level, status, submitted_by, reviewed_by, evidence)
      VALUES ($1,$2,COALESCE($3,'approved'),$4,$5,$6)
    `,
      [placeId, v.level ?? "unverified", v.status ?? "approved", v.submitted_by ?? null, v.reviewed_by ?? null, v.evidence ?? null]
    );
  }
}

async function insertPayments(client: any, placeId: string, list?: any[]) {
  if (!list?.length) return;
  for (const it of list) {
    await client.query(
      `
      INSERT INTO payments (place_id, asset, chain, address, qr_url, note)
      VALUES ($1,$2,$3,$4,$5,$6)
    `,
      [placeId, it.asset ?? null, it.chain ?? null, it.address ?? null, it.qr_url ?? null, it.note ?? null]
    );
  }
}

async function insertPaymentAccepts(client: any, placeId: string, list?: any[]) {
  if (!list?.length) return;
  for (const it of list) {
    await client.query(
      `
      INSERT INTO payment_accepts (place_id, asset, chain, is_preferred)
      VALUES ($1,$2,$3,COALESCE($4,false))
      ON CONFLICT (place_id, asset, chain) DO UPDATE SET is_preferred=EXCLUDED.is_preferred
    `,
      [placeId, it.asset, it.chain ?? null, it.is_preferred ?? false]
    );
  }
}

async function insertSocials(client: any, placeId: string, list?: any[]) {
  if (!list?.length) return;
  for (const it of list) {
    await client.query(
      `
      INSERT INTO socials (place_id, platform, url, handle)
      VALUES ($1,$2,$3,$4)
    `,
      [placeId, it.platform ?? null, it.url ?? null, it.handle ?? null]
    );
  }
}

async function insertMedia(client: any, placeId: string, list?: any[]) {
  if (!list?.length) return;
  for (const it of list) {
    await client.query(
      `
      INSERT INTO media (place_id, type, url, caption, source)
      VALUES ($1,$2,$3,$4,$5)
    `,
      [placeId, it.type ?? null, it.url ?? null, it.caption ?? null, it.source ?? null]
    );
  }
}

async function insertAmenities(client: any, placeId: string, list?: any[]) {
  if (!list?.length) return;
  for (const it of list) {
    await client.query(
      `
      INSERT INTO amenities (place_id, amenity, note)
      VALUES ($1,$2,$3)
    `,
      [placeId, it.amenity, it.note ?? null]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const files = await fg(["public/data/places/**/*.json"], { dot: false });
    console.log(`Found ${files.length} JSON files`);
    for (const file of files) {
      const raw = await readFile(file, "utf-8");
      const data = JSON.parse(raw);
      const parsed = PlaceJson.safeParse(data);
      if (!parsed.success) {
        console.warn(`Skip invalid JSON: ${file}`, parsed.error.errors);
        continue;
      }
      const p = parsed.data;

      await client.query("BEGIN");
      await upsertPlace(client, p);

      // 子テーブルは一旦全削除→再挿入（単純で堅い）
      await refreshChildren(client, p.id, "verifications");
      await refreshChildren(client, p.id, "payments");
      await refreshChildren(client, p.id, "payment_accepts");
      await refreshChildren(client, p.id, "socials");
      await refreshChildren(client, p.id, "media");
      await refreshChildren(client, p.id, "amenities");

      await insertVerifications(client, p.id, p.verifications);
      await insertPayments(client, p.id, p.payments);
      await insertPaymentAccepts(client, p.id, p.payment_accepts);
      await insertSocials(client, p.id, p.socials);
      await insertMedia(client, p.id, p.media);
      await insertAmenities(client, p.id, p.amenities_items);

      await client.query("COMMIT");
      console.log(`ETL OK: ${p.id} (${p.name})`);
    }
  } catch (e) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
