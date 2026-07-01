import {
  expandPromotionProvenanceAssignments,
  promotionProvenanceAssignmentsSchema,
} from '../src/admin/promotion/provenance-plan';

const sourceRecordId = '10000000-0000-4000-8000-000000000001';
const subjectId = '20000000-0000-4000-8000-000000000001';
const assignments = [
  {
    subjectType: 'entity' as const,
    subjectId,
    fieldPath: 'name',
    sourceRecordIds: [sourceRecordId],
    provenanceRole: 'origin' as const,
  },
];

if (!promotionProvenanceAssignmentsSchema.safeParse(assignments).success) {
  throw new Error('Candidate promotion field provenance rejected a valid assignment.');
}
if (promotionProvenanceAssignmentsSchema.safeParse([{ ...assignments[0], fieldPath: 'bad.path' }]).success) {
  throw new Error('Candidate promotion field provenance accepted an invalid field path.');
}

const rows = expandPromotionProvenanceAssignments(
  assignments,
  new Date('2026-07-01T00:00:00.000Z'),
);
if (
  rows.length !== 1 ||
  rows[0]?.fieldPath !== 'name' ||
  rows[0]?.sourceRecordId !== sourceRecordId
) {
  throw new Error('Candidate promotion field provenance expansion is invalid.');
}

console.log('Candidate promotion field provenance checks passed.');
