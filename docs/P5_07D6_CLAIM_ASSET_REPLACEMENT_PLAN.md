# P5-07D6 Claim Asset replacement plan

**Implementation item:** P5-07D6  
**Status:** Active  
**Last updated:** 2026-07-19

## Purpose

P5-07D6 turns the read-only P5-07D5 preview into one durable private replacement plan without changing canonical Claim Asset rows.

It supports:

```text
single-row Claim
→ automatic_single_row

multi-row Claim
→ reviewed_current_row + exact current row UUID
```

The client selects only an existing current row when selection is necessary. It cannot supply the replacement Asset, Network, payment method, contract, primary flag, note, row UUID, proposed complete set, or hashes.

## Exact request

The protected request contains:

- idempotency UUID;
- exact application `updatedAt`;
- exact Claim `updatedAt`;
- exact source decision event UUID;
- exact current complete-set hash;
- automatic or explicitly reviewed selection mode;
- current row UUID only for reviewed multi-row selection.

All replacement content remains server-derived from the retained approved Problem Report decision and current registries.

## Durable private plan

One strict Submission event records:

```text
problem_claim_asset_replacement_planned
```

Its private payload binds:

- request fingerprint;
- application and Submission;
- source decision event;
- Claim and exact versions;
- correction kind and proposed registry slug;
- selection mode and selected current row;
- deterministic replacement row UUID;
- complete current and proposed sets;
- Asset, Network, and Payment Method identities and statuses;
- optional contract address;
- primary flag;
- private Claim Asset notes;
- complete before and after hashes;
- planning timestamp.

The protected HTTP response returns only bounded identifiers, selection, correction, hashes, and timestamp. It does not expose private notes or full private sets.

## Exact set guard

The persistence boundary takes an application-scoped advisory transaction lock and verifies:

- pending/blocked application with no canonical receipt;
- exact application version and source decision event;
- resolved approved Problem Report targeting the exact Claim;
- confirmed or stale non-deleted Claim at the reviewed version;
- active proposed Asset and Network registry entries;
- the complete current Claim Asset set as one ordered JSON value;
- absence of a prior event using the request UUID.

The plan event is inserted only after all guards pass.

## Complete-set validation

The proposed set must:

- contain one to fifty rows for the exact Claim;
- preserve exactly one primary row;
- preserve every unselected row unchanged;
- replace only the explicitly selected row;
- preserve payment method, contract, primary flag, and notes on that row;
- satisfy existing publication prerequisites;
- contain no duplicate payment tuple;
- produce a different complete-set hash.

Independent in-place `asset_id` or `network_id` updates remain prohibited.

## Authorization and API

Dedicated allowlist:

```text
CPM_ADMIN_PROBLEM_CLAIM_ASSET_PLAN_SUBJECTS
```

Exact capability:

```text
submission:problem-claim-asset-plan:prepare
```

Protected endpoint:

```text
POST /admin/api/problem-applications/:applicationId/plan-claim-assets
```

Responses are private and `no-store`.

## Explicit exclusions

P5-07D6 adds no:

- Claim Asset insert, update, or delete;
- Acceptance Claim mutation;
- Source Record or provenance write;
- Verification Event;
- application lifecycle transition;
- export or release activation;
- reviewer UI;
- database migration;
- configured deployment claim.

## Completion criteria

P5-07D6 is complete when:

1. an exact valid single-row correction produces one durable automatic plan;
2. a multi-row Claim cannot plan without an explicit reviewed current row;
3. the client cannot supply a replacement tuple or arbitrary deletion;
4. current and proposed complete sets, versions, and hashes are durably bound;
5. exact replay succeeds and changed-content UUID reuse fails closed;
6. no canonical row changes;
7. normal repository CI passes.

## Next

P5-07D7 will apply one exact durable D6 plan as an atomic complete Claim Asset set replacement with private source provenance, row-level provenance, one corrected Verification Event, a durable application receipt, and replay-safe application lifecycle recovery. Publication remains separate.
