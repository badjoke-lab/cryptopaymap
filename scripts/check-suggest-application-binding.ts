import {
  suggestApplicationBindingReceiptSchema,
  suggestApplicationBindingRequestSchema,
} from '../src/admin/submissions/suggest-application-binding';
import {
  authorizeSuggestApplicationBinding,
  readSuggestApplicationBindingAuthorizationPolicy,
} from '../src/admin/submissions/suggest-application-binding-authorization';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const candidateId = '30000000-0000-4000-8000-000000000001';
const promotionDecisionId = '40000000-0000-4000-8000-000000000001';
const requestId = '50000000-0000-4000-8000-000000000001';
const timestamp = '2026-07-18T06:10:00.000Z';

suggestApplicationBindingRequestSchema.parse({
  schemaVersion: 'suggest-application-binding-v1',
  requestId,
  promotionDecisionId,
  expectedApplicationUpdatedAt: timestamp,
});

suggestApplicationBindingReceiptSchema.parse({
  state: 'committed',
  applicationId,
  submissionId,
  candidateId,
  promotionDecisionId,
  applicationStatus: 'committed',
  publicationStatus: 'pending',
  transitionEventId: requestId,
  boundAt: timestamp,
});

if (
  suggestApplicationBindingRequestSchema.safeParse({
    schemaVersion: 'suggest-application-binding-v1',
    requestId,
    promotionDecisionId,
    expectedApplicationUpdatedAt: timestamp,
    candidateId,
    applicationStatus: 'committed',
  }).success
) {
  throw new Error('Suggest application binding accepted client-selected derived state.');
}

const policy = readSuggestApplicationBindingAuthorizationPolicy({
  CPM_ADMIN_SUGGEST_APPLICATION_BINDING_SUBJECTS: JSON.stringify([
    'suggest-application-operator',
  ]),
});
const context = authorizeSuggestApplicationBinding(
  {
    actorId: 'cloudflare-access:suggest-application-operator',
    actorType: 'human',
    subject: 'suggest-application-operator',
    email: 'operator@example.com',
  },
  policy,
);
if (!context.capabilities.includes('submission:suggest-application:bind')) {
  throw new Error('Suggest application binding authorization did not grant the exact capability.');
}

console.log('Suggest application binding checks passed.');
