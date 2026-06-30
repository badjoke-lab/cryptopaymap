import {
  authorizeCandidatePromotion,
  readCandidatePromotionAuthorizationPolicy,
} from '../src/admin/promotion/authorization';
import {
  candidatePromotionEditorRequestSchema,
  candidatePromotionWorkspaceResponseSchema,
} from '../src/admin/promotion/workspace';

const requestId = '10000000-0000-4000-8000-000000000001';
const context = authorizeCandidatePromotion(
  {
    actorId: 'admin:runtime-promoter',
    actorType: 'human',
    subject: 'runtime-promoter',
    email: null,
  },
  readCandidatePromotionAuthorizationPolicy({
    CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS: JSON.stringify(['runtime-promoter']),
  }),
  requestId,
);

if (context.requestId !== requestId || !context.capabilities.includes('candidate:promote')) {
  throw new Error('Candidate promotion authorization did not create the expected capability.');
}
if (candidatePromotionWorkspaceResponseSchema.safeParse({}).success) {
  throw new Error('Candidate promotion workspace accepted an empty response.');
}
if (candidatePromotionEditorRequestSchema.safeParse({}).success) {
  throw new Error('Candidate promotion editor accepted an empty draft.');
}

console.log('Candidate promotion workspace checks passed.');
