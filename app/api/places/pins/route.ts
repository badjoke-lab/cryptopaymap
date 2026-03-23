import { promises as fs } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { normalizeAcceptsAsset } from "@/lib/acceptsAsset";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { isLegacyOrDemoId, LEGACY_TEST_IDS } from "@/lib/places/legacyFilters";
import type { Place } from "@/types/places";

const DEFAULT_LIMIT = 20000;
const MAX_LIMIT = 25000;
const CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=120";
const NO_STORE = "no-store";
const FALLBACK_SNAPSHOT_FILE = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

type PinVerification = "owner" | "community" | "directory" | "unverified";

type PlacePin = {
  id: string;
  lat: number;
  lng: number;
  verification: PinVerification;
};

type PublishedSnapshot = {
  meta?: { last_updated?: string };
  places: Place[];
};

type PinFilters = {
  asset: string | null;
  category: string | null;
  country: string | null;
  city: string | null;
  verification: PinVerification[];
  payment: string[];
  search: string | null;
  limit: number;
};

const parsePositiveInt = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseSearchTerm = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
};

const normalizeVerification = (value: unknown): PinVerification => {
  if (value === "owner" || value === "community" || value === "directory") {
    return value;
  }
  return "unverified";
};

const createPinsResponse = (pins: PlacePin[], options: {
  source: "db" | "json";
  limited: boolean;
  lastUpdatedISO?: string;
}) => {
  return NextResponse.json(pins, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "x-cpm-pins-total": String(pins.length),
      ...buildDataSourceHeaders(options.source, options.limited),
      ...(options.lastUpdatedISO ? { "x-cpm-last-updated": options.lastUpdatedISO } : {}),
    },
  });
};

const loadPinsFromSnapshot = async (filters: PinFilters): Promise<{ pins: PlacePin[]; lastUpdatedISO?: string }> => {
  const raw = await fs.readFile(FALLBACK_SNAPSHOT_FILE, "utf8");
  const parsed = JSON.parse(raw) as PublishedSnapshot;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.places)) {
    throw new Error("FALLBACK_SNAPSHOT_UNAVAILABLE");
  }

  const searchNeedle = filters.search?.toLowerCase() ?? null;

  const pins = parsed.places
    .filter((place) => {
      if (typeof place.id !== "string" || !place.id) return false;
      if (isLegacyOrDemoId(place.id) || LEGACY_TEST_IDS.has(place.id)) return false;
      if (typeof place.lat !== "number" || typeof place.lng !== "number") return false;
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
      if (filters.category && place.category !== filters.category) return false;
      if (filters.country && place.country !== filters.country) return false;
      if (filters.city && place.city !== filters.city) return false;
      const verification = normalizeVerification(place.verification);
      if (filters.verification.length && !filters.verification.includes(verification)) return false;
      if (searchNeedle) {
        const name = (place.name ?? "").toLowerCase();
        const address = (place.address_full ?? place.address ?? "").toLowerCase();
        if (!name.includes(searchNeedle) && !address.includes(searchNeedle)) return false;
      }

      const accepted = new Set(
        [...(place.accepted ?? []), ...(place.supported_crypto ?? [])]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.toLowerCase()),
      );

      if (filters.asset && !accepted.has(filters.asset.toLowerCase())) return false;
      if (filters.payment.length > 0 && !filters.payment.some((payment) => accepted.has(payment.toLowerCase()))) {
        return false;
      }

      return true;
    })
    .slice(0, filters.limit)
    .map((place) => ({
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      verification: normalizeVerification(place.verification),
    }));

  return { pins, lastUpdatedISO: parsed.meta?.last_updated };
};

const loadPinsFromDb = async (filters: PinFilters): Promise<{ pins: PlacePin[] } | null> => {
  if (!hasDatabaseUrl()) return null;

  const route = "api_places_pins";
  const { rows: tableChecks } = await dbQuery<{ present: string | null; verifications: string | null; payments: string | null }>(
    `SELECT
      to_regclass('public.places') AS present,
      to_regclass('public.verifications') AS verifications,
      to_regclass('public.payment_accepts') AS payments`,
    [],
    { route },
  );

  if (!tableChecks[0]?.present) return null;

  const { rows: placeColumns } = await dbQuery<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='places'
       AND column_name IN ('status','is_demo','address')`,
    [],
    { route },
  );
  const hasCol = (name: string) => placeColumns.some((row) => row.column_name === name);

  const where: string[] = ["p.lat IS NOT NULL", "p.lng IS NOT NULL"];
  const paramsWhere: unknown[] = [];

  if (filters.category) {
    paramsWhere.push(filters.category);
    where.push(`p.category = $${paramsWhere.length}`);
  }
  if (filters.country) {
    paramsWhere.push(filters.country);
    where.push(`p.country = $${paramsWhere.length}`);
  }
  if (filters.city) {
    paramsWhere.push(filters.city);
    where.push(`p.city = $${paramsWhere.length}`);
  }
  if (hasCol("status")) where.push("COALESCE(p.status, 'published') = 'published'");
  if (hasCol("is_demo")) where.push("COALESCE(p.is_demo, false) = false");

  paramsWhere.push(Array.from(LEGACY_TEST_IDS));
  where.push(`NOT (p.id = ANY($${paramsWhere.length}::text[]))`);

  const hasVerifications = Boolean(tableChecks[0]?.verifications);
  const hasPayments = Boolean(tableChecks[0]?.payments);
  let verificationField: string | null = null;
  if (hasVerifications) {
    const { rows: verificationColumns } = await dbQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='verifications' AND column_name IN ('level')`,
      [],
      { route },
    );
    if (verificationColumns.some((row) => row.column_name === "level")) verificationField = "v.level";
  }

  if (filters.search) {
    paramsWhere.push(`%${filters.search}%`);
    where.push(`(p.name ILIKE $${paramsWhere.length} OR COALESCE(p.address, '') ILIKE $${paramsWhere.length})`);
  }

  if (filters.verification.length > 0) {
    if (!verificationField) {
      if (!filters.verification.every((value) => value === "unverified")) {
        return { pins: [] };
      }
    } else {
      paramsWhere.push(filters.verification);
      where.push(`COALESCE(${verificationField}, 'unverified') = ANY($${paramsWhere.length}::text[])`);
    }
  }

  if (filters.asset) {
    if (!hasPayments) return { pins: [] };
    paramsWhere.push(filters.asset);
    where.push(`EXISTS (SELECT 1 FROM payment_accepts pa WHERE pa.place_id = p.id AND UPPER(COALESCE(pa.asset, '')) = $${paramsWhere.length})`);
  }

  if (filters.payment.length > 0) {
    if (!hasPayments) return { pins: [] };
    paramsWhere.push(filters.payment);
    where.push(`EXISTS (SELECT 1 FROM payment_accepts pa WHERE pa.place_id = p.id AND (LOWER(pa.asset) = ANY($${paramsWhere.length}::text[]) OR LOWER(pa.chain) = ANY($${paramsWhere.length}::text[])))`);
  }

  const verificationSelect = verificationField
    ? `COALESCE(${verificationField}, 'unverified') AS verification`
    : "'unverified'::text AS verification";
  const joinVerification = verificationField ? " LEFT JOIN verifications v ON v.place_id = p.id" : "";
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await dbQuery<{ id: string; lat: number; lng: number; verification: string | null }>(
    `SELECT p.id, p.lat, p.lng, ${verificationSelect}
     FROM places p${joinVerification}
     ${whereClause}
     ORDER BY p.id ASC
     LIMIT $${paramsWhere.length + 1}`,
    [...paramsWhere, filters.limit],
    { route },
  );

  return {
    pins: rows.map((row) => ({
      id: row.id,
      lat: Number(row.lat),
      lng: Number(row.lng),
      verification: normalizeVerification(row.verification),
    })),
  };
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dataSource = getDataSourceSetting();
  const { shouldAllowJson } = getDataSourceContext(dataSource);

  const requestedLimit = parsePositiveInt(searchParams.get("limit"));
  const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const chainFilters = searchParams.getAll("chain").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const paymentFilters = searchParams.getAll("payment").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);

  const filters: PinFilters = {
    asset: normalizeAcceptsAsset(searchParams.get("asset")),
    category: searchParams.get("category"),
    country: searchParams.get("country"),
    city: searchParams.get("city"),
    verification: searchParams
      .getAll("verification")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value): value is PinVerification => ["owner", "community", "directory", "unverified"].includes(value)),
    payment: Array.from(new Set([...chainFilters, ...paymentFilters])).map((value) => value.toLowerCase()),
    search: parseSearchTerm(searchParams.get("q")),
    limit,
  };

  if (dataSource !== "json") {
    try {
      const dbResult = await withDbTimeout(loadPinsFromDb(filters), { message: "DB_TIMEOUT" });
      if (dbResult) {
        return createPinsResponse(dbResult.pins, { source: "db", limited: false });
      }
    } catch (error) {
      if (dataSource === "db") {
        return NextResponse.json(
          { ok: false, error: "DB_UNAVAILABLE" },
          {
            status: 503,
            headers: { "Cache-Control": NO_STORE, "x-cpm-pins-total": "0", ...buildDataSourceHeaders("db", true) },
          },
        );
      }
      if (!(error instanceof DbUnavailableError)) {
        console.warn("[pins] db query failed", error);
      }
    }
  }

  if (!shouldAllowJson) {
    return NextResponse.json(
      { ok: false, error: "DB_UNAVAILABLE" },
      {
        status: 503,
        headers: { "Cache-Control": NO_STORE, "x-cpm-pins-total": "0", ...buildDataSourceHeaders("db", true) },
      },
    );
  }

  try {
    const snapshotResult = await loadPinsFromSnapshot(filters);
    return createPinsResponse(snapshotResult.pins, {
      source: "json",
      limited: true,
      lastUpdatedISO: snapshotResult.lastUpdatedISO,
    });
  } catch {
    return NextResponse.json(
      [],
      {
        headers: {
          "Cache-Control": NO_STORE,
          "x-cpm-pins-total": "0",
          ...buildDataSourceHeaders("json", true),
        },
      },
    );
  }
}
