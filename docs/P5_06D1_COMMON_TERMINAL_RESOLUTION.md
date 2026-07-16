# P5-06D1 common terminal resolution

**Implementation item:** P5-06D1  
**Status:** Active  
**Last updated:** 2026-07-16

## Purpose

P5-06D1 adds a protected, exact-state common closure boundary for ordinary Submission outcomes that are not already owned by a stronger type-specific decision service.

## Outcomes

```text
not_approved
common duplicate
no_change
withdrawn
```

The request UUID is the durable Submission event ID. Exact replay returns the prior receipt; changed-content UUID reuse conflicts.

## Type ownership

| Outcome | Common eligible types | Preserved type-specific ownership |
|---|---|---|
| `not_approved` | Suggest, payment report, problem report | Business Claim relationship decision; Photos aggregate Media outcome in P5-06E |
| `duplicate` | Suggest, Photos | Problem Report duplicate decision from P5-03G |
| `no_change` | Suggest, Photos | Problem Report no-change decision from P5-03G; report Evidence decisions |
| `withdrawn` | Suggest, reports, Claim, Photos | none |

A common duplicate requires an exact different Submission UUID, the same Submission type, and a referenced Submission that is not itself duplicate, rejected spam, or withdrawn. The target is guarded again atomically at commit.

## State boundaries

- `not_approved` may close `in_review`, `needs_information`, or `on_hold` material;
- duplicate may close only `received`, `triage`, or `in_review` material;
- `no_change` requires `in_review`;
- withdrawal may close any nonterminal common workflow state.

## Privacy and retention

Every operation requires bounded public-safe resolution text. Reviewer-only notes and duplicate internal UUIDs remain inside the protected event payload. No Evidence, Media, contact record, payload, or quarantine object is deleted automatically.

## Exclusions

P5-06D1 adds no reviewer UI, submitter withdrawal route, Photos child-Media aggregation, canonical application, Evidence acceptance, Media approval, export, publication, deployment, or launch claim.
