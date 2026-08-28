export interface AcquisitionSeedSnapshot {
  candidateId: string;
  sourceId: string;
  externalId: string;
  contentHash: string;
  normalizedName: string;
  latitude: number | null;
  longitude: number | null;
  officialDomain: string | null;
}

export interface ExistingCandidateSnapshot extends AcquisitionSeedSnapshot {
  candidateStatus: string;
}

export interface AcquisitionReconciliationPlan {
  newSeeds: AcquisitionSeedSnapshot[];
  unchangedSeeds: Array<{
    incoming: AcquisitionSeedSnapshot;
    existing: ExistingCandidateSnapshot;
  }>;
  changedSeeds: Array<{
    incoming: AcquisitionSeedSnapshot;
    existing: ExistingCandidateSnapshot;
  }>;
  duplicateSignals: Array<{
    leftCandidateId: string;
    rightCandidateId: string;
    reason:
      | 'shared_osm_identity'
      | 'same_name_and_coordinates'
      | 'shared_official_domain'
      | 'same_normalized_name';
    strength: 'strong' | 'review';
  }>;
  automaticConfirmedCount: 0;
}

function sourceIdentity(seed: AcquisitionSeedSnapshot): string {
  return `${seed.sourceId}\u0000${seed.externalId}`;
}

function orderedPair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

function sameCoordinates(left: AcquisitionSeedSnapshot, right: AcquisitionSeedSnapshot): boolean {
  return (
    left.latitude !== null &&
    left.longitude !== null &&
    right.latitude !== null &&
    right.longitude !== null &&
    Math.abs(left.latitude - right.latitude) <= 0.0001 &&
    Math.abs(left.longitude - right.longitude) <= 0.0001
  );
}

function duplicateSignal(
  left: AcquisitionSeedSnapshot,
  right: AcquisitionSeedSnapshot,
): AcquisitionReconciliationPlan['duplicateSignals'][number] | null {
  const [leftCandidateId, rightCandidateId] = orderedPair(left.candidateId, right.candidateId);

  if (sourceIdentity(left) === sourceIdentity(right)) {
    return {
      leftCandidateId,
      rightCandidateId,
      reason: 'shared_osm_identity',
      strength: 'strong',
    };
  }
  if (left.normalizedName === right.normalizedName && sameCoordinates(left, right)) {
    return {
      leftCandidateId,
      rightCandidateId,
      reason: 'same_name_and_coordinates',
      strength: 'strong',
    };
  }
  if (
    left.officialDomain !== null &&
    right.officialDomain !== null &&
    left.officialDomain === right.officialDomain
  ) {
    return {
      leftCandidateId,
      rightCandidateId,
      reason: 'shared_official_domain',
      strength: 'review',
    };
  }
  if (left.normalizedName === right.normalizedName) {
    return {
      leftCandidateId,
      rightCandidateId,
      reason: 'same_normalized_name',
      strength: 'review',
    };
  }
  return null;
}

export function reconcileCandidateAcquisition(
  incoming: readonly AcquisitionSeedSnapshot[],
  existing: readonly ExistingCandidateSnapshot[],
): AcquisitionReconciliationPlan {
  const existingBySourceIdentity = new Map(
    existing.map((item) => [sourceIdentity(item), item]),
  );
  const newSeeds: AcquisitionSeedSnapshot[] = [];
  const unchangedSeeds: AcquisitionReconciliationPlan['unchangedSeeds'] = [];
  const changedSeeds: AcquisitionReconciliationPlan['changedSeeds'] = [];

  for (const seed of incoming) {
    const matched = existingBySourceIdentity.get(sourceIdentity(seed));
    if (matched === undefined) {
      newSeeds.push(seed);
    } else if (matched.contentHash === seed.contentHash) {
      unchangedSeeds.push({ incoming: seed, existing: matched });
    } else {
      changedSeeds.push({ incoming: seed, existing: matched });
    }
  }

  const duplicateSignals: AcquisitionReconciliationPlan['duplicateSignals'] = [];
  const seenSignals = new Set<string>();
  const comparisonPool: AcquisitionSeedSnapshot[] = [...existing, ...newSeeds];

  for (const seed of newSeeds) {
    for (const other of comparisonPool) {
      if (seed.candidateId === other.candidateId) continue;
      const signal = duplicateSignal(seed, other);
      if (signal === null) continue;
      const key = `${signal.leftCandidateId}:${signal.rightCandidateId}:${signal.reason}`;
      if (seenSignals.has(key)) continue;
      seenSignals.add(key);
      duplicateSignals.push(signal);
    }
  }

  return {
    newSeeds,
    unchangedSeeds,
    changedSeeds,
    duplicateSignals,
    automaticConfirmedCount: 0,
  };
}
