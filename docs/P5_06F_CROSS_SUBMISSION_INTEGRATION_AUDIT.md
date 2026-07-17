# P5-06F cross-submission integration audit

**Implementation item:** P5-06F  
**Status:** Active — repository audit  
**Last updated:** 2026-07-17

## Purpose

P5-06F closes the Phase 5 review-workflow extension sequence by verifying the combined behavior delivered by P5-06B through P5-06E.

This is an integration audit, not another reviewer mutation surface. It adds no new Submission state, protected operation, canonical application, Media decision, export action, or deployment claim.

## Audited submission families

The audit covers every public Submission type:

- `suggest`;
- `payment_report`;
- `problem_report`;
- `claim`;
- `photos` and the bounded parent relationship to child Media decisions.

## Review-entry reachability

The executable audit verifies the real runtime schemas and action collections rather than reproducing them as documentation-only claims.

| Submission family | Protected path from `received` |
|---|---|
| Suggest | Suggest-specific `begin_triage` and `begin_review` |
| Payment report | common P5-06B review-entry contract |
| Problem report | common P5-06B review-entry contract |
| Business Claim | Claim-specific transition contract |
| Photos parent | common P5-06B review-entry contract |

Every path must represent:

```text
received → triage → in_review
```

A missing type or action causes the audit command to fail.

## Information and Hold loops

For Suggest, reports, and Photos, the audit parses all four common P5-06C operations for every supported type:

```text
in_review → needs_information
needs_information → in_review
in_review → on_hold
on_hold → in_review
```

For Business Claims, it verifies the separate Claim-specific actions and their exact reason/status pairs.

The audit also requires durable replay and changed-request conflict evidence to remain present in the focused test suites for:

- Suggest review entry;
- common report/Photos review entry;
- common information and Hold operations;
- Business Claim review transitions;
- common terminal resolution;
- Photos parent resolution.

P5-06F does not replace those focused tests. It fails when their replay evidence is removed or renamed without updating the audit record.

## Type-correct terminal outcomes

The common P5-06D service is invoked for every combination of Submission type and ordinary terminal action.

The only allowed pairs are:

| Type | Common terminal outcomes |
|---|---|
| Suggest | `not_approved`, `duplicate`, `no_change`, `withdrawn` |
| Payment report | `not_approved`, `withdrawn` |
| Problem report | `not_approved`, `withdrawn` |
| Business Claim | `withdrawn` |
| Photos | `duplicate`, `no_change`, `withdrawn` |

Disallowed pairs must fail as `ineligible` before reading protected Submission state. This preserves the existing type-specific boundaries for report duplicate/no-change decisions, Claim verification/field decisions, and aggregate Photos approval.

## Photos aggregate outcome

The audit verifies that:

- the exact parent-resolution request contains parent, handoff, Media, and durable decision versions;
- the request is strict and rejects any client-supplied aggregate `resolution`;
- the preview contract can represent a complete mixed child set as `partially_approved`;
- the preview exposes an exact request snapshot only when all child decisions are complete.

The aggregate outcomes remain:

```text
all accepted   → approved
mixed          → partially_approved
all rejected   → not_approved
any pending    → no parent resolution request
```

## Private status and leakage boundary

The audit verifies all public resolution-label mappings and parses a bounded Photos partial result containing only opaque Media references and `approved` or `rejected` decisions.

The strict public projection rejects additional fields including:

- status-token hashes;
- encrypted contact data;
- request fingerprints;
- storage keys and object URLs;
- reviewer identity;
- private proof.

It also checks that the private-status service does not explicitly project those field names.

## P5-07 and export separation

The audit scans the P5-06 service and Drizzle boundaries for canonical write or export activation fragments.

P5-06 may update the Submission parent and append durable Submission events. The Photos aggregate boundary may read child Media and initial Media decisions. It must not:

- create or update canonical Entity or Location records;
- mutate Claim or Evidence records;
- create Candidates;
- apply approved field changes;
- activate export or release publication;
- copy or publish Media.

Canonical application, retention, and deletion remain P5-07 work. Export and release remain separate existing boundaries.

## Executable command

The audit runs inside the normal runtime-schema validation chain:

```text
npx tsx scripts/check-p5-06-cross-submission-audit.ts
```

A successful run prints:

```text
P5-06F cross-submission integration audit passed.
```

## Completion condition

P5-06F is complete when:

1. the executable audit is registered in `schema:check`;
2. all normal pull-request workflows pass;
3. `PROJECT_STATUS.md` records P5-06 as repository-complete;
4. the next bounded item is P5-07 canonical application transactions and retention;
5. no P5-07 or export behavior is added by this audit PR.
