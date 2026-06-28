import { desc, eq, inArray } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import {
  candidateDuplicateGroups,
  candidateSourceRecords,
  importBatches,
  licenses,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../../db/schema';
import type {
  CandidateDetailBackend,
  CandidateDetailData,
  CandidateDetailSource,
} from './detail';
import { projectCandidateSourceSnapshot } from './source-snapshot';

const maximumSources = 100;

function safeHttpUrl(value: string | null): string | null {
  if (value === null || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export function createDrizzleCandidateDetailBackend(
  database: CryptoPayMapDatabase,
): CandidateDetailBackend {
  return {
    async loadDetail(candidateId: string): Promise<CandidateDetailData | null> {
      const candidateRows = await database
        .select({
          id: sourceCandidates.id,
          name: sourceCandidates.normalizedName,
          candidateType: sourceCandidates.candidateType,
          status: sourceCandidates.candidateStatus,
          priority: sourceCandidates.priority,
          firstSeenAt: sourceCandidates.firstSeenAt,
          lastSeenAt: sourceCandidates.lastSeenAt,
          importBatchId: sourceCandidates.importBatchId,
          duplicateGroupId: sourceCandidates.duplicateGroupId,
          duplicateGroupStatus: candidateDuplicateGroups.status,
          canonicalEntityId: sourceCandidates.canonicalEntityId,
          canonicalLocationId: sourceCandidates.canonicalLocationId,
          createdAt: sourceCandidates.createdAt,
          updatedAt: sourceCandidates.updatedAt,
        })
        .from(sourceCandidates)
        .leftJoin(
          candidateDuplicateGroups,
          eq(sourceCandidates.duplicateGroupId, candidateDuplicateGroups.id),
        )
        .where(eq(sourceCandidates.id, candidateId))
        .limit(1);

      const candidate = candidateRows[0];
      if (!candidate) return null;

      const [sourceRows, importRows] = await Promise.all([
        database
          .select({
            id: sourceRecords.id,
            relationship: candidateSourceRecords.relationship,
            sourceName: sources.name,
            sourceType: sources.sourceType,
            sourceActive: sources.isActive,
            sourceUrl: sourceRecords.sourceUrl,
            archiveUrl: sourceRecords.archiveUrl,
            rawPayload: sourceRecords.rawPayload,
            observedAt: sourceRecords.observedAt,
            publishedAt: sourceRecords.publishedAt,
            fetchedAt: sourceRecords.fetchedAt,
            explicitLicenseId: sourceRecords.licenseId,
            defaultLicenseId: sources.defaultLicenseId,
          })
          .from(candidateSourceRecords)
          .innerJoin(sourceRecords, eq(candidateSourceRecords.sourceRecordId, sourceRecords.id))
          .innerJoin(sources, eq(sourceRecords.sourceId, sources.id))
          .where(eq(candidateSourceRecords.candidateId, candidateId))
          .orderBy(desc(sourceRecords.fetchedAt), desc(sourceRecords.id))
          .limit(maximumSources + 1),
        candidate.importBatchId === null
          ? Promise.resolve([])
          : database
              .select({
                importKind: importBatches.importKind,
                sourceName: sources.name,
                sourceType: sources.sourceType,
                sourceSchemaVersion: importBatches.sourceSchemaVersion,
                importerVersion: importBatches.importerVersion,
                completedAt: importBatches.completedAt,
              })
              .from(importBatches)
              .innerJoin(sources, eq(importBatches.sourceId, sources.id))
              .where(eq(importBatches.id, candidate.importBatchId))
              .limit(1),
      ]);

      const sourcesTruncated = sourceRows.length > maximumSources;
      const boundedSourceRows = sourcesTruncated ? sourceRows.slice(0, maximumSources) : sourceRows;
      const licenseIds = [
        ...new Set(
          boundedSourceRows
            .flatMap((row) => [row.explicitLicenseId, row.defaultLicenseId])
            .filter((value): value is string => value !== null),
        ),
      ];
      const licenseRows =
        licenseIds.length === 0
          ? []
          : await database
              .select({
                id: licenses.id,
                slug: licenses.slug,
                name: licenses.name,
                version: licenses.version,
                attributionRequired: licenses.attributionRequired,
                shareAlike: licenses.shareAlike,
              })
              .from(licenses)
              .where(inArray(licenses.id, licenseIds));
      const licensesById = new Map(licenseRows.map((license) => [license.id, license]));

      const detailSources: CandidateDetailSource[] = boundedSourceRows.map((row) => {
        const licenseId = row.explicitLicenseId ?? row.defaultLicenseId;
        const license = licenseId === null ? null : (licensesById.get(licenseId) ?? null);
        return {
          id: row.id,
          relationship: row.relationship,
          sourceName: row.sourceName,
          sourceType: row.sourceType,
          sourceActive: row.sourceActive,
          sourceUrl: safeHttpUrl(row.sourceUrl),
          archiveUrl: safeHttpUrl(row.archiveUrl),
          observedAt: row.observedAt?.toISOString() ?? null,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          fetchedAt: row.fetchedAt.toISOString(),
          license:
            license === null
              ? null
              : {
                  slug: license.slug,
                  name: license.name,
                  version: license.version,
                  attributionRequired: license.attributionRequired,
                  shareAlike: license.shareAlike,
                },
          snapshot: projectCandidateSourceSnapshot(candidate.candidateType, row.rawPayload),
        };
      });

      const importOrigin = importRows[0];
      return {
        candidate: {
          id: candidate.id,
          name: candidate.name,
          candidateType: candidate.candidateType,
          status: candidate.status,
          priority: candidate.priority,
          firstSeenAt: candidate.firstSeenAt.toISOString(),
          lastSeenAt: candidate.lastSeenAt.toISOString(),
          createdAt: candidate.createdAt.toISOString(),
          updatedAt: candidate.updatedAt.toISOString(),
          duplicateSignal: candidate.duplicateGroupId !== null,
          duplicateGroupStatus: candidate.duplicateGroupStatus,
          linkedEntity: candidate.canonicalEntityId !== null,
          linkedLocation: candidate.canonicalLocationId !== null,
        },
        importOrigin: importOrigin
          ? {
              importKind: importOrigin.importKind,
              sourceName: importOrigin.sourceName,
              sourceType: importOrigin.sourceType,
              sourceSchemaVersion: importOrigin.sourceSchemaVersion,
              importerVersion: importOrigin.importerVersion,
              completedAt: importOrigin.completedAt.toISOString(),
            }
          : null,
        sources: detailSources,
        sourcesTruncated,
      };
    },
  };
}
