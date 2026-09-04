import { readFile, writeFile } from 'node:fs/promises';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { acceptanceClaims, locations, verificationEvents } from '../src/db/schema';
import {
  publicPlaceHistoryFileSchema,
  type PublicPlaceHistoryEvent,
} from '../src/public/place-history';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const placesPath = new URL('../public/data/places.json', import.meta.url);
const historyPath = new URL('../public/data/place-history.json', import.meta.url);

const VERIFICATION_TYPES = new Set([
  'confirmed',
  'reconfirmed',
  'marked_stale',
  'ended',
  'rejected',
  'restored',
]);
const CHANGE_TYPES = new Set(['corrected', 'hidden', 'unhidden']);

type PlacesDocument = {
  schemaVersion?: unknown;
  generatedAt?: unknown;
  records?: unknown;
};

type PublicPlaceLike = {
  placeSlug?: unknown;
};

function fallbackSummary(eventType: string): string {
  switch (eventType) {
    case 'confirmed':
      return 'Cryptocurrency payment acceptance was confirmed.';
    case 'reconfirmed':
      return 'Cryptocurrency payment acceptance was reconfirmed.';
    case 'marked_stale':
      return 'The payment record was marked stale pending reconfirmation.';
    case 'ended':
      return 'The recorded cryptocurrency payment acceptance ended.';
    case 'rejected':
      return 'A candidate payment claim was rejected.';
    case 'restored':
      return 'A stale payment claim was restored after verification.';
    case 'corrected':
      return 'The public payment record was corrected.';
    case 'hidden':
      return 'The payment record was hidden from public view.';
    case 'unhidden':
      return 'The payment record was returned to public view.';
    default:
      throw new Error(`Unsupported verification event type: ${eventType}`);
  }
}

function toPublicEvent(row: {
  eventType: string;
  effectiveAt: Date;
  publicSummary: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  fromVisibility: string | null;
  toVisibility: string | null;
}): PublicPlaceHistoryEvent {
  return {
    eventType: row.eventType as PublicPlaceHistoryEvent['eventType'],
    effectiveAt: row.effectiveAt.toISOString(),
    summary: row.publicSummary?.trim() || fallbackSummary(row.eventType),
    fromStatus: row.fromStatus as PublicPlaceHistoryEvent['fromStatus'],
    toStatus: row.toStatus as PublicPlaceHistoryEvent['toStatus'],
    fromVisibility: row.fromVisibility as PublicPlaceHistoryEvent['fromVisibility'],
    toVisibility: row.toVisibility as PublicPlaceHistoryEvent['toVisibility'],
  };
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing public Place history materialization outside ${TARGET}.`);
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const rawPlaces = JSON.parse(await readFile(placesPath, 'utf8')) as PlacesDocument;
  if (!Array.isArray(rawPlaces.records)) throw new Error('places.json records must be an array.');
  const placeSlugs = rawPlaces.records
    .map((record) => (record as PublicPlaceLike).placeSlug)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (placeSlugs.length < 1) throw new Error('Expected at least one public Place before history materialization.');

  const db = createDatabase(databaseUrl);
  const rows = await db
    .select({
      placeSlug: locations.slug,
      eventType: verificationEvents.eventType,
      effectiveAt: verificationEvents.effectiveAt,
      createdAt: verificationEvents.createdAt,
      publicSummary: verificationEvents.publicSummary,
      fromStatus: verificationEvents.fromStatus,
      toStatus: verificationEvents.toStatus,
      fromVisibility: verificationEvents.fromVisibility,
      toVisibility: verificationEvents.toVisibility,
    })
    .from(verificationEvents)
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.id, verificationEvents.claimId))
    .innerJoin(locations, eq(locations.id, acceptanceClaims.locationId))
    .where(
      and(
        inArray(locations.slug, placeSlugs),
        eq(locations.visibility, 'public'),
        eq(acceptanceClaims.visibility, 'public'),
      ),
    )
    .orderBy(asc(locations.slug), asc(verificationEvents.effectiveAt), asc(verificationEvents.createdAt));

  const rowsByPlace = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = rowsByPlace.get(row.placeSlug) ?? [];
    current.push(row);
    rowsByPlace.set(row.placeSlug, current);
  }

  const missingVerification: string[] = [];
  const records = placeSlugs.map((placeSlug) => {
    const events = rowsByPlace.get(placeSlug) ?? [];
    const verificationHistory = events
      .filter((event) => VERIFICATION_TYPES.has(event.eventType))
      .map(toPublicEvent)
      .sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt));
    const changeHistory = events
      .filter((event) => CHANGE_TYPES.has(event.eventType))
      .map(toPublicEvent)
      .sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt));
    if (verificationHistory.length < 1) missingVerification.push(placeSlug);
    return { placeSlug, verificationHistory, changeHistory };
  });

  if (missingVerification.length > 0) {
    throw new Error(
      `Public Places missing real verification history: ${missingVerification.length}; ${missingVerification
        .slice(0, 30)
        .join(', ')}`,
    );
  }

  const generatedAt =
    typeof rawPlaces.generatedAt === 'string' && Number.isFinite(Date.parse(rawPlaces.generatedAt))
      ? new Date(rawPlaces.generatedAt).toISOString()
      : new Date().toISOString();

  const document = publicPlaceHistoryFileSchema.parse({
    schemaVersion: '1.0.0',
    generatedAt,
    records,
  });
  await writeFile(historyPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        publicPlaces: placeSlugs.length,
        historyRecords: records.length,
        verificationEvents: records.reduce((sum, record) => sum + record.verificationHistory.length, 0),
        changeEvents: records.reduce((sum, record) => sum + record.changeHistory.length, 0),
        missingVerification: 0,
      },
      null,
      2,
    ),
  );
}

await main();
