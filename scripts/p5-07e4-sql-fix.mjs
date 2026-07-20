import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, oldText, newText, label) {
  let source = readFileSync(path, 'utf8');
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`${label} marker is missing.`);
  source = source.replace(oldText, newText);
  writeFileSync(path, source);
}

const backendPath = 'src/admin/submissions/drizzle-business-claim-payment-application-backend.ts';
let backend = readFileSync(backendPath, 'utf8');
const oldVerificationBlock = `          ) and (
            select count(*) from \${verificationEvents}
            where \${verificationEvents.id} in \${command.verificationEvents.map((item) => item.eventId)}
          ) = \${command.verificationEvents.length}
          and (`;
const newVerificationBlock = `          ) and \${allGuards(
            command.verificationEvents.map(
              (item) => sql\`exists (
                select 1 from \${verificationEvents}
                where \${verificationEvents.id} = \${item.eventId}
                  and \${verificationEvents.claimId} = \${item.claimId}
                  and \${verificationEvents.eventType} = 'corrected'
                  and \${verificationEvents.reasonCode} = 'business_claim_payment_information_applied'
                  and \${verificationEvents.effectiveAt} = \${command.appliedAt}
                  and \${verificationEvents.internalNote} = \${item.internalNote}
              )\`,
            ),
          )}
          and (`;
if (backend.includes(oldVerificationBlock)) {
  backend = backend.replace(oldVerificationBlock, newVerificationBlock);
} else if (!backend.includes("and ${allGuards(\n            command.verificationEvents.map(")) {
  throw new Error('Verification Event exists guards are missing.');
}
writeFileSync(backendPath, backend);

replaceOnce(
  backendPath,
  `                claimScope: acceptanceClaims.claimScope,
                routeType: acceptanceClaims.routeType,
                processorId: acceptanceClaims.processorId,`,
  `                claimScope: acceptanceClaims.claimScope,
                routeType: acceptanceClaims.routeType,
                acceptanceScope: acceptanceClaims.acceptanceScope,
                processorId: acceptanceClaims.processorId,`,
  'backend acceptance scope select',
);
replaceOnce(
  backendPath,
  `                howToPay: acceptanceClaims.howToPay,
                restrictions: acceptanceClaims.restrictions,`,
  `                howToPay: acceptanceClaims.howToPay,
                instructionsLanguage: acceptanceClaims.instructionsLanguage,
                merchantReceives: acceptanceClaims.merchantReceives,
                restrictions: acceptanceClaims.restrictions,`,
  'backend language select',
);
replaceOnce(
  backendPath,
  `                and \${acceptanceClaims.routeType} = \${claim.routeType}
                and \${acceptanceClaims.processorId} is not distinct from \${claim.processorId}`, 
  `                and \${acceptanceClaims.routeType} = \${claim.routeType}
                and \${acceptanceClaims.acceptanceScope} = 'all_checkout'
                and \${acceptanceClaims.processorId} is not distinct from \${claim.processorId}`,
  'backend acceptance scope guard',
);
replaceOnce(
  backendPath,
  `                and \${acceptanceClaims.howToPay} is not distinct from \${claim.howToPay}
                and \${acceptanceClaims.restrictions} is not distinct from \${claim.restrictions}`,
  `                and \${acceptanceClaims.howToPay} is not distinct from \${claim.howToPay}
                and \${acceptanceClaims.instructionsLanguage} = 'en'
                and \${acceptanceClaims.merchantReceives} = 'not_publicly_confirmed'
                and \${acceptanceClaims.restrictions} is not distinct from \${claim.restrictions}`,
  'backend language guard',
);

const servicePath = 'src/admin/submissions/business-claim-payment-application.ts';
replaceOnce(
  servicePath,
  `  claimScope: string;
  routeType: string;
  processorId: string | null;`,
  `  claimScope: string;
  routeType: string;
  acceptanceScope: string;
  processorId: string | null;`,
  'service acceptance scope state',
);
replaceOnce(
  servicePath,
  `  howToPay: string | null;
  restrictions: string | null;`,
  `  howToPay: string | null;
  instructionsLanguage: string;
  merchantReceives: string;
  restrictions: string | null;`,
  'service language state',
);
replaceOnce(
  servicePath,
  `      claim.claimScope !== planned.claimScope ||
      claim.routeType !== planned.routeType ||
      claim.processorId !== planned.processorId ||`,
  `      claim.claimScope !== planned.claimScope ||
      claim.routeType !== planned.routeType ||
      claim.acceptanceScope !== 'all_checkout' ||
      claim.processorId !== planned.processorId ||`,
  'service acceptance scope replay',
);
replaceOnce(
  servicePath,
  `      claim.howToPay !== planned.howToPay ||
      claim.restrictions !== planned.restrictions ||`,
  `      claim.howToPay !== planned.howToPay ||
      claim.instructionsLanguage !== 'en' ||
      claim.merchantReceives !== 'not_publicly_confirmed' ||
      claim.restrictions !== planned.restrictions ||`,
  'service language replay',
);

const testPath = 'tests/business-claim-payment-application.test.ts';
replaceOnce(
  testPath,
  `    claimScope: 'brand_global',
    routeType: 'direct_wallet',
    processorId: null,`,
  `    claimScope: 'brand_global',
    routeType: 'direct_wallet',
    acceptanceScope: 'all_checkout',
    processorId: null,`,
  'existing Claim fixture acceptance scope',
);
replaceOnce(
  testPath,
  `    howToPay: 'Existing instructions.',
    restrictions: null,`,
  `    howToPay: 'Existing instructions.',
    instructionsLanguage: 'en',
    merchantReceives: 'not_publicly_confirmed',
    restrictions: null,`,
  'existing Claim fixture language',
);
replaceOnce(
  testPath,
  `        claimScope: planned.claimScope,
        routeType: planned.routeType,
        processorId: planned.processorId,`,
  `        claimScope: planned.claimScope,
        routeType: planned.routeType,
        acceptanceScope: 'all_checkout',
        processorId: planned.processorId,`,
  'planned Claim fixture acceptance scope',
);
replaceOnce(
  testPath,
  `        howToPay: planned.howToPay,
        restrictions: planned.restrictions,`,
  `        howToPay: planned.howToPay,
        instructionsLanguage: 'en',
        merchantReceives: 'not_publicly_confirmed',
        restrictions: planned.restrictions,`,
  'planned Claim fixture language',
);
replaceOnce(
  testPath,
  `        claimId: plannedClaimId,
        claimStatus: 'candidate',
        visibility: 'hidden',`,
  `        claimId: plannedClaimId,
        claimStatus: 'candidate',
        visibility: 'hidden',
        acceptanceScope: 'all_checkout',
        instructionsLanguage: 'en',
        merchantReceives: 'not_publicly_confirmed',`,
  'candidate Claim assertion defaults',
);
