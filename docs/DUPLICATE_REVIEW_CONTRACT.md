# Duplicate review and identity-resolution contract

**Implementation item:** P3-06  
**Current delivery:** P3-06A — signal persistence and atomic decision foundation  
**Status:** In progress  
**Visibility:** Repository-public implementation contract; no private Candidate values are included

## Purpose

P3-06 lets an authorized administrator review explicit duplicate signals and decide whether a group represents the same Candidate identity or a false-positive signal.

Duplicate review does not merge database rows, move source records, create canonical records, promote a Candidate, or publish data.

## Delivery split

P3-06 is delivered in two reviewable pull requests:

1. P3-06A adds duplicate-signal persistence, immutable decision records, authorization, validation, optimistic concurrency, and atomic mutation backends.
2. P3-06B adds protected group queries, comparison UI, decision controls, endpoint tests, accessibility checks, and staging artifact checks.

This split keeps a database migration and a substantial administration UI out of the same pull request.

## Persisted duplicate signals

Importer duplicate signals must no longer exist only in an in-memory import plan.

Each persisted signal records:

- a deterministic private signal UUID
- a deterministic duplicate-group UUID
- the two ordered Candidate UUIDs
- the signal reason
- signal strength
- the import batch that produced the signal when applicable
- creation time

Supported initial signal reasons are:

```text
shared_osm_identity
same_name_and_coordinates
shared_official_domain
same_normalized_name
```

Supported signal strengths are:

```text
strong
review
```

A signal is evidence for review, not an automatic duplicate decision.

## Duplicate groups

Signals produced by one import plan are converted into connected Candidate components.

- every component contains at least two Candidate UUIDs
- the component identity is deterministic from the sorted Candidate UUIDs
- all Candidates in one component receive the same private duplicate-group UUID
- conflicting pre-existing group membership fails the complete transaction
- a group starts in `open`
- group membership and source provenance are preserved after a decision

No Candidate becomes `duplicate` merely because a signal is persisted.

## Authorization

Duplicate decisions require an explicit administration mutation context:

```text
requestId
actorId
actorType
capabilities
```

The required capability is:

```text
candidate:resolve
```

Read-only `candidate:read` access does not authorize a decision. Email addresses are not authorization identifiers.

## Decisions

Initial actions are:

```text
confirm_duplicate
dismiss_signal
```

### Confirm duplicate

The reviewer selects one primary Candidate and at least one duplicate Candidate.

- the primary Candidate remains a distinct Candidate row
- selected non-primary Candidates move to Candidate status `duplicate`
- every member retains its original source relationships and provenance
- the duplicate group moves from `open` to `resolved`
- no canonical entity, location, claim, Evidence, media, or public export is changed

### Dismiss signal

The reviewer decides that the duplicate signal does not establish a shared Candidate identity.

- Candidate statuses do not change
- Candidate source relationships do not change
- the duplicate group moves from `open` to `dismissed`
- the historical group and signals remain available for audit

## Decision reasons

Initial reason codes are:

```text
same_osm_identity
same_physical_location
same_official_domain
same_online_service
manual_match
different_location
different_business
different_service
insufficient_evidence
stale_signal
other
```

A bounded internal note may accompany a decision. An empty note is not stored.

## Validation

Before backend mutation, the service requires:

- a valid `candidate:resolve` mutation context
- a valid group UUID
- a valid expected group update time
- two to fifty unique member Candidate UUIDs
- action-compatible primary Candidate presence
- a primary Candidate that is included in the member set
- a valid reason code
- a valid decision time

The backend additionally verifies atomically:

- the group exists and remains `open`
- the group update time matches the expected value
- every requested Candidate exists and belongs to the group
- every member has the same Candidate type
- no member is already `promoted`
- a confirm decision does not change the primary Candidate status
- a dismiss decision does not change any Candidate status

## Idempotency and conflicts

- `requestId` is the idempotency identity
- an exact replay returns the original committed receipt
- reuse of a request ID with different decision content is a conflict
- stale group state, changed membership, or conflicting Candidate state fails the full transaction
- no partial Candidate or group update may remain after failure

## Immutable decision record

Every committed decision records:

- decision UUID and request UUID
- duplicate-group UUID
- action
- primary Candidate UUID when required
- sorted member Candidate UUIDs
- reason code and bounded note
- actor identity and actor type
- expected group update time
- decision time
- deterministic decision fingerprint

Decision records are append-only in P3-06.

## Explicit exclusions

P3-06 must not:

- delete or physically merge Candidate rows
- move or rewrite source records
- rewrite original source payloads
- assign canonical entity or location identifiers
- create acceptance claims
- perform Candidate-to-canonical promotion
- decide Evidence or media
- trigger a public export or publication
- expose Candidate or decision data through public routes
- add internal-only project documents to the repository

## Deferred live verification

Live Cloudflare Access browser verification and live Neon mutation verification may remain deferred. Repository schemas, migrations, transaction contracts, conflict tests, rollback tests, runtime checks, and artifact checks must pass before P3-06 is completed.
