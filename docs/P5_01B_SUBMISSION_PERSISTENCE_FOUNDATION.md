# P5-01B submission persistence and workflow-state foundation

**Implementation item:** P5-01B  
**Status:** Completed through #151
**Last updated:** 2026-07-09

## Purpose

P5-01B turns the P5-01A submission contract into a durable private persistence boundary without adding public forms or type-specific submission behavior.

The implementation establishes:

- parent Submission records;
- original, normalized, and proposed-change payload separation;
- encrypted-contact storage boundary;
- workflow event history;
- year-scoped public reference allocation;
- request fingerprint and intake request identity persistence for P5-01C idempotency;
- guarded workflow transitions;
- atomic creation of the private submission bundle.

## 1. Persistence model

P5-01B adds:

```text
submission_public_reference_counters
submissions
submission_payloads
submission_contacts
submission_events
```

The common relationship is:

```text
submission
├─ one payload record
├─ zero or one private contact record
└─ one or more workflow events
```

The public reference counter is separate from Submission content and is used only to allocate opaque public references.

## 2. Parent Submission boundary

The parent `submissions` record stores:

- internal UUID;
- intake request UUID;
- request fingerprint;
- public reference;
- submission type;
- optional target type and target UUID;
- optional submitter relationship;
- workflow status;
- resolution;
- priority;
- one-way status token hash;
- submitted, updated, resolved, and withdrawn timestamps.

The parent record does not store plaintext contact email or plaintext status secret.

## 3. Public reference allocation

Public references retain the P5-01A shape:

```text
CPM-S-YYYY-NNNNNN
```

Allocation is year-scoped and monotonic.

The Drizzle backend performs an atomic upsert against the year counter and returns the allocated sequence from the updated row. The counter stores the next free sequence after the allocation.

The valid per-year allocation range is:

```text
000001 through 999999
```

When the range is exhausted, persistence returns a typed `reference_exhausted` failure rather than wrapping or reusing a reference.

## 4. Private payload separation

`submission_payloads` separates:

```text
original_payload
normalized_payload
proposed_changes
```

P5-01B creation persists only the safely parsed `original_payload` supplied by the intake service. Normalized review data and proposed canonical changes remain null until later review work explicitly writes them.

Database constraints require each non-null payload column to be a JSON object.

## 5. Private contact separation

`submission_contacts` is optional and separate from the parent row.

It stores only the persistence outputs expected from a later contact-protection service:

```text
encrypted_email
email_hash
contact_allowed
retention_until
```

P5-01B does not implement encryption or hashing of contact data. It requires already protected persistence input. Plaintext email is not a field in the persistence command or table schema.

## 6. Status secret persistence

P5-01A issues a plaintext follow-up secret and produces a one-way SHA-256 stored representation.

P5-01B persists only:

```text
status_token_hash
```

The database enforces the expected `sha256:<hex>` shape and uniqueness.

Plaintext status secret is not persisted in the Submission schema.

## 7. Initial atomic persistence

Creating a Submission persists one private bundle:

```text
submissions row
+ submission_payloads row
+ optional submission_contacts row
+ initial submission_events row
```

The Drizzle backend executes these statements as one database batch.

The initial workflow event is:

```text
from_status: null
to_status: received
action: submission_received
```

Any database constraint or uniqueness conflict prevents the private bundle from being accepted as a successful creation.

## 8. Idempotency preparation for P5-01C

P5-01B persists:

```text
intake_request_id
request_fingerprint
```

and exposes a lookup by intake request UUID.

P5-01B does not yet decide whether a repeated request is replay or changed-content conflict. P5-01C owns that service behavior.

This separation lets P5-01C implement:

```text
same request ID + same fingerprint
→ replay original receipt

same request ID + different fingerprint
→ conflict
```

without adding another persistence migration.

## 9. Workflow transition contract

Allowed transitions are explicit.

```text
received
├─ triage
├─ duplicate
├─ rejected_spam
└─ withdrawn

triage
├─ in_review
├─ duplicate
├─ rejected_spam
└─ withdrawn

in_review
├─ needs_information
├─ on_hold
├─ resolved
├─ duplicate
└─ withdrawn

needs_information
├─ in_review
├─ on_hold
├─ resolved
└─ withdrawn

on_hold
├─ in_review
├─ needs_information
├─ resolved
└─ withdrawn
```

Terminal states are:

```text
resolved
duplicate
rejected_spam
withdrawn
```

P5-01B rejects forbidden transitions and invalid resolution shapes before persistence.

## 10. Stale-state guard

A transition command carries:

```text
submission_id
expected_status
expected_updated_at
```

The Drizzle backend executes a fail-closed guard in the same atomic batch as the parent update and workflow-event insert.

If the current private row no longer matches the reviewed state, PostgreSQL rejects the batch and the backend returns a typed conflict.

This prevents a stale reviewer action from writing an event for a state that is no longer current.

## 11. Workflow event history

`submission_events` stores metadata-only operational history:

- submission UUID;
- from status;
- to status;
- action;
- optional reason code;
- actor ID;
- actor type;
- optional internal note;
- event time.

Actor types are:

```text
submitter
reviewer
system
```

P5-01B does not expose this event stream publicly.

## 12. Constraints and indexes

The database enforces:

- unique intake request UUID;
- unique public reference;
- unique status token hash;
- SHA-256 request fingerprint shape;
- public reference shape;
- target type/target UUID pair consistency;
- priority range;
- resolution requirements;
- timestamp ordering;
- JSON object payload shapes;
- encrypted-contact non-empty value;
- email hash shape;
- workflow event status-change shape.

Indexes support:

- workflow queue ordering;
- submission-type history;
- target lookup;
- contact duplicate/retention work;
- submission event history;
- actor event history.

## 13. Implementation result

P5-01B adds:

- Drizzle schema and generated migration `0023`;
- Drizzle persistence backend;
- in-memory persistence backend;
- workflow transition contract;
- persistence interfaces and typed errors;
- focused persistence/workflow tests;
- schema contract check;
- this durable implementation record.

## 14. Out of scope

P5-01B does not implement:

- public intake API;
- public forms;
- request fingerprint generation;
- idempotent replay decision logic;
- contact encryption service;
- Turnstile;
- rate limiting;
- submission-specific evidence tables;
- submission Media upload;
- review UI;
- partial approval;
- canonical mutation;
- public export or publication.

## 15. Completion criteria

P5-01B is complete when:

1. generated migration and schema are aligned;
2. Migration drift is green;
3. parent, payload, optional contact, and initial event persist atomically;
4. public reference allocation is year-scoped and non-wrapping;
5. plaintext status secret is absent from persistence schema;
6. plaintext email is absent from persistence schema and persistence command;
7. request ID and fingerprint are durable for P5-01C;
8. allowed workflow transitions are explicit;
9. stale expected state causes conflict before transition commit;
10. focused tests and full repository validation are green;
11. no public form, public route, canonical mutation, or type-specific submission behavior is added.

## Next

After P5-01B is green and merged, proceed to:

```text
P5-01C — idempotent private intake service
```

P5-01C will combine P5-01A parsing/status-secret behavior with P5-01B persistence to implement deterministic replay, changed-content conflict, safe private intake receipts, and failure atomicity before public routing is exposed.
