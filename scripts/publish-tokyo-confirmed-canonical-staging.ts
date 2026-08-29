import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import {
  authorizeExportPublication,
  readExportPublicationAuthorizationPolicy,
} from '../src/admin/export-release/publication-authorization';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidatePromotionDecisions,
  entities,
  evidence,
  locations,
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';
const EXPECTED_COUNT = 4;

async function deterministicUuid(label: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function entitySlug(locationSlug: string): string {
  const value = `merchant-${locationSlug}`;
  if (value.length > 64) throw new Error('Derived public entity slug exceeds the canonical limit.');
  return value;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing canonical publication outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const policy = readExportPublicationAuthorizationPolicy({
    CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS: process.env.CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS,
  });
  const publisher = createDerivedStagingServiceIdentity('publisher');
  const publisherAuthorized = policy.configured && policy.allowedActorIds.has(publisher.actorId);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      entityId: candidatePromotionDecisions.entityId,
      locationId: candidatePromotionDecisions.locationId,
      claimId: candidatePromotionDecisions.claimId,
      evidenceId: evidence.id,
      entitySlug: entities.slug,
      entityVisibility: entities.visibility,
      locationSlug: locations.slug,
      locationVisibility: locations.visibility,
      claimVisibility: acceptanceClaims.visibility,
      evidenceVisibility: evidence.visibility,
    })
    .from(sourceCandidates)
    .innerJoin(
      candidatePromotionDecisions,
      eq(candidatePromotionDecisions.candidateId, sourceCandidates.id),
    )
    .innerJoin(entities, eq(entities.id, candidatePromotionDecisions.entityId))
    .innerJoin(locations, eq(locations.id, candidatePromotionDecisions.locationId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.id, candidatePromotionDecisions.claimId))
    .innerJoin(evidence, eq(evidence.claimId, acceptanceClaims.id))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.reviewStatus, 'accepted'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const unique = new Map(rows.map((row) => [row.candidateId, row]));
  const targets = [...unique.values()];
  if (targets.length !== EXPECTED_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_COUNT} reviewed Tokyo publication targets; got ${targets.length}.`);
  }
  if (targets.some((row) => row.locationId === null)) {
    throw new Error('A physical publication target is missing its canonical Location.');
  }
  for (const row of targets) {
    const expectedSlug = entitySlug(row.locationSlug);
    if (row.entitySlug !== null && row.entitySlug !== expectedSlug) {
      throw new Error('A publication target already has a conflicting public Entity slug.');
    }
  }

  const alreadyPublic = targets.every(
    (row) =>
      row.entityVisibility === 'public' &&
      row.locationVisibility === 'public' &&
      row.claimVisibility === 'public' &&
      row.evidenceVisibility === 'public' &&
      row.entitySlug === entitySlug(row.locationSlug),
  );

  if (!publisherAuthorized) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        reviewedTargets: targets.length,
        publicationConfigured: policy.configured,
        publisherAuthorized: false,
        alreadyPublic,
        mutationPerformed: false,
        publicClaimsAfter: alreadyPublic ? targets.length : 0,
        payloadExposed: false,
      }),
    );
    return;
  }

  const requestId = await deterministicUuid('tokyo-reviewed-canonical-publication:v1');
  authorizeExportPublication(publisher, policy, requestId);

  if (alreadyPublic) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        reviewedTargets: targets.length,
        publicationConfigured: true,
        publisherAuthorized: true,
        alreadyPublic: true,
        mutationPerformed: false,
        publicClaimsAfter: targets.length,
        payloadExposed: false,
      }),
    );
    return;
  }

  const candidateIds = targets.map((row) => row.candidateId);
  const entityIds = targets.map((row) => row.entityId);
  const locationIds = targets.map((row) => row.locationId as string);
  const claimIds = targets.map((row) => row.claimId);
  const evidenceIds = targets.map((row) => row.evidenceId);

  const statements: unknown[] = [
    db.execute(sql`
      select 1 / case when (
        select count(*)::int
        from ${sourceCandidates}
        inner join ${candidatePromotionDecisions}
          on ${candidatePromotionDecisions.candidateId} = ${sourceCandidates.id}
        inner join ${acceptanceClaims}
          on ${acceptanceClaims.id} = ${candidatePromotionDecisions.claimId}
        where ${sourceCandidates.id} in (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)})
          and ${sourceCandidates.importBatchId} = ${TOKYO_BATCH_ID}
          and ${sourceCandidates.candidateStatus} = 'promoted'
          and ${acceptanceClaims.claimStatus} = 'confirmed'
          and ${acceptanceClaims.customerPaysCrypto} = true
          and ${acceptanceClaims.merchantExplicitlyAcceptsCrypto} = true
          and ${sourceCandidates.duplicateGroupId} is null
      ) = ${EXPECTED_COUNT} then 1 else 0 end as tokyo_publication_guard
    `),
  ];

  for (const row of targets) {
    statements.push(
      db
        .update(entities)
        .set({ slug: entitySlug(row.locationSlug), visibility: 'public' })
        .where(and(eq(entities.id, row.entityId), inArray(entities.visibility, ['hidden', 'public']))),
    );
  }
  statements.push(
    db.update(locations).set({ visibility: 'public' }).where(inArray(locations.id, locationIds)),
    db
      .update(acceptanceClaims)
      .set({ visibility: 'public' })
      .where(and(inArray(acceptanceClaims.id, claimIds), eq(acceptanceClaims.claimStatus, 'confirmed'))),
    db
      .update(evidence)
      .set({ visibility: 'public' })
      .where(and(inArray(evidence.id, evidenceIds), eq(evidence.reviewStatus, 'accepted'))),
  );

  await db.batch(statements as Parameters<typeof db.batch>[0]);

  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(acceptanceClaims)
    .where(and(inArray(acceptanceClaims.id, claimIds), eq(acceptanceClaims.visibility, 'public')));

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      reviewedTargets: targets.length,
      publicationConfigured: true,
      publisherAuthorized: true,
      alreadyPublic: false,
      mutationPerformed: true,
      publicClaimsAfter: Number(count?.count ?? 0),
      entityCount: entityIds.length,
      locationCount: locationIds.length,
      evidenceCount: evidenceIds.length,
      payloadExposed: false,
    }),
  );
}

await main();
