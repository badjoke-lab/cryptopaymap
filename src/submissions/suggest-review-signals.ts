import { z } from 'zod';
import {
  candidateDuplicateSignalReasonValues,
  candidateDuplicateSignalStrengthValues,
  candidateStatusValues,
} from '../db/schema';
import {
  candidateCanonicalTargetOptionSchema,
  type CandidateCanonicalTargetOption,
  type CandidateCanonicalTargetSearchBackend,
} from '../admin/promotion/target-selection';
import { normalizeCandidateName } from '../schemas/source-provenance';
import type { CandidateSourceSnapshot } from '../admin/candidates/detail';
import type { SuggestReviewProjection } from './suggest-contract';

const timestampSchema = z.iso.datetime({ offset: true });

export const suggestCanonicalTargetSignalReasonValues = [
  'same_normalized_name',
  'shared_official_domain',
  'same_address',
  'near_coordinates',
] as const;
export const suggestCanonicalTargetSignalReasonSchema = z.enum(
  suggestCanonicalTargetSignalReasonValues,
);

export const suggestCandidateSignalSchema = z
  .object({
    candidateId: z.uuid(),
    candidateType: z.enum(['physical_place', 'online_service']),
    candidateStatus: z.enum(candidateStatusValues),
    duplicateGroupId: z.uuid().nullable(),
    reasons: z
      .array(
        z
          .object({
            reason: z.enum(candidateDuplicateSignalReasonValues),
            strength: z.enum(candidateDuplicateSignalStrengthValues),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();

export const suggestCanonicalTargetSignalSchema = z
  .object({
    target: candidateCanonicalTargetOptionSchema,
    reasons: z.array(suggestCanonicalTargetSignalReasonSchema).min(1).max(4),
    strength: z.enum(candidateDuplicateSignalStrengthValues),
  })
  .strict();

export const suggestReviewSignalResponseSchema = z
  .object({
    generatedAt: timestampSchema,
    candidateSignals: z.array(suggestCandidateSignalSchema).max(25),
    canonicalTargetSignals: z.array(suggestCanonicalTargetSignalSchema).max(25),
    coverage: z
      .object({
        candidateSearchComplete: z.boolean(),
        canonicalSearchComplete: z.boolean(),
        absenceIsConclusive: z.literal(false),
      })
      .strict(),
  })
  .strict();

export interface SuggestCandidateSignalMaterial {
  candidateId: string;
  candidateType: 'physical_place' | 'online_service';
  candidateStatus: (typeof candidateStatusValues)[number];
  normalizedName: string;
  duplicateGroupId: string | null;
  snapshots: CandidateSourceSnapshot[];
}

export interface SuggestCandidateSignalSearchInput {
  candidateType: 'physical_place' | 'online_service';
  normalizedName: string;
  officialDomain: string | null;
  limit: number;
}

export interface SuggestCandidateSignalSearchBackend {
  searchCandidateSignalMaterial(
    input: SuggestCandidateSignalSearchInput,
  ): Promise<SuggestCandidateSignalMaterial[]>;
}

export interface SuggestReviewSignalDependencies {
  candidateBackend: SuggestCandidateSignalSearchBackend;
  canonicalTargetBackend: CandidateCanonicalTargetSearchBackend;
}

export type SuggestReviewSignalResponse = z.infer<typeof suggestReviewSignalResponseSchema>;

export class SuggestReviewSignalError extends Error {
  constructor(
    readonly code: 'invalid_projection' | 'backend_failure' | 'invalid_response',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SuggestReviewSignalError';
  }
}

function officialDomain(url: string | null): string | null {
  if (url === null) return null;
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

function normalizedAddress(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return normalized.length === 0 ? null : normalized;
}

function coordinateDistanceMeters(
  leftLatitude: number,
  leftLongitude: number,
  rightLatitude: number,
  rightLongitude: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(rightLatitude - leftLatitude);
  const longitudeDelta = radians(rightLongitude - leftLongitude);
  const leftLatitudeRadians = radians(leftLatitude);
  const rightLatitudeRadians = radians(rightLatitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitudeRadians) *
      Math.cos(rightLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function candidateSignalReasons(
  projection: SuggestReviewProjection,
  material: SuggestCandidateSignalMaterial,
): Array<{
  reason: (typeof candidateDuplicateSignalReasonValues)[number];
  strength: (typeof candidateDuplicateSignalStrengthValues)[number];
}> {
  const reasons: Array<{
    reason: (typeof candidateDuplicateSignalReasonValues)[number];
    strength: (typeof candidateDuplicateSignalStrengthValues)[number];
  }> = [];
  const suggestedName = normalizeCandidateName(projection.entity.name);

  if (projection.suggestionKind === 'physical_place') {
    if (material.candidateType !== 'physical_place' || material.normalizedName !== suggestedName) {
      return reasons;
    }
    const latitude = projection.place?.latitude ?? null;
    const longitude = projection.place?.longitude ?? null;
    if (latitude === null || longitude === null) return reasons;
    const matchingCoordinates = material.snapshots.some(
      (snapshot) =>
        snapshot.kind === 'physical_place' &&
        snapshot.latitude.toFixed(6) === latitude.toFixed(6) &&
        snapshot.longitude.toFixed(6) === longitude.toFixed(6),
    );
    if (matchingCoordinates) {
      reasons.push({ reason: 'same_name_and_coordinates', strength: 'review' });
    }
    return reasons;
  }

  if (material.candidateType !== 'online_service') return reasons;
  const suggestedDomain = officialDomain(projection.entity.websiteUrl);
  if (suggestedDomain !== null) {
    const domainMatch = material.snapshots.some(
      (snapshot) =>
        snapshot.kind === 'online_service' &&
        officialDomain(snapshot.websiteUrl) === suggestedDomain,
    );
    if (domainMatch) {
      reasons.push({ reason: 'shared_official_domain', strength: 'strong' });
    }
  }
  if (material.normalizedName === suggestedName) {
    reasons.push({ reason: 'same_normalized_name', strength: 'review' });
  }
  return reasons;
}

function canonicalTargetReasons(
  projection: SuggestReviewProjection,
  target: CandidateCanonicalTargetOption,
): Array<(typeof suggestCanonicalTargetSignalReasonValues)[number]> {
  const reasons: Array<(typeof suggestCanonicalTargetSignalReasonValues)[number]> = [];
  if (
    normalizeCandidateName(target.entity.name) === normalizeCandidateName(projection.entity.name)
  ) {
    reasons.push('same_normalized_name');
  }

  const suggestedDomain = officialDomain(projection.entity.websiteUrl);
  const targetDomain = officialDomain(target.entity.websiteUrl);
  if (suggestedDomain !== null && targetDomain === suggestedDomain) {
    reasons.push('shared_official_domain');
  }

  if (projection.suggestionKind === 'physical_place' && target.location !== null) {
    const suggestedAddress = normalizedAddress(projection.place?.addressLine ?? null);
    const targetAddress = normalizedAddress(target.location.addressLine);
    if (suggestedAddress !== null && targetAddress === suggestedAddress) {
      reasons.push('same_address');
    }
    const latitude = projection.place?.latitude ?? null;
    const longitude = projection.place?.longitude ?? null;
    if (
      latitude !== null &&
      longitude !== null &&
      coordinateDistanceMeters(
        latitude,
        longitude,
        target.location.latitude,
        target.location.longitude,
      ) <= 100
    ) {
      reasons.push('near_coordinates');
    }
  }

  return reasons;
}

function canonicalSearchQueries(projection: SuggestReviewProjection): string[] {
  const queries = [projection.entity.name];
  if (projection.suggestionKind === 'physical_place') {
    if (projection.place?.addressLine) queries.push(projection.place.addressLine);
    if (projection.place?.locality) queries.push(projection.place.locality);
  } else {
    const domain = officialDomain(projection.entity.websiteUrl);
    if (domain !== null) queries.push(domain);
  }
  return [
    ...new Set(queries.map((query) => query.trim()).filter((query) => query.length >= 2)),
  ].slice(0, 3);
}

export async function generateSuggestReviewSignals(
  projection: SuggestReviewProjection,
  dependencies: SuggestReviewSignalDependencies,
  asOf = new Date(),
): Promise<SuggestReviewSignalResponse> {
  if (Number.isNaN(asOf.getTime())) {
    throw new SuggestReviewSignalError('invalid_projection', 'Suggest signal time is invalid.');
  }

  const candidateType = projection.suggestionKind;
  const normalizedName = normalizeCandidateName(projection.entity.name);
  const domain = officialDomain(projection.entity.websiteUrl);
  const queries = canonicalSearchQueries(projection);

  let candidateMaterial: SuggestCandidateSignalMaterial[];
  let canonicalSearchResults: CandidateCanonicalTargetOption[][];
  try {
    [candidateMaterial, canonicalSearchResults] = await Promise.all([
      dependencies.candidateBackend.searchCandidateSignalMaterial({
        candidateType,
        normalizedName,
        officialDomain: domain,
        limit: 25,
      }),
      Promise.all(
        queries.map((query) =>
          dependencies.canonicalTargetBackend.searchTargets(candidateType, query, 10),
        ),
      ),
    ]);
  } catch (error) {
    throw new SuggestReviewSignalError(
      'backend_failure',
      'Suggest review signals could not be generated.',
      { cause: error },
    );
  }

  const candidateSignals = candidateMaterial
    .map((material) => ({
      candidateId: material.candidateId,
      candidateType: material.candidateType,
      candidateStatus: material.candidateStatus,
      duplicateGroupId: material.duplicateGroupId,
      reasons: candidateSignalReasons(projection, material),
    }))
    .filter((signal) => signal.reasons.length > 0)
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .slice(0, 25);

  const canonicalTargets = new Map<string, CandidateCanonicalTargetOption>();
  for (const results of canonicalSearchResults) {
    for (const target of results) canonicalTargets.set(target.canonicalPath, target);
  }
  const canonicalTargetSignals = [...canonicalTargets.values()]
    .map((target) => {
      const reasons = canonicalTargetReasons(projection, target);
      return {
        target,
        reasons,
        strength: reasons.includes('shared_official_domain')
          ? ('strong' as const)
          : ('review' as const),
      };
    })
    .filter((signal) => signal.reasons.length > 0)
    .sort((left, right) => left.target.canonicalPath.localeCompare(right.target.canonicalPath))
    .slice(0, 25);

  const result = suggestReviewSignalResponseSchema.safeParse({
    generatedAt: asOf.toISOString(),
    candidateSignals,
    canonicalTargetSignals,
    coverage: {
      candidateSearchComplete: true,
      canonicalSearchComplete: true,
      absenceIsConclusive: false,
    },
  });
  if (!result.success) {
    throw new SuggestReviewSignalError(
      'invalid_response',
      'Suggest review signal backends returned an invalid bounded response.',
      { cause: result.error },
    );
  }
  return result.data;
}
