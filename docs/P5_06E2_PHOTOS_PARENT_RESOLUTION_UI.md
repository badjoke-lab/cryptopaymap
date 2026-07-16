# P5-06E2 Photos parent resolution preview and reviewer controls

**Implementation item:** P5-06E2  
**Status:** Active  
**Last updated:** 2026-07-16

## Purpose

Expose a protected, exact-state preview for the P5-06E1 Photos parent-resolution boundary and allow a reviewer to submit only the server-projected child Media snapshot.

The reviewer cannot choose the parent outcome.

```text
all child Media approved  → approved
mixed approved/rejected   → partially_approved
all child Media rejected  → not_approved
any child still pending   → no resolve control
```

## Protected preview

`GET /admin/api/photo-submissions/:submissionId/parent-resolution` uses the same exact-subject authorization and the same P5-06E1 state backend as the mutation.

The preview revalidates:

- the Photos parent Submission;
- its exact retained P5-05E handoff event;
- the exact handed-off Media ID set and order;
- each current Media version and target binding;
- each first durable pending-state `approve_public` or `reject` decision;
- the parent workflow state and existing resolution.

The result classifies the parent as:

- `ready` — every child decision is complete and an exact request snapshot is available;
- `pending` — at least one handed-off Media item still requires a decision;
- `not_in_review` — the parent is not yet in the required workflow state;
- `resolved` — the parent already has a terminal aggregate outcome;
- `blocked` — the handoff or child state is inconsistent and must fail closed.

## Exact request snapshot

Only a `ready` preview contains `expectedRequest`.

It includes:

- exact parent `updatedAt`;
- exact handoff event UUID;
- every child Media UUID and `updatedAt`;
- every initial decision UUID, action, decision time, and resulting review status.

The browser copies that snapshot unchanged and adds only:

- a new request UUID;
- a bounded public-safe status message;
- an optional private reviewer note.

Any intervening parent, handoff, Media, or decision change produces a conflict rather than a stale commit.

## Reviewer control

The Photos parent workspace displays:

- approved, rejected, and pending counts;
- opaque Media references;
- the server-derived parent outcome;
- the exact readiness state;
- reload and same-request retry paths.

No resolve button is rendered for pending, blocked, non-review, or resolved previews.

## Privacy boundary

The preview and reviewer page do not expose:

- object storage keys or URLs;
- source filenames;
- content hashes;
- private validation or rights proof;
- submitter contact data;
- status secrets;
- reviewer identities;
- private notes from earlier operations.

Private status remains the submitter-facing bounded projection defined in P5-06E1.

## Authorization

Both preview and mutation require:

```text
CPM_ADMIN_PHOTO_PARENT_RESOLUTION_SUBJECTS
submission:photos:resolve
```

General Submission read permission or Media review permission alone is insufficient.

## Explicit non-effects

P5-06E2 does not:

- make or change a child Media review decision;
- select the aggregate result manually;
- copy, publish, unpublish, or delete Media;
- modify Entity, Location, Claim, or Evidence;
- activate export or release data;
- perform P5-07 canonical application;
- claim configured production authorization or deployment.

## Next

After P5-06E2 merges green, P5-06E is complete and development proceeds to P5-06F cross-submission integration audit.
