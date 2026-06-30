import { describe, expect, it } from 'vitest';
import { createDrizzleExistingTargetLinkBackend } from '../src/admin/promotion/drizzle-existing-target-link-backend';

describe('Candidate existing-target persistence foundation', () => {
  it('exports the production Drizzle backend factory', () => {
    expect(createDrizzleExistingTargetLinkBackend).toBeTypeOf('function');
  });
});
