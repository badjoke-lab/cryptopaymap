from pathlib import Path

registration = Path('src/admin/submissions/application-registration.ts')
text = registration.read_text()
old = """  candidatePromotionDecisionId: string | null;
  businessClaimFieldApplicationEventId: string | null;
}"""
new = """  candidatePromotionDecisionId: string | null;
  businessClaimFieldApplicationEventId: string | null;
  businessClaimPaymentApplicationPending?: boolean;
}"""
assert old in text
text = text.replace(old, new, 1)
old = """  if (
    request.sourceDecisionKind === 'business_claim_relationship' &&
    state.businessClaimFieldApplicationEventId !== null
  ) {
    return {
      applicationKind: contract.applicationKind,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      applicationReceipt: {
        kind: 'submission_event',
        ids: [state.businessClaimFieldApplicationEventId],
      },
    };
  }
"""
new = """  if (
    request.sourceDecisionKind === 'business_claim_relationship' &&
    state.businessClaimFieldApplicationEventId !== null
  ) {
    if (state.businessClaimPaymentApplicationPending === true) {
      return {
        applicationKind: contract.applicationKind,
        applicationStatus: 'pending',
        publicationStatus: 'blocked',
        applicationReceipt: null,
      };
    }
    return {
      applicationKind: contract.applicationKind,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      applicationReceipt: {
        kind: 'submission_event',
        ids: [state.businessClaimFieldApplicationEventId],
      },
    };
  }
"""
assert old in text
registration.write_text(text.replace(old, new, 1))

backend = Path('src/admin/submissions/drizzle-application-registration-backend.ts')
text = backend.read_text()
old = "import { parseSuggestAcceptedCandidateEventPayload } from '../../submissions/accepted-candidate-contract';\n"
new = old + "import { parseBusinessClaimFieldApplicationEventPayload } from '../../submissions/business-claim-field-application-persistence-contract';\n"
assert old in text
text = text.replace(old, new, 1)
old = """      const applicationEventRows = await database
        .select({ id: submissionEvents.id })
"""
new = """      const applicationEventRows = await database
        .select({
          id: submissionEvents.id,
          internalNote: submissionEvents.internalNote,
        })
"""
assert old in text
text = text.replace(old, new, 1)
old = """      if (applicationEventRows.length > 1) {
        throw new Error('Business Claim Submission contains multiple field-application events.');
      }

      return {
"""
new = """      if (applicationEventRows.length > 1) {
        throw new Error('Business Claim Submission contains multiple field-application events.');
      }
      const businessClaimFieldApplicationEvent = applicationEventRows[0] ?? null;
      let businessClaimPaymentApplicationPending = false;
      if (businessClaimFieldApplicationEvent !== null) {
        const payload = parseBusinessClaimFieldApplicationEventPayload(
          businessClaimFieldApplicationEvent.internalNote,
        );
        if (payload === null || payload.projection.submissionId !== submissionId) {
          throw new Error('Business Claim field-application event payload is invalid.');
        }
        businessClaimPaymentApplicationPending =
          (payload.projection.paymentApplication?.acceptedProposals.length ?? 0) > 0;
      }

      return {
"""
assert old in text
text = text.replace(old, new, 1)
old = """        candidatePromotionDecisionId,
        businessClaimFieldApplicationEventId: applicationEventRows[0]?.id ?? null,
"""
new = """        candidatePromotionDecisionId,
        businessClaimFieldApplicationEventId: businessClaimFieldApplicationEvent?.id ?? null,
        businessClaimPaymentApplicationPending,
"""
assert old in text
backend.write_text(text.replace(old, new, 1))

package = Path('package.json')
text = package.read_text()
old = 'node scripts/check-problem-claim-asset-replacement-application.mjs && tsx scripts/check-positive-payment-evidence.ts'
new = 'node scripts/check-problem-claim-asset-replacement-application.mjs && node scripts/check-business-claim-application-order.mjs && tsx scripts/check-positive-payment-evidence.ts'
assert old in text
package.write_text(text.replace(old, new, 1))

Path('scripts/check-business-claim-application-order.mjs').write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const registration = read('src/admin/submissions/application-registration.ts');
assert.match(registration, /businessClaimPaymentApplicationPending\?: boolean/);
assert.match(registration, /businessClaimPaymentApplicationPending === true/);

const backend = read('src/admin/submissions/drizzle-application-registration-backend.ts');
assert.match(backend, /parseBusinessClaimFieldApplicationEventPayload/);
assert.match(backend, /acceptedProposals\.length/);
assert.match(backend, /Business Claim field-application event payload is invalid/);

const fieldBackend = read(
  'src/admin/submissions/drizzle-business-claim-field-application-backend.ts',
);
assert.doesNotMatch(fieldBackend, /insert\(claimAssets\)/);
assert.doesNotMatch(fieldBackend, /insert\(provenanceLinks\)/);

const status = read('docs/PROJECT_STATUS.md');
assert.match(status, /P5-07E1/);
assert.match(status, /P5-07D7.*#254/);

console.log('P5-07E1 Business Claim application-order check passed.');
""")

Path('tests/business-claim-application-order.test.ts').write_text("""import { describe, expect, it } from 'vitest';
import {
  registerSubmissionApplication,
  type SubmissionApplicationRegistrationBackend,
  type SubmissionApplicationRegistrationCommand,
  type SubmissionApplicationRegistrationRecord,
  type SubmissionApplicationRegistrationState,
} from '../src/admin/submissions/application-registration';

const submissionId = '10000000-0000-4000-8000-000000000001';
const sourceEventId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const fieldEventId = '40000000-0000-4000-8000-000000000001';
const updatedAt = '2026-07-20T00:00:00.000Z';
const registeredAt = new Date('2026-07-20T00:05:00.000Z');
const context = {
  actorId: 'reviewer:business-claim-order',
  actorType: 'human' as const,
  capabilities: ['submission:application:register'] as ['submission:application:register'],
};

function state(paymentPending: boolean): SubmissionApplicationRegistrationState {
  return {
    submissionId,
    submissionType: 'claim',
    workflowStatus: 'resolved',
    resolution: 'approved',
    updatedAt,
    sourceDecisionEvent: {
      eventId: sourceEventId,
      submissionId,
      toStatus: 'resolved',
      action: 'business_claim_relationship_approved',
      createdAt: updatedAt,
    },
    candidatePromotionDecisionId: null,
    businessClaimFieldApplicationEventId: fieldEventId,
    businessClaimPaymentApplicationPending: paymentPending,
  };
}

function createBackend(initial: SubmissionApplicationRegistrationState) {
  const commits: SubmissionApplicationRegistrationCommand[] = [];
  const registrations = new Map<string, SubmissionApplicationRegistrationRecord>();
  const backend: SubmissionApplicationRegistrationBackend & {
    commits: SubmissionApplicationRegistrationCommand[];
  } = {
    commits,
    async readRegistration(id) {
      return registrations.get(id) ?? null;
    },
    async readApplicationBySubmission() {
      return null;
    },
    async readState() {
      return structuredClone(initial);
    },
    async commitRegistration(command) {
      commits.push(command);
      registrations.set(command.registrationRequestId, {
        registrationRequestId: command.registrationRequestId,
        applicationId: command.applicationId,
        submissionId: command.submissionId,
        submissionType: command.submissionType,
        sourceDecisionKind: command.sourceDecisionKind,
        sourceDecisionEventId: command.sourceDecisionEventId,
        applicationKind: command.applicationKind,
        applicationStatus: command.applicationStatus,
        publicationStatus: command.publicationStatus,
        applicationReceipt: command.applicationReceipt,
        publicationReceipt: command.publicationReceipt,
        actorId: command.actorId,
        requestFingerprint: command.requestFingerprint,
        registeredAt: command.registeredAt.toISOString(),
      });
    },
  };
  return backend;
}

const request = {
  schemaVersion: 'submission-application-registration-v1',
  requestId,
  sourceDecisionKind: 'business_claim_relationship',
  sourceDecisionEventId: sourceEventId,
  expectedSubmissionUpdatedAt: updatedAt,
};

describe('P5-07E1 Business Claim application ordering', () => {
  it('keeps the common application pending while accepted payment drafts remain', async () => {
    const backend = createBackend(state(true));
    const receipt = await registerSubmissionApplication(
      context,
      backend,
      submissionId,
      request,
      registeredAt,
    );
    expect(receipt).toMatchObject({
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      applicationReceipt: null,
    });
    expect(backend.commits[0]).toMatchObject({
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      applicationReceipt: null,
    });
  });

  it('commits immediately when no accepted payment drafts remain', async () => {
    const backend = createBackend(state(false));
    const receipt = await registerSubmissionApplication(
      context,
      backend,
      submissionId,
      request,
      registeredAt,
    );
    expect(receipt).toMatchObject({
      applicationStatus: 'committed',
      publicationStatus: 'pending',
      applicationReceipt: { kind: 'submission_event', ids: [fieldEventId] },
    });
  });
});
""")

Path('docs/P5_07E1_BUSINESS_CLAIM_APPLICATION_ORDER.md').write_text("""# P5-07E1 Business Claim application order

**Implementation item:** P5-07E1  
**Status:** Active  
**Last updated:** 2026-07-20

## Purpose

P5-07E1 corrects the common application lifecycle ordering for Business Claims that have a durable `business_claim_fields_applied` event but still contain accepted private payment drafts.

The field event remains authoritative for reviewed Entity and Location decisions. It is not the final application receipt when accepted payment proposals have not been consumed by a separately guarded payment transaction.

## Ordering rule

```text
approved representative relationship
→ field decisions and private payment drafts
→ payment application pending, when accepted drafts exist
→ canonical payment transaction
→ common application committed
→ publication pending
```

A Business Claim with no accepted payment drafts may register as `committed / pending` using the field-application event receipt. A Business Claim with accepted payment drafts registers as `pending / blocked` with no final receipt.

## Durable source

The registration backend parses the strict private `business-claim-field-application-event-v1` payload and derives pending payment work from `projection.paymentApplication.acceptedProposals.length`. It fails closed for malformed or cross-Submission payloads. The client cannot supply this flag.

## Compatibility

P5-07E1 does not rewrite existing application rows or field events. Existing replay identities remain valid. A later E slice must reconcile any already-registered committed application whose exact field event still contains unconsumed payment drafts.

## Explicit exclusions

No Claim, Claim Asset, Entity, Location, registry, Source Record, provenance, Evidence, Verification Event, export, release, retention, migration, or deployment mutation is added.

## Next

P5-07E2 will add the protected exact payment-draft and canonical-target preview. It must resolve Claim ownership, registries, processors, and submitted ordering without guessing or exposing protected material.
""")

Path('docs/PROJECT_STATUS.md').write_text("""# CryptoPayMap project status

**Last verified:** 2026-07-20

## Current phase

Phase 5 — Public submissions / MVP-B

## Current implementation item

P5-07E1 — Business Claim application-order correction

## Current repository state

- Phase 0 through Phase 4 are complete for the Phase 5 handoff.
- P5-01 through P5-06 are repository-complete.
- P5-07A canonical application and retention inventory completed in #243.
- P5-07B common application registration and lifecycle completed in #245–#246.
- P5-07C Suggest Candidate receipt binding completed in #247.
- P5-07D report correction and Claim Asset work completed through #248–#254.
- P5-07D7 atomic complete Claim Asset replacement completed in #254.
- P5-07E1 is active on `p5-07e1-business-claim-application-order`.

## Latest verified main

```text
3d4e68ae2280807b7c0c9083f041425ebc42c19e
```

The final P5-07D7 head passed all four normal workflow groups.

## Active pull request

```text
p5-07e1-business-claim-application-order — Business Claim application ordering
```

## Current boundary

P5-07E1 prevents a Business Claim field-application event from completing the common application while accepted private payment drafts remain unconsumed.

It may parse the exact field event, derive pending payment work, preserve no-payment completion, and add focused tests and audit documentation.

It must not create or mutate Claims, Claim Assets, registries, provenance, Entity, Location, export, release, retention, schema, or deployment state.

## Next

Implement P5-07E2 as the protected exact payment-draft and canonical-target preview. Provenance completion and canonical payment application remain separate atomic owners after the preview.

## Blocked

No repository blocker is known.

## Verification rule

Repository reality is determined by current `main`, merged pull requests, actual CI results, and fixed-review receipts. If this file differs from GitHub reality, GitHub is authoritative and this file must be corrected in the next bounded pull request.

## Current references

- `docs/P5_07A_CANONICAL_APPLICATION_RETENTION_INVENTORY.md`
- `docs/P5_07D7_CLAIM_ASSET_REPLACEMENT_APPLICATION.md`
- `docs/P5_07E1_BUSINESS_CLAIM_APPLICATION_ORDER.md`
- `docs/SUBMISSION_WORKFLOW.md`
- `docs/SECURITY_AND_PRIVACY.md`
""")
