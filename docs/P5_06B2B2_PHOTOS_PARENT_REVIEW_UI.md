# P5-06B2B2 Photos parent reviewer UI

**Status:** Implemented in PR #232; validation pending

## Purpose

Connect the protected Photos parent queue and detail APIs to the administration workspace and reuse the P5-06B1 exact-state review-entry boundary.

## Queue

The Submissions administration page includes a Photos parent queue with bounded normalized summaries:

- public Submission reference;
- target type and target ID;
- workflow status and priority;
- submitter relationship;
- one-to-eight candidate count;
- submitted and updated timestamps.

The queue does not request object keys, signed URLs, image bytes, contact values, status secrets, or reviewer notes.

## Detail

The protected detail page shows:

- parent Submission state and target identity;
- normalized public-gallery candidate role, declared MIME type and size;
- captured date, rights basis, photographer declaration, description, and suggested alt text;
- bounded parent workflow history.

Opaque quarantine reservation UUIDs remain part of the private normalized contract but are not rendered in the reviewer interface.

## Review entry

Supported controls are:

```text
received -> triage
triage -> in_review
```

Each request carries one UUID request identity, the exact `photos` type, expected status, and exact current `updatedAt` value. Retry preserves the same request identity, while stale-state conflicts require a current-state reload.

## Explicit non-effects

This item does not:

- approve or reject Media;
- copy private derivatives to public storage;
- synchronize a Media decision to the parent Submission;
- resolve or partially resolve the parent Submission;
- mutate canonical data;
- export, publish, deploy, or claim launch readiness.

P5-06C continues with missing information-request, hold, and resume coverage after P5-06B is complete.
