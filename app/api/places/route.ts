import { NextRequest, NextResponse } from "next/server";

import { parseBbox } from "@/lib/geo/bbox";
import { DbUnavailableError } from "@/lib/db";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import { normalizeAcceptsAsset } from "@/lib/acceptsAsset";
import { listPlacesForMap } from "@/lib/places/listPlacesForMap";
import { toPlaceMapItem } from "@/lib/places/mapDto/toSummaryPlus";
import type { PlaceMapItem } from "@/lib/places/mapDto/types";

const DEFAULT_LIMIT = 1200;
const MAX_LIMIT = 5000;
const ALL_MODE_LIMIT = 1200;
const CACHE_TTL_MS = 20_000;
const DB_ERROR_LOG_WINDOW_MS = 60_000;
const CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=300";
const NO_STORE = "no-store";

type CacheEntry = {
  expiresAt: number;
  data: PlaceMapItem[];
  source: "db" | "json";
  limited: boolean;
  lastUpdatedISO?: string;
};

const placesCache = new Map<string, CacheEntry>();
let lastDbErrorLogAt = 0;

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

const parseOffset = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const buildCacheKey = (params: URLSearchParams): string => {
  const entries = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);
    if (keyCompare !== 0) return keyCompare;
    return aValue.localeCompare(bValue);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
};

const logDbFailure = (message: string, error?: unknown) => {
  const now = Date.now();
  if (now - lastDbErrorLogAt < DB_ERROR_LOG_WINDOW_MS) return;
  lastDbErrorLogAt = now;
  if (error instanceof Error) return console.warn(`[places] ${message}`, error.message);
  if (error) return console.warn(`[places] ${message}`, error);
  console.warn(`[places] ${message}`);
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dryRunParam = searchParams.get("dryRun") ?? "";
  const dryRun = ["1", "true", "yes"].includes(dryRunParam.toLowerCase());
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson } = getDataSourceContext(dataSource);
  const defaultSource = dataSource === "json" ? "json" : dataSource === "db" ? "db" : shouldAttemptDb ? "db" : "json";
  const defaultHeaders = buildDataSourceHeaders(defaultSource, defaultSource === "json");

  if (dryRun) {
    const dryRunId = searchParams.get("placeId") ?? "cpm:dryrun-placeholder";
    const stubName = parseSearchTerm(searchParams.get("q")) ?? "[DRY RUN]";
    return NextResponse.json(
      [{ id: dryRunId, name: stubName, lat: 0, lng: 0, verification: "unverified", category: "dry-run", city: "", country: "", accepted: [] } satisfies PlaceMapItem],
      { headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) } },
    );
  }

  const bboxResult = parseBbox(searchParams.get("bbox"));
  if (bboxResult.error) {
    return NextResponse.json(
      { ok: false, error: "INVALID_BBOX", message: bboxResult.error },
      { status: 400, headers: { "Cache-Control": NO_STORE, ...defaultHeaders } },
    );
  }

  const requestedLimit = parsePositiveInt(searchParams.get("limit"));
  let limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
  let offset = parseOffset(searchParams.get("offset"));
  const mode = searchParams.get("mode");
  if (mode === "all") {
    const country = searchParams.get("country");
    const city = searchParams.get("city");
    if (!country && !city) {
      return NextResponse.json(
        { ok: false, error: "MODE_ALL_REQUIRES_SCOPE" },
        { status: 400, headers: { "Cache-Control": NO_STORE, ...defaultHeaders } },
      );
    }
    limit = Math.min(requestedLimit ?? ALL_MODE_LIMIT, ALL_MODE_LIMIT);
    offset = 0;
  }

  const normalizedParams = new URLSearchParams(searchParams);
  normalizedParams.set("limit", String(limit));
  normalizedParams.set("offset", String(offset));
  const search = parseSearchTerm(searchParams.get("q"));
  if (search) normalizedParams.set("q", search);
  const asset = normalizeAcceptsAsset(searchParams.get("asset"));
  if (asset) normalizedParams.set("asset", asset);
  if (mode !== "all") normalizedParams.delete("mode");
  const cacheKey = buildCacheKey(normalizedParams);

  const cached = placesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        ...buildDataSourceHeaders(cached.source, cached.limited),
        ...(cached.lastUpdatedISO ? { "x-cpm-last-updated": cached.lastUpdatedISO } : {}),
      },
    });
  }

  const chainFilters = searchParams.getAll("chain").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const paymentFilters = searchParams.getAll("payment").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);

  const filters = {
    asset,
    category: searchParams.get("category"),
    country: searchParams.get("country"),
    city: searchParams.get("city"),
    bbox: bboxResult.bbox,
    verification: searchParams.getAll("verification").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean) as ("owner" | "community" | "directory" | "unverified")[],
    payment: Array.from(new Set([...chainFilters, ...paymentFilters])).map((v) => v.toLowerCase()),
    search,
    limit,
    offset,
  };

  try {
    const result = await withDbTimeout(
      listPlacesForMap({
        dataSource: dataSource === "auto" ? "auto" : dataSource,
        filters,
      }),
      { message: "DB_TIMEOUT" },
    );

    const body = result.places.map(toPlaceMapItem);

    placesCache.set(cacheKey, {
      data: body,
      expiresAt: Date.now() + CACHE_TTL_MS,
      source: result.source,
      limited: result.limited,
      lastUpdatedISO: result.lastUpdatedISO,
    });

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        ...buildDataSourceHeaders(result.source, result.limited),
        ...(result.lastUpdatedISO ? { "x-cpm-last-updated": result.lastUpdatedISO } : {}),
      },
    });
  } catch (error) {
    logDbFailure("database query failed", error);
    if (!shouldAllowJson || dataSource === "db") {
      return NextResponse.json(
        { ok: false, error: "DB_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) } },
      );
    }
    if (error instanceof DbUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "DB_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) } },
      );
    }
    return NextResponse.json(
      { ok: false, error: "FALLBACK_SNAPSHOT_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("json", true) } },
    );
  }
}
