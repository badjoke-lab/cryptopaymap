import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeAccepted, type PaymentAccept } from "@/lib/accepted";
import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { type ParsedBbox } from "@/lib/geo/bbox";
import { places as fallbackPlaces } from "@/lib/data/places";
import { getMapDisplayableWhereClauses, isMapDisplayablePlace } from "@/lib/stats/mapPopulation";
import type { Place } from "@/types/places";

import { isLegacyOrDemoId, LEGACY_TEST_IDS } from "./legacyFilters";
import {
  buildAddressFull,
  normalizeAmenities,
  normalizeText,
  sanitizeVerification,
  toSummaryPlus,
  truncateAbout,
} from "./mapDto/toSummaryPlus";
import type { DbContact, PlaceSummaryPlus } from "./mapDto/types";

const FALLBACK_SNAPSHOT_FILE = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

type PublishedSnapshot = {
  meta?: { last_updated?: string };
  places: Place[];
};

type ListFilters = {
  category: string | null;
  country: string | null;
  city: string | null;
  bbox: ParsedBbox[] | null;
  verification: Place["verification"][];
  payment: string[];
  search: string | null;
  limit: number;
  offset: number;
};

export type ListPlacesForMapOptions = {
  dataSource: "db" | "json" | "auto";
  filters: ListFilters;
};

export type ListPlacesForMapResult = {
  places: PlaceSummaryPlus[];
  source: "db" | "json";
  limited: boolean;
  lastUpdatedISO?: string;
};

const buildAccepted = (place: Place): string[] => {
  const fallbackAccepted = place.accepted ?? place.supported_crypto ?? [];
  return normalizeAccepted([], fallbackAccepted);
};

const sanitizeOptionalStrings = <T>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((x) => sanitizeOptionalStrings(x)) as unknown as T;
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
    for (const key of Object.keys(out)) {
      const value = out[key];
      if (value === undefined) out[key] = null;
      else if (typeof value === "string") {
        const trimmed = value.trim();
        out[key] = trimmed === "" ? null : trimmed;
      } else if (Array.isArray(value) || (value && typeof value === "object")) {
        out[key] = sanitizeOptionalStrings(value);
      }
    }
    return out as T;
  }
  return input;
};

const loadPlacesFromSnapshot = async (): Promise<PublishedSnapshot> => {
  const raw = await fs.readFile(FALLBACK_SNAPSHOT_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as PublishedSnapshot).places)) {
    return parsed as PublishedSnapshot;
  }
  throw new Error("FALLBACK_SNAPSHOT_UNAVAILABLE");
};

const loadPlacesFromDb = async (filters: ListFilters): Promise<PlaceSummaryPlus[] | null> => {
  if (!hasDatabaseUrl()) return null;
  const route = "api_places";
  const fallbackById = new Map(fallbackPlaces.map((place) => [place.id, place]));

  const { rows: tableChecks } = await dbQuery<{ present: string | null; verifications: string | null; payments: string | null; socials: string | null; media: string | null }>(
    `SELECT
      to_regclass('public.places') AS present,
      to_regclass('public.verifications') AS verifications,
      to_regclass('public.payment_accepts') AS payments,
      to_regclass('public.socials') AS socials,
      to_regclass('public.media') AS media`,
    [],
    { route },
  );
  if (!tableChecks[0]?.present) return null;

  const { rows: placeColumns } = await dbQuery<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='places'
       AND column_name IN ('geom','updated_at','address','about','amenities','payment_note','status','is_demo')`,
    [],
    { route },
  );
  const hasCol = (name: string) => placeColumns.some((r) => r.column_name === name);

  const where: string[] = [...getMapDisplayableWhereClauses("p")];
  const params: unknown[] = [];

  if (filters.category) {
    params.push(filters.category);
    where.push(`p.category = $${params.length}`);
  }
  if (filters.country) {
    params.push(filters.country);
    where.push(`p.country = $${params.length}`);
  }
  if (filters.city) {
    params.push(filters.city);
    where.push(`p.city = $${params.length}`);
  }
  if (hasCol("status")) where.push("COALESCE(p.status, 'published') = 'published'");
  if (hasCol("is_demo")) where.push("COALESCE(p.is_demo, false) = false");

  params.push(Array.from(LEGACY_TEST_IDS));
  where.push(`NOT (p.id = ANY($${params.length}::text[]))`);

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

  if (filters.bbox?.length) {
    const useGeom = hasCol("geom");
    const clauses: string[] = [];
    for (const bbox of filters.bbox) {
      const start = params.length + 1;
      if (useGeom) {
        params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
        clauses.push(`ST_Intersects(p.geom::geometry, ST_MakeEnvelope($${start}, $${start + 1}, $${start + 2}, $${start + 3}, 4326))`);
      } else {
        params.push(bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat);
        clauses.push(`(p.lng BETWEEN $${start} AND $${start + 1} AND p.lat BETWEEN $${start + 2} AND $${start + 3})`);
      }
    }
    where.push(clauses.length > 1 ? `(${clauses.join(" OR ")})` : clauses[0]);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(p.name ILIKE $${params.length} OR COALESCE(p.address, '') ILIKE $${params.length})`);
  }

  if (filters.verification.length) {
    if (!verificationField) {
      if (!filters.verification.every((v) => v === "unverified")) return [];
    } else {
      params.push(filters.verification);
      where.push(`COALESCE(${verificationField}, 'unverified') = ANY($${params.length}::text[])`);
    }
  }

  if (filters.payment.length) {
    if (!hasPayments) return [];
    params.push(filters.payment);
    where.push(`EXISTS (SELECT 1 FROM payment_accepts pa WHERE pa.place_id = p.id AND (LOWER(pa.asset) = ANY($${params.length}::text[]) OR LOWER(pa.chain) = ANY($${params.length}::text[])))`);
  }

  const verificationSelect = verificationField
    ? `, COALESCE(${verificationField}, 'unverified') AS verification`
    : ", 'unverified'::text AS verification";
  const joinVerification = hasVerifications ? " LEFT JOIN verifications v ON v.place_id = p.id" : "";
  const orderBy = hasCol("updated_at") ? "ORDER BY p.updated_at DESC NULLS LAST, p.id ASC" : "ORDER BY p.id ASC";
  const addressSelect = hasCol("address") ? "p.address" : "NULL::text AS address";
  const aboutSelect = hasCol("about") ? "p.about" : "NULL::text AS about";
  const amenitiesSelect = hasCol("amenities") ? "p.amenities" : "NULL::text[] AS amenities";
  const paymentNoteSelect = hasCol("payment_note") ? "p.payment_note" : "NULL::text AS payment_note";

  const query = `SELECT p.id, p.name, p.category, p.city, p.country, p.lat, p.lng, ${addressSelect}, ${aboutSelect}, ${amenitiesSelect}, ${paymentNoteSelect}${verificationSelect}
    FROM places p${joinVerification}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ${orderBy}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}`;
  params.push(filters.limit, filters.offset);

  const { rows } = await dbQuery<{ id: string; name: string; category: string | null; city: string | null; country: string | null; lat: number; lng: number; address: string | null; about: string | null; amenities: string[] | string | null; payment_note: string | null; verification: string | null }>(query, params, { route });

  const placeIds = rows.map((row) => row.id);
  const paymentsByPlace = new Map<string, PaymentAccept[]>();
  if (hasPayments && placeIds.length) {
    const { rows: paymentRows } = await dbQuery<{ place_id: string; asset: string | null; chain: string | null; is_preferred: boolean | null }>(
      `SELECT place_id, asset, chain, NULL::boolean AS is_preferred FROM payment_accepts WHERE place_id = ANY($1::text[]) ORDER BY place_id ASC, id ASC`,
      [placeIds],
      { route },
    );
    for (const p of paymentRows) {
      const list = paymentsByPlace.get(p.place_id) ?? [];
      list.push({ asset: p.asset, chain: p.chain, is_preferred: p.is_preferred });
      paymentsByPlace.set(p.place_id, list);
    }
  }

  const socialsByPlace = new Map<string, DbContact>();
  if (placeIds.length && tableChecks[0]?.socials) {
    const { rows: socialRows } = await dbQuery<{ place_id: string; platform: string | null; url: string | null; handle: string | null }>(
      `SELECT place_id, platform, url, handle FROM socials WHERE place_id = ANY($1::text[]) ORDER BY id ASC`,
      [placeIds],
      { route },
    );
    for (const social of socialRows) {
      const contact = socialsByPlace.get(social.place_id) ?? { website: null, phone: null, twitter: null, instagram: null, facebook: null };
      const platform = (social.platform ?? "").toLowerCase();
      const value = normalizeText(social.url) ?? normalizeText(social.handle);
      if (value) {
        if (platform === "website") contact.website = contact.website ?? value;
        if (platform === "phone") contact.phone = contact.phone ?? value;
        if (platform === "twitter" || platform === "x") contact.twitter = contact.twitter ?? value;
        if (platform === "instagram") contact.instagram = contact.instagram ?? value;
        if (platform === "facebook") contact.facebook = contact.facebook ?? value;
      }
      socialsByPlace.set(social.place_id, contact);
    }
  }

  const coverImageByPlace = new Map<string, string>();
  if (placeIds.length && tableChecks[0]?.media) {
    const { rows: mediaRows } = await dbQuery<{ place_id: string; url: string | null }>(
      `SELECT place_id, url FROM media WHERE place_id = ANY($1::text[]) ORDER BY id ASC`,
      [placeIds],
      { route },
    );
    for (const media of mediaRows) {
      const url = normalizeText(media.url);
      if (url && !coverImageByPlace.has(media.place_id)) coverImageByPlace.set(media.place_id, url);
    }
  }

  return rows
    .map((row) => {
      const fallback = fallbackById.get(row.id);
      const accepted = hasPayments
        ? normalizeAccepted(paymentsByPlace.get(row.id) ?? [], fallback?.accepted ?? fallback?.supported_crypto)
        : normalizeAccepted([], fallback?.accepted ?? fallback?.supported_crypto);
      const base: Place = {
        id: row.id,
        name: row.name,
        category: row.category ?? "unknown",
        verification: sanitizeVerification(row.verification),
        lat: Number(row.lat),
        lng: Number(row.lng),
        country: row.country ?? "",
        city: row.city ?? "",
        address: row.address ?? undefined,
        about: row.about ?? null,
        paymentNote: row.payment_note ?? null,
        amenities: normalizeAmenities(row.amenities),
      };

      const summary = toSummaryPlus(base, accepted, socialsByPlace.get(row.id), { coverImage: coverImageByPlace.get(row.id) });
      if (!summary.address_full && fallback) summary.address_full = buildAddressFull(fallback);
      if (!summary.about_short) summary.about_short = truncateAbout(fallback?.about);
      if (!summary.paymentNote) summary.paymentNote = normalizeText(fallback?.paymentNote);
      if (!summary.amenities) summary.amenities = normalizeAmenities(fallback?.amenities);
      if (!summary.website) summary.website = normalizeText(fallback?.website ?? fallback?.social_website);
      if (!summary.phone) summary.phone = normalizeText(fallback?.phone);
      if (!summary.twitter) summary.twitter = normalizeText(fallback?.twitter ?? fallback?.social_twitter);
      if (!summary.instagram) summary.instagram = normalizeText(fallback?.instagram ?? fallback?.social_instagram);
      if (!summary.facebook) summary.facebook = normalizeText(fallback?.facebook);
      return sanitizeOptionalStrings(summary);
    })
    .filter((place) => !isLegacyOrDemoId(place.id));
};

export async function listPlacesForMap(options: ListPlacesForMapOptions): Promise<ListPlacesForMapResult> {
  if (options.dataSource !== "json") {
    try {
      const dbPlaces = await loadPlacesFromDb(options.filters);
      if (dbPlaces) {
        return { places: dbPlaces, source: "db", limited: false };
      }
    } catch (error) {
      if (options.dataSource === "db") {
        throw error;
      }
      if (!(error instanceof DbUnavailableError)) {
        console.warn("[places] failed to load from database", error);
      }
    }

    if (options.dataSource === "db") {
      throw new Error("DB_UNAVAILABLE");
    }
  }

  const snapshot = await loadPlacesFromSnapshot();
  const filtered = snapshot.places
    .filter((place) => !isLegacyOrDemoId(place.id))
    .filter((place) => isMapDisplayablePlace(place))
    .filter((place) => (options.filters.category ? place.category === options.filters.category : true))
    .filter((place) => (options.filters.country ? place.country === options.filters.country : true))
    .filter((place) => (options.filters.city ? place.city === options.filters.city : true))
    .filter((place) => (options.filters.verification.length ? options.filters.verification.includes(place.verification) : true))
    .filter((place) => {
      if (!options.filters.payment.length) return true;
      const chains = (place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? []).map((item) => item.toLowerCase());
      return options.filters.payment.some((chain) => chains.includes(chain));
    })
    .filter((place) => {
      if (!options.filters.bbox?.length) return true;
      return options.filters.bbox.some(({ minLng, minLat, maxLng, maxLat }) =>
        place.lng >= minLng && place.lng <= maxLng && place.lat >= minLat && place.lat <= maxLat,
      );
    })
    .filter((place) => {
      if (!options.filters.search) return true;
      const target = `${place.name ?? ""} ${place.address ?? ""}`.toLowerCase();
      return target.includes(options.filters.search.toLowerCase());
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const places = filtered
    .slice(options.filters.offset, options.filters.offset + options.filters.limit)
    .map((place) => sanitizeOptionalStrings(toSummaryPlus(place, buildAccepted(place))));

  return {
    places,
    source: "json",
    limited: true,
    lastUpdatedISO: normalizeText(snapshot.meta?.last_updated) ?? undefined,
  };
}
