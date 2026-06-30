import { createDrizzleExistingTargetLinkBackend } from '../src/admin/promotion/drizzle-existing-target-link-backend';
import { createDrizzleCanonicalTargetSearchBackend } from '../src/admin/promotion/drizzle-target-search-backend';
import {
  candidateCanonicalTargetSearchResponseSchema,
  canonicalTargetSearchQuerySchema,
} from '../src/admin/promotion/target-selection';

if (canonicalTargetSearchQuerySchema.safeParse({ query: 'x', limit: 10 }).success) {
  throw new Error('Canonical target search accepted an undersized query.');
}
if (candidateCanonicalTargetSearchResponseSchema.safeParse({}).success) {
  throw new Error('Canonical target search accepted an empty protected response.');
}
if (typeof createDrizzleCanonicalTargetSearchBackend !== 'function') {
  throw new Error('Canonical target search backend is unavailable.');
}
if (typeof createDrizzleExistingTargetLinkBackend !== 'function') {
  throw new Error('Existing-target link backend is unavailable.');
}

console.log('Candidate canonical target selection checks passed.');
