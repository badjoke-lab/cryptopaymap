# P5-07D1 Problem Report Location correction application

**Implementation item:** P5-07D1  
**Status:** Active  
**Last updated:** 2026-07-18

## Purpose

P5-07D1 applies one bounded class of approved Problem Report correction handoff:

```text
resolved / approved Problem Report
+
problem_correction_handoff application pending
+
approved location_profile proposal
↓
private user-submission Source Record
+
existing guarded Location profile correction transaction
+
location_profile_correction_decision receipt
↓
common application committed
+
publication pending
```

The slice reuses the P4-18B4 Location correction owner. It does not create a second canonical Location update implementation.

## Included field scope

P5-07D1 supports only the existing practical Location correction fields:

- `addressLine`;
- `locality`;
- `region`;
- `postalCode`;
- `websiteUrl`;
- `phone`;
- `description`;
- `openingHours`;
- `amenities`;
- `socialLinks`.

Non-null scalar proposals become explicit `set` operations. Non-empty list proposals become complete `replace` operations. Empty lists become explicit `clear` operations.

The client cannot supply the target Location, changed fields, values, Source Record ID, provenance assignment, application outcome, or receipt.

## Explicit exclusions

P5-07D1 rejects rather than partially applies:

- `countryCode` changes;
- latitude or longitude changes;
- asset corrections;
- network corrections;
- payment-instruction corrections;
- generic `other` corrections.

These require separate canonical owners and later P5-07D slices.

The slice also does not:

- change Claim status or visibility;
- create or accept Evidence;
- create a recheck item;
- update Entity fields;
- activate export or release;
- delete private Submission material;
- add reviewer UI;
- claim configured deployment.

## Decision chain

The service validates the complete chain:

1. common application is for `problem_correction_handoff` and `problem_correction`;
2. originating Submission is `problem_report / resolved / approved`;
3. Submission target is an exact Location;
4. source decision event is the application's exact event;
5. event action is `problem_correction_handoff_approved`;
6. typed event payload operation is `approve_correction_handoff`;
7. event payload correction kind is `location_profile`;
8. normalized review projection has the same target and exact proposed correction;
9. target Location exists, is not deleted, and matches the expected reviewed version.

No request body field can override this chain.

## Private Source Record

The protected environment supplies the existing configured `user_submission` source channel:

```text
CPM_USER_SUBMISSION_SOURCE_ID
```

The atomic correction batch verifies that the Source exists, is active, and has `source_type = user_submission`.

The Source Record ID is deterministic from the application and source decision event. Its raw payload contains only:

- Submission public reference;
- source decision event ID;
- target Location ID;
- report type;
- observation date;
- approved typed correction proposal.

It does not copy:

- contact data;
- original private payload;
- private Evidence URL presence;
- reviewer internal note;
- status secret material;
- rate-limit or challenge material.

## Atomic canonical transaction

P5-07D1 extends the existing Drizzle Location correction backend with an optional prefix-statement hook. The normal backend remains unchanged when no hook is supplied.

For this slice, the same atomic batch contains:

1. active user-submission Source guard;
2. deterministic private Source Record insert;
3. exact Location version guard;
4. exact Source Record set guard;
5. field-level provenance replacement;
6. guarded Location practical-profile update;
7. durable `location_profile_correction_decisions` insert.

A conflict rolls back the Source Record and canonical correction together.

## Common application receipt

The shared application receipt enum adds:

```text
location_profile_correction_decision
```

The receipt ID is the unique durable Location correction request UUID. After the canonical transaction succeeds or replays, P5-07B2 records:

```text
application_status = committed
publication_status = pending
```

Canonical commit still does not mean public release.

## Replay and recovery

The same request UUID is used by:

- the durable Location correction decision request;
- the common application lifecycle transition.

Exact retry therefore supports:

- correction transaction replay;
- lifecycle transition replay;
- recovery when the correction committed but lifecycle receipt recording initially failed;
- recognition of an already committed exact application receipt.

Changed-content UUID reuse, stale application state, stale Location state, mismatched decision chain, or a different receipt fails closed.

## Authorization and API

Dedicated allowlist:

```text
CPM_ADMIN_PROBLEM_LOCATION_CORRECTION_SUBJECTS
```

Exact capability:

```text
submission:problem-location-correction:apply
```

Protected route:

```text
POST /admin/api/problem-applications/:applicationId/apply-location-correction
```

Responses are private, `no-store`, and bounded. Database details, reviewer notes, Source payloads, and private Evidence information are not returned in errors.

## Completion criteria

P5-07D1 is complete when:

1. only exact approved `location_profile` handoffs can apply;
2. unsupported field classes fail without partial canonical mutation;
3. the private Source Record and existing Location correction commit atomically;
4. every changed field receives correction provenance from the deterministic Source Record;
5. the common application references the durable correction receipt;
6. exact replay and post-correction lifecycle recovery succeed;
7. no export or publication is activated;
8. focused tests, runtime checks, migration checks, and normal repository CI are green.

## Next

P5-07D continues with separate bounded owners for remaining report correction classes and durable priority-recheck application. No later slice may widen P5-07D1 by silently applying unsupported fields.
