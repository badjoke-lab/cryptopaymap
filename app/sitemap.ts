import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://www.cryptopaymap.com';
const SNAPSHOT_PATH = path.join(process.cwd(), 'data/fallback/published_places_snapshot.json');

const STATIC_PATHS = ['/', '/map', '/discover', '/stats', '/about', '/donate'] as const;
const ACCEPTS_ASSETS = ['BTC', 'ETH', 'USDT', 'USDC'] as const;

type SnapshotPlace = {
  id?: unknown;
  city?: unknown;
};

const toCitySlug = (city: string) => encodeURIComponent(city.trim().replace(/\s+/g, '-').toLowerCase());

const toAbsoluteUrl = (pathname: string) => `${SITE_URL}${pathname}`;

function readSnapshotPlaces(): { places: SnapshotPlace[]; snapshotMtime?: Date } {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    const places = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { places?: unknown }).places)
        ? (parsed as { places: unknown[] }).places
        : []);

    const stat = fs.statSync(SNAPSHOT_PATH);
    return { places: places as SnapshotPlace[], snapshotMtime: stat.mtime };
  } catch {
    return { places: [] };
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((pathname) => ({
    url: toAbsoluteUrl(pathname),
  }));

  const acceptsEntries: MetadataRoute.Sitemap = ACCEPTS_ASSETS.map((asset) => ({
    url: toAbsoluteUrl(`/accepts/${asset}`),
  }));

  const { places, snapshotMtime } = readSnapshotPlaces();

  const citySlugs = new Set<string>();
  const placeIds = new Set<string>();

  for (const place of places) {
    if (typeof place?.city === 'string' && place.city.trim()) {
      citySlugs.add(toCitySlug(place.city));
    }
    if (typeof place?.id === 'string' && place.id.trim()) {
      placeIds.add(place.id);
    }
  }

  const cityEntries: MetadataRoute.Sitemap = Array.from(citySlugs)
    .sort((a, b) => a.localeCompare(b))
    .map((citySlug) => ({
      url: toAbsoluteUrl(`/city/${citySlug}`),
      ...(snapshotMtime ? { lastModified: snapshotMtime } : {}),
    }));

  const placeEntries: MetadataRoute.Sitemap = Array.from(placeIds)
    .sort((a, b) => a.localeCompare(b))
    .map((placeId) => ({
      url: toAbsoluteUrl(`/place/${encodeURIComponent(placeId)}`),
      ...(snapshotMtime ? { lastModified: snapshotMtime } : {}),
    }));

  return [...staticEntries, ...acceptsEntries, ...cityEntries, ...placeEntries];
}
