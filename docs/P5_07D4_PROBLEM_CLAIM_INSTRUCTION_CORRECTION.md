# P5-07D4 Problem Report Claim instruction correction

**Implementation item:** P5-07D4  
**Status:** Active  
**Last updated:** 2026-07-18

## Purpose

P5-07D4 applies one bounded Problem Report correction class:

```text
resolved / approved Problem Report
+ exact wrong_instructions handoff
+ pending problem_correction application
↓
private user-submission Source Record
+ Acceptance Claim howToPay correction provenance
+ corrected Verification Event
+ durable Submission application receipt event
↓
common application committed
+ publication pending
```

The client cannot supply the target Claim, new instructions, Source Record, provenance, Verification Event, application outcome, or receipt.

## Eligibility chain

The service validates:

1. common application type is `problem_correction_handoff / problem_correction`;
2. Submission is `problem_report / resolved / approved`;
3. target is an exact Acceptance Claim;
4. source decision event is the application's exact retained event;
5. decision operation is `approve_correction_handoff`;
6. report type is exactly `wrong_instructions`;
7. proposed correction kind is exactly `instructions`;
8. normalized review projection has the same target and exact correction;
9. Claim is non-deleted and `confirmed` or `stale`;
10. Claim `updatedAt` matches the reviewed expected version.

Asset, network, Location identity, and generic-other handoffs fail closed.

## Canonical transaction

The same atomic database batch contains:

- active configured `user_submission` Source guard;
- exact Claim version, state, deletion, and previous `howToPay` guard;
- deterministic private Source Record insert;
- closure of active non-correction provenance for `acceptance_claim / howToPay`;
- replacement of previous correction provenance;
- new correction provenance linked to the Source Record;
- `acceptance_claims.how_to_pay` update;
- one `corrected` Verification Event;
- one durable Submission event with a strict versioned replay payload.

Any guard or uniqueness conflict rolls back the complete batch.

## Durable receipt

The canonical receipt uses the existing common receipt kind:

```text
submission_event
```

The event action is:

```text
problem_claim_instructions_applied
```

Its UUID is the correction request UUID. The internal payload binds:

- request fingerprint;
- application and source decision event;
- Claim;
- deterministic Source Record;
- deterministic Verification Event;
- reviewed Claim version;
- before and after instruction values.

This event is not a second review decision. It is the durable canonical application receipt produced after the already-approved handoff.

## Replay and recovery

Exact retry supports:

- canonical transaction replay;
- application lifecycle replay;
- recovery when canonical correction committed but common application transition failed;
- recognition of an already committed exact receipt.

Changed-content request UUID reuse, different actor, stale Claim version, changed decision chain, or mismatched receipt fails closed.

## Private source payload

The Source Record contains only:

- Submission public reference;
- source decision event ID;
- target Claim ID;
- report type;
- observation date;
- approved `howToPay` text.

It excludes contact data, original payload, explanation, private Evidence URL, reviewer notes, status secrets, and abuse-control data.

## Authorization and API

Dedicated allowlist:

```text
CPM_ADMIN_PROBLEM_CLAIM_INSTRUCTION_CORRECTION_SUBJECTS
```

Exact capability:

```text
submission:problem-claim-instructions:apply
```

Protected endpoint:

```text
POST /admin/api/problem-applications/:applicationId/apply-claim-instructions
```

Responses are bounded, private, and `no-store`.

## Explicit exclusions

P5-07D4 does not change:

- Claim status or visibility;
- confirmation or review dates;
- route type, processor, merchant-receives, restrictions, or acceptance scope;
- Claim Assets, assets, networks, payment methods, or contracts;
- Entity or Location fields;
- Evidence or Media;
- Submission review resolution;
- export, release, or publication;
- retention state.

## Completion criteria

P5-07D4 is complete when:

1. only the exact approved `wrong_instructions` chain can apply;
2. canonical value, provenance, Verification Event, and receipt commit atomically;
3. no other Claim or canonical field changes;
4. exact replay and post-canonical lifecycle recovery succeed;
5. private material is absent from API and Source payloads;
6. focused tests, runtime checks, migration checks, and normal CI pass.

## Next

P5-07D continues with a separately designed complete Claim Asset set replacement owner for asset and network corrections. Country/coordinate Location identity correction and generic-other classification remain separate boundaries.
