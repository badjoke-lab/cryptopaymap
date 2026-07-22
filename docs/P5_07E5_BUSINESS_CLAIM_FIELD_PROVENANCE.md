# P5-07E5 Business Claim field provenance completion

**Implementation item:** P5-07E5  
**Status:** Completed in #259  
**Last updated:** 2026-07-21

## Purpose

P5-07E5 completes the missing field-level provenance for Entity and Location profile values that the existing P5-04H2 Business Claim field application already changed.

P5-04H2 remains the canonical field mutation owner. P5-07E5 does not update Entity or Location fields. It consumes one exact private `business_claim_fields_applied` event and adds only the missing private source and provenance history.

## Entry boundary

The operation accepts:

```text
POST /admin/api/business-claim-field-applications/:submissionId/complete-provenance
```

The request is strict and versioned:

```text
business-claim-field-provenance-v1
```

It binds:

- one request UUID;
- one exact H2 field-application event UUID;
- the current exact Entity or Location `updatedAt` value.

The client cannot provide or rewrite the target identity, accepted field paths, before values, applied values, relationship decision, Source Record identity, provenance role, or effective time.

## Exact H2 owner

The service parses the durable private event payload:

```text
business-claim-field-application-event-v1
```

The event must be:

- attached to the requested Claim Submission;
- `business_claim_fields_applied`;
- `resolved` with reason `field_decisions_committed`;
- bound to the exact normalized target and relationship decision;
- internally consistent with its own request, projection, and application time.

Only accepted Entity or Location profile fields are eligible. Payment proposals remain owned by P5-07E2 through P5-07E4.

## Current-value guard

For every accepted field, the current canonical value must still equal the H2 `after` value.

This rule prevents P5-07E5 from claiming provenance for a later correction. A changed accepted field causes a conflict before any write.

The rule includes fields that H2 cleared:

- nullable fields changed to `null`;
- arrays changed to `[]`;
- all other valid accepted values.

A cleared value still has an application history and therefore still receives a field-level provenance link.

## Atomic private transaction

One PostgreSQL transaction uses an advisory lock scoped to the H2 field-application event and performs:

1. exact Submission, H2 event, target version, Source, and open-provenance guards;
2. one deterministic private Source Record insertion;
3. closure of the exact prior open non-correction provenance links at the H2 application time;
4. one current `correction` provenance link for each accepted field;
5. one private completion event:

```text
business_claim_field_provenance_completed
```

with reason:

```text
field_provenance_completed
```

The new Source Record uses:

```text
business-claim-field-provenance-source-v1
```

It records the Submission reference, H2 event, relationship decision, target, exact accepted field paths, before values, applied values, and H2 application time.

## Provenance semantics

For each accepted field:

```text
subjectType      entity | location
subjectId        exact canonical target
fieldPath        exact H2 accepted field
provenanceRole   correction
effectiveFrom    H2 appliedAt
effectiveTo      null
```

P5-07E5 refuses to overwrite another current `correction` owner. It also refuses an open provenance link whose effective start is later than the H2 application time.

The exact open set is rechecked inside the transaction. Concurrent additions, removals, replacements, or closures fail the operation.

## Replay and conflict behavior

The deterministic Source Record ID is derived from the H2 event, while the completion event uses the reviewer request UUID.

- the same request UUID and same content replay successfully;
- changed-content reuse of the UUID fails;
- a second completion UUID for the same H2 event fails;
- an orphaned deterministic Source Record without a matching completion receipt fails closed;
- partial Source Record, provenance, or completion-event writes cannot commit because they share one transaction.

## Authorization and privacy

The route requires a verified administration identity in:

```text
CPM_ADMIN_BUSINESS_CLAIM_FIELD_PROVENANCE_SUBJECTS
```

It uses the configured active Business Claim source:

```text
CPM_BUSINESS_CLAIM_SOURCE_ID
```

Responses use:

```text
Cache-Control: private, no-store
```

Errors expose only bounded status codes and do not return private source payloads, before/after values, prior provenance, or canonical field material.

## Explicit exclusions

P5-07E5 does not:

- update or delete Entity or Location rows;
- re-run H2 field decisions;
- change payment Claims or Claim Assets;
- create public Evidence;
- change application or publication lifecycle state;
- activate export or release;
- execute retention;
- add reviewer UI or deployment configuration.

## Verification

The focused checks are:

```text
node scripts/check-business-claim-field-provenance.mjs
npx vitest run tests/business-claim-field-provenance.test.ts tests/business-claim-field-provenance-api.test.ts
```

The runtime audit is also registered in the normal `schema:check` chain.

## Completion condition

P5-07E5 is complete when:

1. exact H2 Entity and Location field applications can receive private field-level provenance without target mutation;
2. clear-to-null and clear-to-empty fields are covered;
3. stale current values and conflicting provenance ownership fail closed;
4. identical requests replay and second completion UUIDs fail;
5. the protected API, focused tests, runtime audit, and all normal pull-request workflows pass;
6. the pull request is merged to `main`.

## Next

P5-07F reconciles Photos parent resolution, Media application receipts, and publication handoff. Export activation remains a separate later owner.
