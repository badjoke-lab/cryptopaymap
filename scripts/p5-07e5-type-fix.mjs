import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/admin/submissions/business-claim-field-provenance.ts';
let service = readFileSync(servicePath, 'utf8');
service = service.replace('  businessClaimFieldProvenanceEventPayloadSchema,\n', '');
service = service.replace(
  `    if (error.code === 'idempotency_conflict') {
      throw new BusinessClaimFieldProvenanceError(
        'idempotency_conflict',
        'The field provenance request UUID was reused for different content.',
        { cause: error },
      );
    }
`,
  '',
);
writeFileSync(servicePath, service);

const testPath = 'tests/business-claim-field-provenance.test.ts';
let test = readFileSync(testPath, 'utf8');
test = test.replace(
  `  completeBusinessClaimFieldProvenance,
  type BusinessClaimFieldProvenanceBackend,`,
  `  completeBusinessClaimFieldProvenance,
  type BusinessClaimFieldProvenanceBackend,
  type BusinessClaimFieldProvenanceContext,`,
);
test = test.replace(
  `const context = {
  actorId: 'reviewer-e5',
  actorType: 'human' as const,
  capabilities: ['submission:business-claim-field-provenance:complete'] as const,
};`,
  `const context: BusinessClaimFieldProvenanceContext = {
  actorId: 'reviewer-e5',
  actorType: 'human',
  capabilities: ['submission:business-claim-field-provenance:complete'],
};`,
);
test = test.replace("    entityType: 'merchant',", "    entityType: 'merchant' as const,");
test = test.replace("    entityStatus: 'active',", "    entityStatus: 'active' as const,");
test = test.replaceAll("    visibility: 'public',", "    visibility: 'public' as const,");
test = test.replace("    locationStatus: 'active',", "    locationStatus: 'active' as const,");
writeFileSync(testPath, test);
