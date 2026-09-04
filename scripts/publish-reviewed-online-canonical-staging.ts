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
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const TARGET = 'fixed-review-staging';
const MAX_PUBLICATION_BATCH = 50;

async function deterministicUuid(label: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label))).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x40;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) {
    throw new Error(`Refusing online publication outside ${TARGET}.`);
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
      claimId: candidatePromotionDecisions.claimId,
      evidenceId: evidence.id,
      entitySlug: entities.slug,
      entityWebsiteUrl: entities.websiteUrl,
      entityVisibility: entities.visibility,
      claimVisibility: acceptanceClaims.visibility,
      evidenceVisibility: evidence.visibility,
    })
    .from(sourceCandidates)
    .innerJoin(candidatePromotionDecisions, eq(candidatePromotionDecisions.candidateId, sourceCandidates.id))
    .innerJoin(entities, eq(entities.id, candidatePromotionDecisions.entityId))
    .innerJoin(acceptanceClaims, eq(acceptanceClaims.id, candidatePromotionDecisions.claimId))
    .innerJoin(evidence, eq(evidence.claimId, acceptanceClaims.id))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'online_service'),
        eq(sourceCandidates.candidateStatus, 'promoted'),
        eq(entities.entityType, 'online_service'),
        eq(acceptanceClaims.claimScope, 'online_service'),
        eq(acceptanceClaims.claimStatus, 'confirmed'),
        eq(acceptanceClaims.customerPaysCrypto, true),
        eq(acceptanceClaims.merchantExplicitlyAcceptsCrypto, true),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.reviewStatus, 'accepted'),
        sql`${sourceCandidates.duplicateGroupId} is null`,
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const targets = [...new Map(rows.map((row) => [row.claimId, row])).values()].slice(0, MAX_PUBLICATION_BATCH);
  if (targets.length === 0) {
    console.log(JSON.stringify({ target: TARGET, reviewedTargets: 0, publicationConfigured: policy.configured, publisherAuthorized, mutationPerformed: false, reason: 'no_eligible_reviewed_online_targets', payloadExposed: false }));
    return;
  }
  if (targets.some((row) => !row.entitySlug || !row.entityWebsiteUrl?.startsWith('https://'))) {
    throw new Error('An online publication target is missing its public slug or HTTPS website.');
  }

  const alreadyPublic = targets.every((row) => row.entityVisibility === 'public' && row.claimVisibility === 'public' && row.evidenceVisibility === 'public');
  if (!publisherAuthorized) {
    console.log(JSON.stringify({ target: TARGET, reviewedTargets: targets.length, publicationConfigured: policy.configured, publisherAuthorized: false, alreadyPublic, mutationPerformed: false, payloadExposed: false }));
    return;
  }

  const claimIds = targets.map((row) => row.claimId).sort();
  const requestId = await deterministicUuid(`reviewed-online-canonical-publication:v1:${claimIds.join(',')}`);
  authorizeExportPublication(publisher, policy, requestId);
  if (alreadyPublic) {
    console.log(JSON.stringify({ target: TARGET, reviewedTargets: targets.length, publicationConfigured: true, publisherAuthorized: true, alreadyPublic: true, mutationPerformed: false, publicClaimsAfter: targets.length, payloadExposed: false }));
    return;
  }

  const entityIds = targets.map((row) => row.entityId);
  const evidenceIds = targets.map((row) => row.evidenceId);
  await db.batch([
    db.update(entities).set({ visibility: 'public' }).where(and(inArray(entities.id, entityIds), eq(entities.entityType, 'online_service'))),
    db.update(acceptanceClaims).set({ visibility: 'public' }).where(and(inArray(acceptanceClaims.id, claimIds), eq(acceptanceClaims.claimStatus, 'confirmed'), eq(acceptanceClaims.claimScope, 'online_service'))),
    db.update(evidence).set({ visibility: 'public' }).where(and(inArray(evidence.id, evidenceIds), eq(evidence.reviewStatus, 'accepted'))),
  ]);

  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(acceptanceClaims).where(and(inArray(acceptanceClaims.id, claimIds), eq(acceptanceClaims.visibility, 'public')));
  const publicClaimsAfter = Number(count?.count ?? 0);
  if (publicClaimsAfter !== targets.length) throw new Error(`Online publication postcondition failed: expected ${targets.length}, got ${publicClaimsAfter}.`);

  console.log(JSON.stringify({
    target: TARGET,
    reviewedTargets: targets.length,
    maxPublicationBatch: MAX_PUBLICATION_BATCH,
    publicationConfigured: true,
    publisherAuthorized: true,
    alreadyPublic: false,
    mutationPerformed: true,
    publicClaimsAfter,
    entityCount: entityIds.length,
    evidenceCount: evidenceIds.length,
    payloadExposed: false,
  }));
}

await main();
