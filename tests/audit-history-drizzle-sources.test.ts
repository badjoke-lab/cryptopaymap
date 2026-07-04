import { describe, expect, it } from 'vitest';
import {
  createDrizzleAuditHistorySources,
  createDrizzleCandidateDuplicateAuditSource,
} from '../src/admin/audit-history/drizzle-sources';
import type { CryptoPayMapDatabase } from '../src/db/client';
import {
  candidateDuplicateDecisions,
  candidatePromotionDecisions,
  evidenceReviewDecisions,
  exportActivationRecords,
  exportReleaseDecisions,
  mediaReviewDecisions,
  reconfirmationExpirations,
} from '../src/db/schema';

const actorId = 'cloudflare-access:reviewer';
const requestId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const targetId = '30000000-0000-4000-8000-000000000001';
const secondaryId = '40000000-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
const previousDigest = 'b'.repeat(64);
const occurredAt = new Date('2026-07-04T10:00:00.000Z');

function rowsByTable(): Map<unknown, unknown[]> {
  return new Map([
    [
      candidateDuplicateDecisions,
      [
        {
          id,
          requestId,
          duplicateGroupId: targetId,
          action: 'confirm_duplicate',
          memberCandidateIds: [secondaryId, '40000000-0000-4000-8000-000000000002'],
          reasonCode: 'manual_match',
          actorId,
          actorType: 'human',
          decidedAt: occurredAt,
        },
      ],
    ],
    [
      candidatePromotionDecisions,
      [
        {
          id,
          requestId,
          candidateId: targetId,
          claimId: secondaryId,
          actorId,
          actorType: 'human',
          promotedAt: occurredAt,
        },
      ],
    ],
    [
      evidenceReviewDecisions,
      [
        {
          id,
          requestId,
          evidenceId: targetId,
          claimId: secondaryId,
          claimAction: 'confirm',
          actorId,
          actorType: 'human',
          reasonCode: 'supports_claim',
          publicSummary: 'Evidence supports the claim.',
          fromClaimStatus: 'candidate',
          toClaimStatus: 'confirmed',
          decidedAt: occurredAt,
        },
      ],
    ],
    [
      reconfirmationExpirations,
      [
        {
          id,
          requestId,
          claimId: targetId,
          actorId: 'system:reconfirmation',
          actorType: 'system',
          reasonCode: 'review_window_expired',
          publicSummary: 'Review window expired.',
          fromClaimStatus: 'confirmed',
          toClaimStatus: 'stale',
          effectiveAt: occurredAt,
        },
      ],
    ],
    [
      mediaReviewDecisions,
      [
        {
          id,
          requestId,
          mediaAssetId: targetId,
          action: 'approve_public',
          actorId,
          actorType: 'human',
          expectedSubjectType: 'claim',
          expectedSubjectId: secondaryId,
          reasonCode: 'approved_for_public_gallery',
          publicSummary: 'Approved for public display.',
          expectedReviewStatus: 'pending',
          toReviewStatus: 'accepted',
          decidedAt: occurredAt,
        },
      ],
    ],
    [
      exportReleaseDecisions,
      [
        {
          id,
          requestId,
          action: 'approve',
          releaseStatus: 'approved',
          snapshotDigest: digest,
          actorId,
          actorType: 'human',
          reasonCode: 'approved_release',
          publicSummary: 'Release approved.',
          candidateStatus: 'eligible',
          decidedAt: occurredAt,
        },
      ],
    ],
    [
      exportActivationRecords,
      [
        {
          id,
          requestId,
          snapshotDigest: digest,
          previousSnapshotDigest: previousDigest,
          actorId,
          actorType: 'human',
          reasonCode: 'activate_approved_release',
          publishedAt: occurredAt,
        },
      ],
    ],
  ]);
}

function fakeDatabase(rows: Map<unknown, unknown[]>) {
  const limits: number[] = [];
  const tables: unknown[] = [];
  const database = {
    select() {
      return {
        from(table: unknown) {
          tables.push(table);
          return {
            orderBy() {
              return {
                async limit(value: number) {
                  limits.push(value);
                  return (rows.get(table) ?? []).slice(0, value);
                },
              };
            },
          };
        },
      };
    },
  };
  return { database: database as unknown as CryptoPayMapDatabase, limits, tables };
}

describe('audit history Drizzle sources', () => {
  it('exposes all durable Phase 3 audit sources with expected domains', () => {
    const { database } = fakeDatabase(rowsByTable());
    const sources = createDrizzleAuditHistorySources(database);

    expect(sources.map((source) => source.domain)).toEqual([
      'candidate',
      'candidate',
      'evidence',
      'reconfirmation',
      'media',
      'export',
      'export',
    ]);
  });

  it('loads one extra row and normalizes every durable source', async () => {
    const state = fakeDatabase(rowsByTable());
    const sources = createDrizzleAuditHistorySources(state.database);
    const batches = await Promise.all(
      sources.map((source) => source.loadAuditHistorySource({ limit: 1 }, 1)),
    );

    expect(state.limits).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(batches.flatMap((batch) => batch.items.map((item) => item.sourceKind))).toEqual([
      'candidate_duplicate_decision',
      'candidate_promotion',
      'evidence_review_decision',
      'reconfirmation_expiration',
      'media_review_decision',
      'export_release_decision',
      'export_activation',
    ]);
    expect(batches.every((batch) => batch.hasMore === false)).toBe(true);
  });

  it('marks source pagination when more than the requested source limit exists', async () => {
    const rows = rowsByTable();
    const duplicateRows = rows.get(candidateDuplicateDecisions) ?? [];
    rows.set(candidateDuplicateDecisions, [...duplicateRows, ...duplicateRows]);
    const state = fakeDatabase(rows);

    const batch = await createDrizzleCandidateDuplicateAuditSource(
      state.database,
    ).loadAuditHistorySource({ limit: 1 }, 1);

    expect(batch.items).toHaveLength(1);
    expect(batch.hasMore).toBe(true);
    expect(state.limits).toEqual([2]);
  });
});
