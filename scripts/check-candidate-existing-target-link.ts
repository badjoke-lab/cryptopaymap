import { createDrizzleExistingTargetLinkBackend } from '../src/admin/promotion/drizzle-existing-target-link-backend';
import {
  candidateExistingTargetLinkInputSchema,
  createCandidateExistingTargetLinkService,
} from '../src/admin/promotion/existing-target-link';
import { InMemoryExistingTargetLinkBackend } from '../src/admin/promotion/in-memory-existing-target-link-backend';

if (candidateExistingTargetLinkInputSchema.safeParse({}).success) {
  throw new Error('Existing-target linking accepted an empty request.');
}
if (typeof createCandidateExistingTargetLinkService !== 'function') {
  throw new Error('Existing-target link service is unavailable.');
}
if (typeof InMemoryExistingTargetLinkBackend !== 'function') {
  throw new Error('Existing-target atomic test backend is unavailable.');
}
if (typeof createDrizzleExistingTargetLinkBackend !== 'function') {
  throw new Error('Existing-target Drizzle backend is unavailable.');
}

console.log('Candidate existing-target link checks passed.');
