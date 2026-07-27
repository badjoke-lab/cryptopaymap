# P5-08D — Canonical application and publication-handoff integration audit

## Purpose

P5-08D proves that every approved/finalized Submission outcome resolves to one explicit canonical application owner and durable application receipt, while export, release, activation, publication, and public-state ownership remain separate.

## Family ownership matrix

| Family | Review outcome | Canonical application owner | Durable receipt/application evidence | Publication handoff |
|---|---|---|---|---|
| Suggest | accepted Candidate or existing-target resolution | Candidate promotion or existing-target link owner | Candidate promotion/link receipt and common application lifecycle | Existing export/release lifecycle only |
| Payment Report | approved positive payment Evidence | positive payment Evidence application owner | Evidence decision/application receipt | Existing export/release lifecycle only |
| Problem Report | correction, negative recheck, or other approved correction outcome | guarded type-specific correction/recheck owner | correction/recheck application receipt | Existing export/release lifecycle only |
| Business Claim | approved relationship, field, or payment outcome | relationship, field-provenance, or payment application owner | exact type-specific application receipt | Existing export/release lifecycle only |
| Photos | approved child Media decision | exact Media decision receipt binding owner | child Media application receipt plus parent aggregate evidence | Existing Media/export/release lifecycle only |

## Required application guarantees

1. Application registration and lifecycle remain common owners for all Submission families.
2. Every approved outcome resolves to one exact type-specific application owner.
3. Application execution requires the expected review decision, prerequisites, and exact state.
4. Repeated identical execution returns the durable prior receipt or fails closed according to the registered lifecycle.
5. Changed-content replay, stale state, conflicting target selection, incomplete prerequisites, and duplicate execution cannot create a second canonical mutation.
6. Canonical mutation and durable receipt persistence are atomic or otherwise fail closed without an ambiguous applied-without-receipt state.
7. Application completion does not equal export completion, release completion, activation, publication, or public-state mutation.
8. Export, release, restore, activation, and publication remain owned by the existing publication lifecycle.
9. No review or application route can directly activate a release or public state.
10. Partial publication failures cannot create a published-without-release state.

## Repository-executable evidence

The executable audit verifies that the normal schema chain retains:

- common application registration and lifecycle checks;
- Suggest promotion, existing-target link, provenance, field controls, and integration owners;
- Payment Report positive Evidence and Evidence review/application integration owners;
- Problem Report guarded correction, negative recheck, Claim instruction, Claim Asset replacement, and receipt owners;
- Business Claim application-order, relationship, field-provenance, payment plan/application, and reviewer-flow owners;
- Photos Media decision/application integration and exact receipt-binding owners;
- export contract, persistence, workspace, activation, history, restore, and integration owners.

## Configured-environment evidence

The following remain Phase 6 launch gates and are not claimed by P5-08D:

- live Neon transaction execution and receipt persistence;
- configured protected reviewer-to-application journeys;
- live R2 conditional writes, export generation, release activation, and rollback;
- deployed publication reconciliation and restore drills;
- production public-state verification.

## Completion receipt

P5-08D is repository-complete when:

- all five family owners are present;
- exact application receipt ownership is executable;
- application/publication separation is explicit;
- partial-failure ambiguity fails closed;
- retained P5-08A, P5-08B, and P5-08C audits remain green;
- P5-08E remains the next owner.

## Explicit exclusions

No new canonical mutation path, export/release activation, deployment, live database/object-store mutation, DNS cutover, or launch-readiness claim is included.