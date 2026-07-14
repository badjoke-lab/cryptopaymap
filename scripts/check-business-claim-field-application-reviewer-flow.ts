import {
  authorizeBusinessClaimFieldApplication,
  readBusinessClaimFieldApplicationAuthorizationPolicy,
} from '../src/admin/submissions/business-claim-field-application-authorization';
import { businessClaimFieldApplicationEditorRequestSchema } from '../src/admin/submissions/business-claim-field-application-editor-request';
import { businessClaimFieldApplicationWorkspaceResponseSchema } from '../src/admin/submissions/business-claim-field-application-workspace';

const context = authorizeBusinessClaimFieldApplication(
  {
    actorId: 'cloudflare-access:runtime-field-reviewer',
    actorType: 'human',
    subject: 'runtime-field-reviewer',
    email: null,
  },
  readBusinessClaimFieldApplicationAuthorizationPolicy({
    CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS: JSON.stringify(['runtime-field-reviewer']),
  }),
);

if (!context.capabilities.includes('submission:claim-fields:apply')) {
  throw new Error('Business Claim field reviewer authorization did not issue the capability.');
}
if (businessClaimFieldApplicationWorkspaceResponseSchema.safeParse({}).success) {
  throw new Error('Business Claim field workspace accepted an empty response.');
}
if (businessClaimFieldApplicationEditorRequestSchema.safeParse({}).success) {
  throw new Error('Business Claim field editor accepted an empty request.');
}

console.log('Business Claim field application reviewer-flow checks passed.');
