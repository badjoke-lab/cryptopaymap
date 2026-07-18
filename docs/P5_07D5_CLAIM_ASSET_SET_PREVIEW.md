# P5-07D5 Claim Asset set replacement preview

**Implementation item:** P5-07D5  
**Status:** Active  
**Last updated:** 2026-07-18

## Purpose

P5-07D5 adds a read-only planning boundary for approved Problem Report corrections of:

```text
wrong_asset
wrong_network
```

The report and retained review decision identify only a proposed Asset or Network slug. They do not identify a safe Claim Asset row, payment method, contract address, primary flag, or complete replacement set.

P5-07D5 therefore does not mutate canonical data. It validates the exact decision chain, loads the complete current Claim Asset set, applies existing registry and publication rules, and returns one of:

```text
ready
needs_selection
already_matches
blocked
```

## Exact decision chain

The preview requires:

- common application `problem_correction_handoff / problem_correction`;
- application `pending / blocked` with no canonical receipt;
- resolved and approved `problem_report`;
- target type `claim`;
- exact retained `problem_correction_handoff_approved` event;
- operation `approve_correction_handoff`;
- report/correction pair `wrong_asset / asset` or `wrong_network / network`;
- normalized review projection matching the exact target and correction;
- non-deleted `confirmed` or `stale` Acceptance Claim.

Instruction, Location, and generic-other handoffs fail closed.

## Current-set validation

The preview loads at most 50 Claim Asset rows and verifies:

- every row belongs to the exact Claim;
- exactly one row is primary;
- Asset, Network, and Payment Method registry entries are active;
- Lightning methods use the Lightning network;
- onchain does not use Lightning;
- processor-checkout method uses the processor-checkout route.

The same publication prerequisite schema used by confirmation is reused.

## Deterministic single-row plan

When the Claim has exactly one valid row:

1. the proposed Asset or Network registry entry is resolved by exact slug;
2. the other tuple fields are preserved;
3. a new deterministic replacement row UUID is derived;
4. the complete before and after sets are hashed;
5. the proposed combination is revalidated.

The preview does not propose an in-place `asset_id` or `network_id` update. A later write owner must replace the complete set atomically.

## Multiple-row boundary

When a Claim has multiple rows, the report does not identify which row is wrong. P5-07D5 returns:

```text
readiness = needs_selection
proposedSet = null
```

A separately reviewed row-selection plan is required before any canonical write. The preview never guesses from primary status, ordering, symbol similarity, or the proposed slug.

## Privacy

The protected projection may include canonical row UUIDs and public registry metadata needed by an operator. It does not return:

- Submission explanation;
- original private payload;
- private Evidence URL;
- reviewer notes;
- contact data;
- Claim Asset note text.

Only `notesPresent` is exposed.

## Authorization and API

Dedicated allowlist:

```text
CPM_ADMIN_PROBLEM_CLAIM_ASSET_PREVIEW_SUBJECTS
```

Exact capability:

```text
submission:problem-claim-asset-preview:read
```

Protected endpoint:

```text
GET /admin/api/problem-applications/:applicationId/claim-asset-preview
```

Responses are private and `no-store`.

## Explicit exclusions

P5-07D5 adds no:

- Claim Asset mutation;
- row selection for multi-row Claims;
- Claim, Entity, Location, Evidence, or Media mutation;
- Source Record or provenance write;
- Verification Event;
- application transition;
- database migration;
- export or release activation;
- reviewer UI;
- configured deployment claim.

## Completion criteria

P5-07D5 is complete when:

1. only exact asset/network correction applications can preview;
2. current and proposed complete sets have stable hashes;
3. a valid single-row set produces one deterministic replacement set;
4. multiple-row Claims stop at `needs_selection`;
5. invalid registry or publication combinations fail closed;
6. the endpoint remains read-only and private;
7. normal repository CI passes.

## Next

P5-07D6 will define the durable row-selection plan required for multi-row Claims and the exact write request shared by single-row and selected-row paths. Canonical set replacement remains deferred until that plan is fixed.
