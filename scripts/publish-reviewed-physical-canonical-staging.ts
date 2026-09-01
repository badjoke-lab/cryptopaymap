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
const MAX_PUBLICATION_BATCH = 50;

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

function isFullyPublic(row: {
  entitySlug: string | null;
  entityVisibility: string;
  locationSlug: string;
  locationVisibility: string;
  claimVisibility: string;
  evidenceVisibility: string;
}): boolean {
  return (
    row.entityVisibility === 'public' &&
    row.locationVisibility === 'public' &&
    row.claimVisibility === 'public' &&
    row.evidenceVisibility === 'public' &&
    row.entitySlug === entitySlug(row.locationSlug)
  );
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
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
        eq(acceptanceClaims.customerPaysCrypto, true),
        eq(acceptanceClaims.merchantExplicitlyAcceptsCrypto, true),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.reviewStatus, 'accepted'),
        sql`${sourceCandidates.duplicateGroupId} is null`,
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const unique = new Map(rows.map((row) => [row.claimId, row]));
  const eligible = [...unique.values()];
  const alreadyPublicCount = eligible.filter(isFullyPublic).length;
  const targets = eligible.filter((row) => !isFullyPublic(row)).slice(0, MAX_PUBLICATION_BATCH);

  if (targets.length === 0) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        reviewedTargets: 0,
        eligibleReviewedTargets: eligible.length,
        alreadyPublicCount,
        publicationConfigured: policy.configured,
        publisherAuthorized,
        mutationPerformed: false,
        reason: eligible.length > 0 ? 'all_eligible_targets_already_public' : 'no_eligible_reviewed_targets',
        payloadExposed: false,
      }),
    );
    return;
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

  if (!publisherAuthorized) {
    console.log(
      JSON.stringify({
        target: EXPECTED_TARGET,
        reviewedTargets: targets.length,
        eligibleReviewedTargets: eligible.length,
        alreadyPublicCount,
        publicationConfigured: policy.configured,
        publisherAuthorized: false,
        mutationPerformed: false,
        payloadExposed: false,
      }),
    );
    return;
  }

  const sortedClaimIds = targets.map((row) => row.claimId).sort();
  const requestId = await deterministicUuid(
    `reviewed-physical-canonical-publication:v2:${sortedClaimIds.join(',')}`,
  );
  authorizeExportPublication(publisher, policy, requestId);

  const candidateIds = targets.map((row) => row.candidateId);
  const entityIds = targets.map((row) => row.entityId);
  const locationIds = targets.map((row) => row.locationId as string);
  const claimIds = targets.map((row) => row.claimId);
  const evidenceIds = targets.map((row) => row.evidenceId);
  const candidateList = sql.join(
    candidateIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const claimList = sql.join(
    claimIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const entityList = sql.join(
    entityIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const locationList = sql.join(
    locationIds.map((id) => sql`${id}`),
    sql`, `,
  );

  await db.batch([
    db.execute(sql`
      select 1 / case when (
        select count(distinct ${acceptanceClaims.id})::int
        from ${sourceCandidates}
        inner join ${candidatePromotionDecisions}
          on ${candidatePromotionDecisions.candidateId} = ${sourceCandidates.id}
        inner join ${acceptanceClaims}
          on ${acceptanceClaims.id} = ${candidatePromotionDecisions.claimId}
        where ${sourceCandidates.id} in (${candidateList})
          and ${acceptanceClaims.id} in (${claimList})
          and ${sourceCandidates.candidateStatus} = 'promoted'
          and ${acceptanceClaims.claimStatus} = 'confirmed'
          and ${acceptanceClaims.customerPaysCrypto} = true
          and ${acceptanceClaims.merchantExplicitlyAcceptsCrypto} = true
          and ${sourceCandidates.duplicateGroupId} is null
          and exists (
            select 1
            from ${evidence}
            where ${evidence.claimId} = ${acceptanceClaims.id}
              and ${evidence.evidenceKind} = 'official_payment_page'
              and ${evidence.reviewStatus} = 'accepted'
          )
      ) = ${targets.length} then 1 else 0 end as reviewed_publication_guard
    `),
    db.execute(sql`
      update ${entities} as e
      set slug = 'merchant-' || l.slug,
          visibility = 'public'
      from ${locations} as l
      where l.entity_id = e.id
        and e.id in (${entityList})
        and l.id in (${locationList})
        and e.visibility in ('hidden', 'public')
        and length('merchant-' || l.slug) <= 64
    `),
    db.update(locations).set({ visibility: 'public' }).where(inArray(locations.id, locationIds)),
    db
      .update(acceptanceClaims)
      .set({ visibility: 'public' })
      .where(
        and(inArray(acceptanceClaims.id, claimIds), eq(acceptanceClaims.claimStatus, 'confirmed')),
      ),
    db
      .update(evidence)
      .set({ visibility: 'public' })
      .where(and(inArray(evidence.id, evidenceIds), eq(evidence.reviewStatus, 'accepted'))),
  ]);

  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(acceptanceClaims)
    .where(and(inArray(acceptanceClaims.id, claimIds), eq(acceptanceClaims.visibility, 'public')));

  const publicClaimsAfter = Number(count?.count ?? 0);
  if (publicClaimsAfter !== targets.length) {
    throw new Error(
      `Publication postcondition failed: expected ${targets.length} public claims, got ${publicClaimsAfter}.`,
    );
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      reviewedTargets: targets.length,
      eligibleReviewedTargets: eligible.length,
      alreadyPublicCount,
      maxPublicationBatch: MAX_PUBLICATION_BATCH,
      publicationConfigured: true,
      publisherAuthorized: true,
      mutationPerformed: true,
      publicClaimsAfter,
      entityCount: entityIds.length,
      locationCount: locationIds.length,
      evidenceCount: evidenceIds.length,
      payloadExposed: false,
    }),
  );
}

await main();
