import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/admin/submissions/drizzle-business-claim-payment-application-backend.ts';
let source = readFileSync(path, 'utf8');
const oldBlock = `          ) and (
            select count(*) from \${verificationEvents}
            where \${verificationEvents.id} in \${command.verificationEvents.map((item) => item.eventId)}
          ) = \${command.verificationEvents.length}
          and (`;
const newBlock = `          ) and \${allGuards(
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
if (!source.includes(oldBlock)) {
  throw new Error('Verification count guard marker is missing.');
}
source = source.replace(oldBlock, newBlock);
writeFileSync(path, source);
