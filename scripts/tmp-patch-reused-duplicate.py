from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


persistence = Path("src/importers/candidate-ingestion-persistence.ts")
text = persistence.read_text()

text = replace_once(
    text,
    "export interface CandidateIngestionPersistencePlan {",
    """export interface ExistingDuplicateGroupReference {
  duplicateGroupId: string;
  expectedStatus: 'open';
  existingMemberCandidateIds: string[];
}

export interface CandidateIngestionPersistencePlan {""",
    "persistence reused-group interface",
)
text = replace_once(
    text,
    "  existingCandidateDuplicateAssignments?: ExistingCandidateDuplicateAssignment[];\n  duplicateGroups?: NewCandidateDuplicateGroup[];",
    "  existingCandidateDuplicateAssignments?: ExistingCandidateDuplicateAssignment[];\n  reusedDuplicateGroups?: ExistingDuplicateGroupReference[];\n  duplicateGroups?: NewCandidateDuplicateGroup[];",
    "persistence plan property",
)
text = replace_once(
    text,
    "  const existingCandidateDuplicateAssignments = plan.existingCandidateDuplicateAssignments ?? [];\n  const duplicateGroups = plan.duplicateGroups ?? [];",
    "  const existingCandidateDuplicateAssignments = plan.existingCandidateDuplicateAssignments ?? [];\n  const reusedDuplicateGroups = plan.reusedDuplicateGroups ?? [];\n  const duplicateGroups = plan.duplicateGroups ?? [];",
    "persistence validator local",
)

reused_validation = """  const reusedMemberGroupByCandidate = new Map<string, string>();
  for (const reference of reusedDuplicateGroups) {
    if (
      reference.duplicateGroupId.trim().length === 0 ||
      reference.expectedStatus !== 'open' ||
      reference.existingMemberCandidateIds.length === 0
    ) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Reused duplicate groups require an open group ID and at least one existing member.',
      );
    }
    if (duplicateGroupIds.has(reference.duplicateGroupId)) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'A duplicate group may be created or reused at most once per ingestion plan.',
      );
    }
    duplicateGroupIds.add(reference.duplicateGroupId);

    const memberIds = new Set(reference.existingMemberCandidateIds);
    if (memberIds.size !== reference.existingMemberCandidateIds.length) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Reused duplicate-group member IDs must be unique.',
      );
    }
    for (const candidateId of memberIds) {
      if (
        candidateId.trim().length === 0 ||
        candidateIds.has(candidateId) ||
        refreshedCandidateIds.has(candidateId) ||
        reusedMemberGroupByCandidate.has(candidateId)
      ) {
        throw new CandidateIngestionPersistenceError(
          'invalid_plan',
          'Reused duplicate-group members must be distinct existing Candidates.',
        );
      }
      reusedMemberGroupByCandidate.set(candidateId, reference.duplicateGroupId);
    }
  }

"""
text = replace_once(
    text,
    "  const groupMembers = new Map<string, Set<string>>();",
    reused_validation + "  const groupMembers = new Map<string, Set<string>>();",
    "persistence reused-group validation insertion",
)
text = replace_once(
    text,
    "      refreshedCandidateIds.has(assignment.candidateId) ||\n      existingAssignmentCandidateIds.has(assignment.candidateId)",
    "      refreshedCandidateIds.has(assignment.candidateId) ||\n      reusedMemberGroupByCandidate.has(assignment.candidateId) ||\n      existingAssignmentCandidateIds.has(assignment.candidateId)",
    "persistence assignment uniqueness",
)
text = replace_once(
    text,
    "  const signalCandidateIds = new Set([...candidateIds, ...existingAssignmentCandidateIds]);",
    """  const signalCandidateIds = new Set([
    ...candidateIds,
    ...existingAssignmentCandidateIds,
    ...reusedMemberGroupByCandidate.keys(),
  ]);""",
    "persistence signal candidate set",
)
group_match_guard = """    for (const candidateId of [signal.leftCandidateId, signal.rightCandidateId]) {
      const reusedGroupId = reusedMemberGroupByCandidate.get(candidateId);
      if (reusedGroupId !== undefined && reusedGroupId !== signal.duplicateGroupId) {
        throw new CandidateIngestionPersistenceError(
          'invalid_plan',
          'A reused duplicate-group member may be signaled only inside its existing group.',
        );
      }
    }
"""
text = replace_once(
    text,
    "    const members = groupMembers.get(signal.duplicateGroupId) ?? new Set<string>();",
    group_match_guard + "    const members = groupMembers.get(signal.duplicateGroupId) ?? new Set<string>();",
    "persistence signal group guard",
)
reused_signal_guard = """  for (const reference of reusedDuplicateGroups) {
    const members = groupMembers.get(reference.duplicateGroupId);
    if (
      members === undefined ||
      !reference.existingMemberCandidateIds.some((candidateId) => members.has(candidateId))
    ) {
      throw new CandidateIngestionPersistenceError(
        'invalid_plan',
        'Every reused duplicate group must include a declared existing member in its signals.',
      );
    }
  }
"""
text = replace_once(
    text,
    "  for (const candidate of plan.candidates) {\n    if (\n      candidate.duplicateGroupId != null &&",
    reused_signal_guard
    + "  for (const candidate of plan.candidates) {\n    if (\n      candidate.duplicateGroupId != null &&",
    "persistence reused-group signal membership",
)

guards = """function existingDuplicateGroupGuard(
  database: CryptoPayMapDatabase,
  reference: ExistingDuplicateGroupReference,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${candidateDuplicateGroups}
      where ${candidateDuplicateGroups.id} = ${reference.duplicateGroupId}
        and ${candidateDuplicateGroups.status} = ${reference.expectedStatus}
      for update
    ) then 1 else 0 end as existing_duplicate_group_guard
  `);
}

function existingDuplicateGroupMemberGuard(
  database: CryptoPayMapDatabase,
  reference: ExistingDuplicateGroupReference,
  candidateId: string,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${sourceCandidates}
      where ${sourceCandidates.id} = ${candidateId}
        and ${sourceCandidates.duplicateGroupId} = ${reference.duplicateGroupId}
        and ${sourceCandidates.candidateStatus} in ('new', 'triaged')
      for update
    ) then 1 else 0 end as existing_duplicate_group_member_guard
  `);
}

"""
text = replace_once(
    text,
    "function existingDuplicateAssignmentGuard(\n",
    guards + "function existingDuplicateAssignmentGuard(\n",
    "persistence commit guards",
)
text = replace_once(
    text,
    "      const statements: unknown[] = [database.insert(importBatches).values(plan.batch)];",
    """      const statements: unknown[] = [];
      for (const reference of plan.reusedDuplicateGroups ?? []) {
        statements.push(existingDuplicateGroupGuard(database, reference));
        for (const candidateId of reference.existingMemberCandidateIds) {
          statements.push(existingDuplicateGroupMemberGuard(database, reference, candidateId));
        }
      }
      statements.push(database.insert(importBatches).values(plan.batch));""",
    "persistence statement ordering",
)
persistence.write_text(text)

osm = Path("src/importers/osm-overpass-candidate-acquisition.ts")
text = osm.read_text()
text = replace_once(
    text,
    "  type ExistingCandidateDuplicateAssignment,\n} from './candidate-ingestion-persistence';",
    "  type ExistingCandidateDuplicateAssignment,\n  type ExistingDuplicateGroupReference,\n} from './candidate-ingestion-persistence';",
    "OSM reused-group type import",
)
text = replace_once(
    text,
    "  existingAssignments: ExistingCandidateDuplicateAssignment[];\n  newCandidateGroupIds: Map<string, string>;",
    "  existingAssignments: ExistingCandidateDuplicateAssignment[];\n  reusedDuplicateGroups: ExistingDuplicateGroupReference[];\n  newCandidateGroupIds: Map<string, string>;",
    "OSM duplicate work return type",
)
text = replace_once(
    text,
    "  const existingAssignments: ExistingCandidateDuplicateAssignment[] = [];\n  const newCandidateGroupIds = new Map<string, string>();",
    "  const existingAssignments: ExistingCandidateDuplicateAssignment[] = [];\n  const reusedDuplicateGroupMembers = new Map<string, Set<string>>();\n  const newCandidateGroupIds = new Map<string, string>();",
    "OSM duplicate work collections",
)
text = replace_once(
    text,
    """    if (existingGroupId === null) {
      duplicateGroups.push({
        id: groupId,
        status: 'open',
        resolutionNote: null,
        resolvedAt: null,
      });
    }

    for (const memberId of members) {""",
    """    if (existingGroupId === null) {
      duplicateGroups.push({
        id: groupId,
        status: 'open',
        resolutionNote: null,
        resolvedAt: null,
      });
    } else {
      const reusedMembers = reusedDuplicateGroupMembers.get(existingGroupId) ?? new Set<string>();
      for (const candidate of existingGroupMembers) reusedMembers.add(candidate.candidateId);
      reusedDuplicateGroupMembers.set(existingGroupId, reusedMembers);
    }

    for (const memberId of members) {""",
    "OSM existing group reuse branch",
)
text = replace_once(
    text,
    """  return {
    duplicateGroups,
    duplicateSignals,
    existingAssignments,
    newCandidateGroupIds,
  };""",
    """  return {
    duplicateGroups,
    duplicateSignals,
    existingAssignments,
    reusedDuplicateGroups: [...reusedDuplicateGroupMembers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([duplicateGroupId, memberIds]) => ({
        duplicateGroupId,
        expectedStatus: 'open' as const,
        existingMemberCandidateIds: [...memberIds].sort(),
      })),
    newCandidateGroupIds,
  };""",
    "OSM duplicate work return value",
)
text = replace_once(
    text,
    "    existingCandidateDuplicateAssignments: duplicateWork.existingAssignments,\n    duplicateGroups: duplicateWork.duplicateGroups,",
    "    existingCandidateDuplicateAssignments: duplicateWork.existingAssignments,\n    reusedDuplicateGroups: duplicateWork.reusedDuplicateGroups,\n    duplicateGroups: duplicateWork.duplicateGroups,",
    "OSM retained plan reused groups",
)
text = replace_once(
    text,
    "    existingCandidateDuplicateAssignments: [],\n    duplicateGroups: [],",
    "    existingCandidateDuplicateAssignments: [],\n    reusedDuplicateGroups: [],\n    duplicateGroups: [],",
    "OSM unsafe plan reused groups",
)
osm.write_text(text)

persistence_test = Path("tests/candidate-ingestion-persistence.test.ts")
text = persistence_test.read_text()
insertion = """  it('accepts a duplicate signal into an explicitly referenced existing open group', () => {
    const plan = {
      batch: batch({ duplicateSignalCount: 1 }),
      sourceRecords: [sourceRecord()],
      candidates: [candidate({ duplicateGroupId: DUPLICATE_GROUP_ID })],
      candidateSourceRecords: [relation()],
      reusedDuplicateGroups: [
        {
          duplicateGroupId: DUPLICATE_GROUP_ID,
          expectedStatus: 'open' as const,
          existingMemberCandidateIds: [EXISTING_CANDIDATE_ID],
        },
      ],
      duplicateGroups: [],
      duplicateSignals: [
        {
          id: DUPLICATE_SIGNAL_ID,
          duplicateGroupId: DUPLICATE_GROUP_ID,
          leftCandidateId: CANDIDATE_ID,
          rightCandidateId: EXISTING_CANDIDATE_ID,
          reason: 'same_name_and_coordinates' as const,
          strength: 'strong' as const,
          importBatchId: BATCH_ID,
        },
      ],
    };

    expect(validateCandidateIngestionPersistencePlan(plan)).toBe(plan);
    expect(plan.reusedDuplicateGroups).toHaveLength(1);
  });

"""
text = replace_once(
    text,
    "  it('rejects a duplicate signal that references an unassigned cross-batch Candidate', () => {",
    insertion
    + "  it('rejects a duplicate signal that references an unassigned cross-batch Candidate', () => {",
    "persistence test reused group case",
)
persistence_test.write_text(text)

osm_test = Path("tests/osm-overpass-candidate-acquisition.test.ts")
text = osm_test.read_text()
text = replace_once(
    text,
    """    expect(result.plan.duplicateGroups).toHaveLength(0);
    expect(result.plan.existingCandidateDuplicateAssignments).toHaveLength(0);
    expect(result.plan.candidates[0]?.duplicateGroupId).toBe(duplicateGroupId);""",
    """    expect(result.plan.duplicateGroups).toHaveLength(0);
    expect(result.plan.reusedDuplicateGroups).toEqual([
      {
        duplicateGroupId,
        expectedStatus: 'open',
        existingMemberCandidateIds: [existing.candidateId],
      },
    ]);
    expect(result.plan.existingCandidateDuplicateAssignments).toHaveLength(0);
    expect(result.plan.candidates[0]?.duplicateGroupId).toBe(duplicateGroupId);""",
    "OSM test reused group assertion",
)
osm_test.write_text(text)
