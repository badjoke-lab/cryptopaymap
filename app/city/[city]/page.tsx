import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';

import { buildPageMetadata } from '@/lib/seo/metadata';

const MAX_RESULTS = 50;

type CityPageProps = {
  params: { city: string };
};

type PlaceSummary = {
  id: string;
  name: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  verification?: 'owner' | 'community' | 'directory' | 'unverified';
};

const verificationMeta = {
  owner: { label: 'Owner', className: 'bg-emerald-100 text-emerald-800' },
  community: { label: 'Community', className: 'bg-sky-100 text-sky-800' },
  directory: { label: 'Community', className: 'bg-sky-100 text-sky-800' },
  unverified: { label: 'Unverified', className: 'bg-gray-100 text-gray-700' },
} as const;

const verificationRank: Record<keyof typeof verificationMeta, number> = {
  owner: 0,
  community: 1,
  directory: 1,
  unverified: 2,
};

const formatCityName = (slug: string) => {
  const decoded = decodeURIComponent(slug).trim();
  if (!decoded) return '';

  return decoded
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const toCitySlug = (city: string) => encodeURIComponent(city.trim().replace(/\s+/g, '-').toLowerCase());

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const cityName = formatCityName(params.city);
  return buildPageMetadata({
    title: cityName ? `Places in ${cityName}` : 'Places by city',
    description: cityName ? `Browse crypto-friendly places in ${cityName}.` : 'Browse crypto-friendly places by city.',
    path: cityName ? `/city/${encodeURIComponent(params.city)}` : '/city',
  });
}

async function fetchPlacesByCity(city: string): Promise<PlaceSummary[]> {
  const headerStore = headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? 'localhost:3000';
  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const baseUrl = `${protocol}://${host}`;

  const response = await fetch(
    `${baseUrl}/api/places?city=${encodeURIComponent(city)}&limit=${MAX_RESULTS}`,
    { cache: 'no-store' },
  );

  if (!response.ok) return [];

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) return [];

  return data as PlaceSummary[];
}

export default async function CityPage({ params }: CityPageProps) {
  const cityName = formatCityName(params.city);
  const places = cityName ? await fetchPlacesByCity(cityName) : [];

  const sortedPlaces = [...places].sort((a, b) => {
    const aVerification = a.verification ?? 'unverified';
    const bVerification = b.verification ?? 'unverified';
    const byVerification = verificationRank[aVerification] - verificationRank[bVerification];
    if (byVerification !== 0) return byVerification;

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">Places in {cityName || 'Unknown City'}</h1>
      <p className="mt-3 text-base text-gray-700">Explore the first crypto-friendly places we found for this city.</p>

      <div className="mt-5">
        <Link
          href={`/map?city=${encodeURIComponent(cityName)}`}
          className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Open Map
        </Link>
      </div>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Total: {places.length} places · Showing first {MAX_RESULTS}</h2>

        {sortedPlaces.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No places found for this city yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sortedPlaces.map((place) => {
              const verification = place.verification ?? 'unverified';
              const location = [place.city, place.country].filter(Boolean).join(', ') || 'Location unknown';

              return (
                <li key={place.id} className="rounded-lg border border-gray-200 p-4">
                  <Link href={`/place/${encodeURIComponent(place.id)}`} className="text-base font-semibold text-sky-700 hover:underline">
                    {place.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span>{place.category || 'Unknown category'}</span>
                    <span aria-hidden="true">/</span>
                    <span>{location}</span>
                    <span aria-hidden="true">/</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${verificationMeta[verification].className}`}>
                      {verificationMeta[verification].label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {cityName ? (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <Link
              href={`/map?city=${encodeURIComponent(cityName)}`}
              className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              View all on map
            </Link>
          </div>
        ) : null}
      </section>

      {cityName ? (
        <div className="mt-6 text-sm text-gray-600">
          Looking for another city? Try{' '}
          <Link href={`/city/${toCitySlug('Tokyo')}`} className="text-sky-700 hover:underline">Tokyo</Link>
          {' '}or{' '}
          <Link href={`/city/${toCitySlug('Berlin')}`} className="text-sky-700 hover:underline">Berlin</Link>.
        </div>
      ) : null}
    </main>
  );
}
