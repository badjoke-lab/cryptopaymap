import type { Place } from "@/types/places";

import { type DbContact, type PlaceMapItem, type PlaceSummaryPlus, type Verification } from "./types";

const VERIFICATION_LEVELS = new Set(["owner", "community", "directory", "unverified", "report", "verified", "pending"]);

export function sanitizeVerification(v: unknown): Verification {
  if (typeof v !== "string") return "unverified";
  const x = v.trim().toLowerCase();
  return VERIFICATION_LEVELS.has(x as Verification) ? (x as Verification) : "unverified";
}

export const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const truncateAbout = (value: unknown, maxLength = 400): string | null => {
  const text = normalizeText(value);
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd();
};

export const normalizeAmenities = (raw: unknown): string[] | null => {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const items = raw.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item));
    return items.length ? items : null;
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const items = parsed.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item));
        return items.length ? items : null;
      }
    } catch {
      const parts = raw
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      return parts.length ? parts : null;
    }
  }

  return null;
};

const ADDRESS_CITY_ALIASES: Record<string, string[]> = {
  "mexico city": ["ciudad de méxico"],
};

const splitAddressSegments = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

const hasExactAddressSegment = (
  segments: string[],
  target: string | null | undefined,
  aliases: string[] = [],
): boolean => {
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) return false;

  const normalizedSegments = new Set(segments.map((segment) => segment.toLowerCase()));
  if (normalizedSegments.has(normalizedTarget.toLowerCase())) return true;

  return aliases.some((alias) => normalizedSegments.has(alias.toLowerCase()));
};

export const buildAddressFull = (place: {
  address_full?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
}): string | null => {
  const explicit = normalizeText(place.address_full);
  if (explicit) return explicit;

  const address = normalizeText(place.address);
  const city = normalizeText(place.city);
  const country = normalizeText(place.country);

  if (!address) {
    if (!city) return null;
    const fallbackParts = [city, country].filter((value): value is string => Boolean(value));
    return fallbackParts.length ? fallbackParts.join(", ") : null;
  }

  const addressSegments = splitAddressSegments(address);
  const cityAliases = city ? (ADDRESS_CITY_ALIASES[city.toLowerCase()] ?? []) : [];

  const parts = [address];

  if (city && !hasExactAddressSegment(addressSegments, city, cityAliases)) {
    parts.push(city);
  }

  if (country && !hasExactAddressSegment(addressSegments, country)) {
    parts.push(country);
  }

  return parts.join(", ");
};

export const pickCoverImage = (place: {
  coverImage?: string | null;
  images?: string[] | null;
  photos?: string[] | null;
  media?: string[] | null;
}): string | null => {
  const candidates = [
    normalizeText(place.coverImage),
    normalizeText(place.images?.[0]),
    normalizeText(place.photos?.[0]),
    normalizeText(place.media?.[0]),
  ];
  return candidates.find((value): value is string => Boolean(value)) ?? null;
};


export function toPlaceMapItem(place: PlaceSummaryPlus): PlaceMapItem {
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    verification: place.verification,
    category: place.category,
    city: place.city,
    country: place.country,
    accepted: place.accepted,
    address_full: place.address_full,
  };
}
export function toSummaryPlus(
  place: Place,
  accepted: string[],
  contact?: DbContact,
  media?: { coverImage?: string | null },
): PlaceSummaryPlus {
  return {
    id: place.id,
    name: place.name,
    lat: Number(place.lat),
    lng: Number(place.lng),
    verification: sanitizeVerification(place.verification),
    category: place.category ?? "unknown",
    city: place.city ?? "",
    country: place.country ?? "",
    accepted,
    address_full: buildAddressFull(place),
    about_short: truncateAbout(place.about),
    paymentNote: normalizeText(place.paymentNote),
    amenities: normalizeAmenities(place.amenities),
    phone: normalizeText(contact?.phone ?? place.phone),
    website: normalizeText(contact?.website ?? place.website ?? place.social_website),
    twitter: normalizeText(contact?.twitter ?? place.twitter ?? place.social_twitter),
    instagram: normalizeText(contact?.instagram ?? place.instagram ?? place.social_instagram),
    facebook: normalizeText(contact?.facebook ?? place.facebook),
    coverImage: normalizeText(media?.coverImage) ?? pickCoverImage(place),
  };
}
