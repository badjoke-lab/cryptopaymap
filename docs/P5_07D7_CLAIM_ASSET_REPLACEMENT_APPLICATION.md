# P5-07D7 Claim Asset complete-set replacement application

**Implementation item:** P5-07D7  
**Status:** Active  
**Last updated:** 2026-07-19

## Purpose

P5-07D7 consumes one exact private P5-07D6 plan and applies the planned Asset or Network correction to canonical Claim Assets.

It does not accept a replacement tuple from the HTTP client. The canonical before and after sets, selected current row, deterministic replacement row, registry identities, payment method, optional contract address, primary flag, notes, and hashes are loaded only from the durable D6 plan event.

## Exact request

The protected request contains only:

- a new canonical-application idempotency UUID;
- the durable D6 plan UUID;
- the exact application `updatedAt`;
- the exact plan creation timestamp;
- the exact Claim `updatedAt` reviewed by D6;
- the exact source decision event UUID;
- the exact current complete-set hash;
- the exact proposed complete-set hash.

The canonical application UUID must differ from the D6 plan UUID.

## Durable plan validation

Before a write, D7 verifies:

- common application type, source decision, Submission, target, and pending/blocked state;
- resolved and approved Problem Report;
- exact retained correction decision and normalized review projection;
- exact `problem_claim_asset_replacement_planned` event;
- exact plan payload, actor-independent plan identity, and plan timestamp;
- confirmed or stale non-deleted Claim;
- exact Claim version and complete current set;
- active Asset, Network, and Payment Method registries;
- existing publication prerequisites;
- one primary row and no duplicate tuple;
- one selected current row removed and one deterministic replacement row added;
- every unselected row unchanged;
- payment method, optional contract, primary flag, and private notes preserved;
- only the approved Asset or Network component changed;
- recomputed current and proposed hashes matching the durable plan.

A client cannot submit Asset, Network, Payment Method, row UUID, contract, primary, note, proposed set, deletion list, or SQL-like patch data.

## Atomic canonical transaction

The canonical backend takes a Claim-scoped PostgreSQL advisory transaction lock and performs one guarded batch:

1. require the configured active `user_submission` Source;
2. require the exact pending/blocked application and source decision;
3. require the exact immutable D6 plan event and private payload;
4. lock the exact Claim version;
5. compare the full current Claim Asset set as ordered JSON;
6. validate every proposed registry identity as active;
7. create one private Source Record derived from the approved report and D6 plan;
8. close active provenance on the selected old Claim Asset row;
9. delete only the selected old row;
10. insert the deterministic replacement row;
11. create record-level `claim_asset / correction` provenance on the replacement row;
12. verify the resulting complete set exactly matches the proposed D6 set;
13. advance the aggregate Claim `updatedAt` version;
14. create one `corrected` Verification Event;
15. create one `problem_claim_assets_replaced` Submission event.

Any failed guard rolls back every statement. Independent in-place `asset_id` or `network_id` updates remain prohibited.

## Application lifecycle recovery

The canonical Submission event is the durable application receipt.

After the canonical transaction commits, D7 uses the common application lifecycle boundary to move:

```text
application: pending → committed
publication: blocked → pending
```

If canonical data commits but the lifecycle transition fails, the same request can be retried. D7 verifies the exact canonical event, proposed complete set, Claim version, actor, and request fingerprint, then resumes only the lifecycle transition.

A fully committed application returns `already_applied` only when the application receipt points to the exact canonical Submission event.

## Privacy

The HTTP response contains only bounded identifiers, hashes, lifecycle status, and timestamps. It does not return:

- complete private current or proposed sets;
- Claim Asset note text;
- Submission explanation;
- private Evidence URLs;
- reviewer notes;
- contact data;
- Source Record raw payload.

Responses are private and `no-store`.

## Authorization and API

Dedicated allowlist:

```text
CPM_ADMIN_PROBLEM_CLAIM_ASSET_APPLY_SUBJECTS
```

Configured private report Source:

```text
CPM_PROBLEM_REPORT_SOURCE_ID
```

Exact capability:

```text
submission:problem-claim-assets:apply
```

Protected endpoint:

```text
POST /admin/api/problem-applications/:applicationId/apply-claim-assets
```

## Explicit exclusions

P5-07D7 adds no:

- Asset, Network, or Payment Method registry mutation;
- Acceptance Claim status, visibility, confirmation date, route, processor, instruction, restriction, or scope change;
- Entity, Location, Evidence, or Media mutation;
- public export generation or release activation;
- reviewer UI;
- retention deletion;
- database migration;
- configured deployment claim.

## Completion criteria

P5-07D7 is complete when:

1. only one exact durable D6 plan can be applied;
2. the complete current set and every registry identity are guarded;
3. one selected row is atomically replaced without in-place Asset or Network edits;
4. unselected rows and selected-row metadata are preserved;
5. private source and row-level correction provenance are created;
6. one corrected Verification Event and durable Submission receipt are created;
7. the common application lifecycle reaches committed/pending;
8. exact replay and post-canonical lifecycle recovery succeed;
9. changed-content UUID reuse and stale state fail closed;
10. normal repository CI passes.

## Next

After D7, the remaining Phase 5 sequence continues with P5-07E Business Claim payment/provenance/order completion. Public export and release remain separately controlled by the existing publication lifecycle.
