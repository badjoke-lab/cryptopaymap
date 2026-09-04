import { and, asc, eq, ilike, isNotNull } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  locations,
  provenanceLinks,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const SOURCE_SYSTEM = 'chipotle_official_location_directory';
const MAX_RECORDS = Math.min(
  1200,
  Math.max(1, Number(process.env.CPM_CHIPOTLE_PROFILE_MAX ?? '1000') || 1000),
);
const REQUEST_INTERVAL_MS = Math.max(
  150,
  Number(process.env.CPM_CHIPOTLE_PROFILE_DELAY_MS ?? '250') || 250,
);

type JsonRecord = Record<string, unknown>;
type OfficialProfile = {
  phone: string | null;
  description: string | null;
  openingHours: string | null;
  amenities: string[];
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decode(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function jsonLdObjects(html: string): JsonRecord[] {
  const out: JsonRecord[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(match[1] ?? 'null') as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const row = item as JsonRecord;
        out.push(row);
        const graph = row['@graph'];
        if (Array.isArray(graph)) queue.push(...graph);
      }
    } catch {}
  }
  return out;
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decode(match[1]);
  }
  return null;
}

function dayLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tail = value.split('/').at(-1) ?? value;
  const normalized = tail.toLowerCase();
  const map: Record<string, string> = {
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    saturday: 'Sat',
    sunday: 'Sun',
  };
  return map[normalized] ?? null;
}

function openingHoursFrom(item: JsonRecord): string | null {
  const raw = item.openingHours;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    const values = raw.filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (values.length > 0) return values.join('; ');
  }

  const specs = Array.isArray(item.openingHoursSpecification)
    ? item.openingHoursSpecification
    : item.openingHoursSpecification
      ? [item.openingHoursSpecification]
      : [];
  const parts: string[] = [];
  for (const value of specs) {
    const spec = record(value);
    const opens = typeof spec.opens === 'string' ? spec.opens.trim() : '';
    const closes = typeof spec.closes === 'string' ? spec.closes.trim() : '';
    if (!opens || !closes) continue;
    const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
    const labels = days.map(dayLabel).filter((day): day is string => day !== null);
    if (labels.length > 0) parts.push(`${labels.join('/')} ${opens}-${closes}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

function visiblePhone(html: string): string | null {
  const telHref = html.match(/href=["']tel:([^"']+)["']/i)?.[1];
  if (telHref) return decode(telHref);
  const text = decode(html);
  return text.match(/\(\d{3}\)\s*\d{3}-\d{4}/)?.[0] ?? null;
}

function visibleHours(html: string): string | null {
  const text = decode(html);
  const match = text.match(
    /Restaurant Hours\s+(.{5,420}?)(?=\s+(?:Pickup Options|Order Online|Order Catering|About Chipotle Mexican Grill|Try our Featured Meals)\b)/i,
  );
  if (!match?.[1]) return null;
  return match[1].trim();
}

function visibleDescription(html: string): string | null {
  const text = decode(html);
  const match = text.match(
    /About Chipotle Mexican Grill\s+.{0,180}?\s+(Chipotle is a fast-casual restaurant chain[\s\S]{40,1400}?Chipotle Rewards\.)/i,
  );
  return match?.[1]?.trim() ?? null;
}

function amenitiesFrom(html: string): string[] {
  const text = decode(html).toLowerCase();
  const known: Array<[string, RegExp]> = [
    ['pickup', /\bpickup\b/],
    ['delivery', /\bdelivery\b/],
    ['in_store', /\bin[- ]store\b/],
    ['outdoor_seating', /\boutdoor seating\b/],
    ['contactless_ordering', /\bcontactless ordering\b/],
  ];
  return known.filter(([, pattern]) => pattern.test(text)).map(([slug]) => slug);
}

function officialProfile(html: string): OfficialProfile {
  const locationItem = jsonLdObjects(html).find((item) => {
    const address = record(item.address);
    return typeof address.streetAddress === 'string' && address.streetAddress.trim().length > 0;
  });

  const telephone = locationItem?.telephone;
  const phone =
    typeof telephone === 'string' && telephone.trim() ? telephone.trim() : visiblePhone(html);
  const rawDescription = locationItem?.description;
  const description =
    typeof rawDescription === 'string' && rawDescription.trim()
      ? decode(rawDescription)
      : metaContent(html, 'description') ??
        metaContent(html, 'og:description') ??
        visibleDescription(html);
  const openingHours =
    (locationItem ? openingHoursFrom(locationItem) : null) ?? visibleHours(html);

  return {
    phone,
    description: description && description.length >= 30 ? description : null,
    openingHours,
    amenities: amenitiesFrom(html),
  };
}

async function fetchOfficial(url: string): Promise<{ url: string; html: string }> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; CryptoPayMap/1.0; +https://cryptopaymap.com)',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { url: response.url, html: await response.text() };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing Chipotle profile backfill outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      sourceRecordId: sourceRecords.id,
      sourceUrl: sourceRecords.sourceUrl,
      rawPayload: sourceRecords.rawPayload,
      relationship: candidateSourceRecords.relationship,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        isNotNull(sourceCandidates.canonicalLocationId),
        ilike(sourceCandidates.normalizedName, '%chipotle%'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const targets = rows
    .filter((row) => row.relationship === 'origin')
    .filter((row) => record(row.rawPayload).sourceSystem === SOURCE_SYSTEM)
    .slice(0, MAX_RECORDS);

  const counters = {
    targets: targets.length,
    fetched: 0,
    fetchFailures: 0,
    sourceRecordsUpdated: 0,
    canonicalLocationsUpdated: 0,
    descriptions: 0,
    phones: 0,
    openingHours: 0,
    amenities: 0,
    stillThin: 0,
  };

  for (const target of targets) {
    const payload = record(target.rawPayload);
    const seed = record(payload.reviewSeed);
    const url =
      (typeof seed.websiteUrl === 'string' && seed.websiteUrl.trim() ? seed.websiteUrl.trim() : null) ??
      target.sourceUrl;
    if (!url) {
      counters.fetchFailures += 1;
      continue;
    }

    try {
      const page = await fetchOfficial(url);
      const profile = officialProfile(page.html);
      counters.fetched += 1;
      if (profile.description) counters.descriptions += 1;
      if (profile.phone) counters.phones += 1;
      if (profile.openingHours) counters.openingHours += 1;
      if (profile.amenities.length > 0) counters.amenities += 1;
      if (!profile.description && !profile.phone && !profile.openingHours && profile.amenities.length === 0) {
        counters.stillThin += 1;
      }

      const nextSeed = {
        ...seed,
        websiteUrl: page.url,
        ...(profile.phone ? { phone: profile.phone } : {}),
        ...(profile.description ? { description: profile.description } : {}),
        ...(profile.openingHours ? { openingHours: profile.openingHours } : {}),
        ...(profile.amenities.length > 0 ? { amenities: profile.amenities } : {}),
      };
      const nextPayload = {
        ...payload,
        profileEnrichment: {
          source: 'official_location_page',
          fetchedAt: new Date().toISOString(),
          fields: [
            ...(profile.phone ? ['phone'] : []),
            ...(profile.description ? ['description'] : []),
            ...(profile.openingHours ? ['openingHours'] : []),
            ...(profile.amenities.length > 0 ? ['amenities'] : []),
          ],
        },
        reviewSeed: nextSeed,
      };
      const now = new Date();
      await db
        .update(sourceRecords)
        .set({
          sourceUrl: page.url,
          rawPayload: nextPayload,
          observedAt: now,
          fetchedAt: now,
          contentHash: await sha256(JSON.stringify(nextPayload)),
        })
        .where(eq(sourceRecords.id, target.sourceRecordId));
      counters.sourceRecordsUpdated += 1;

      if (target.canonicalLocationId) {
        const updates = {
          ...(profile.phone ? { phone: profile.phone } : {}),
          ...(profile.description ? { description: profile.description } : {}),
          ...(profile.openingHours ? { openingHours: profile.openingHours } : {}),
          ...(profile.amenities.length > 0 ? { amenities: profile.amenities } : {}),
          websiteUrl: page.url,
          updatedAt: now,
        };
        await db.update(locations).set(updates).where(eq(locations.id, target.canonicalLocationId));
        counters.canonicalLocationsUpdated += 1;

        const fields = [
          ...(profile.phone ? ['phone'] : []),
          ...(profile.description ? ['description'] : []),
          ...(profile.openingHours ? ['openingHours'] : []),
          ...(profile.amenities.length > 0 ? ['amenities'] : []),
          'websiteUrl',
        ];
        for (const fieldPath of fields) {
          await db
            .insert(provenanceLinks)
            .values({
              subjectType: 'location',
              subjectId: target.canonicalLocationId,
              fieldPath,
              sourceRecordId: target.sourceRecordId,
              provenanceRole: 'origin',
              effectiveFrom: now,
            })
            .onConflictDoNothing();
        }
      }
    } catch (error) {
      counters.fetchFailures += 1;
      console.error(
        JSON.stringify({
          sourceRecordId: target.sourceRecordId,
          url,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    await sleep(REQUEST_INTERVAL_MS);
  }

  console.log(JSON.stringify({ target: TARGET, merchant: 'Chipotle', ...counters }));
  if (targets.length < 1) throw new Error('No promoted Chipotle official location records found for profile backfill.');
  if (counters.fetched < Math.floor(targets.length * 0.9)) {
    throw new Error(`Official profile fetch coverage too low: ${counters.fetched}/${targets.length}.`);
  }
  if (counters.descriptions < Math.floor(counters.fetched * 0.9)) {
    throw new Error(`Official description coverage too low: ${counters.descriptions}/${counters.fetched}.`);
  }
}

await main();
