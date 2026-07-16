# P5-06E1 Photos parent resolution service and private status

**Implementation item:** P5-06E1  
**Status:** Active  
**Last updated:** 2026-07-16

## Purpose

Resolve a reviewed Photos parent Submission only after every Media item created by its exact P5-05E handoff has one durable initial review decision.

The parent outcome is derived rather than selected:

```text
all child Media approved  → approved
mixed approved/rejected   → partially_approved
all child Media rejected  → not_approved
any child still pending   → no parent resolution
```

## Authoritative child set

The exact child set comes only from the retained `photo_media_handoff_created` Submission event. Its versioned payload binds:

- the Photos Submission;
- the Entity or Location target;
- one to eight Media Asset IDs;
- the private processing request;
- the review-safe source context.

Current Media rows alone cannot be used to invent or expand the parent set.

## Eligible child decisions

P5-06E consumes only the first durable Media review decision whose expected state was `pending`:

- `approve_public` produces the bounded `approved` child outcome;
- `reject` produces the bounded `rejected` child outcome.

Later restriction, supersession, storage-copy, or publication operations do not rewrite the original Photos parent result. An accepted child must currently be `accepted / public_gallery`; a rejected child must currently be `rejected / public_gallery_candidate / private`. Deleted, changed, missing, multiply decided, or target-mismatched Media fails closed.

## Exact-state request

The protected request includes:

- request UUID;
- exact parent `updatedAt`;
- exact P5-05E handoff event UUID;
- every child Media UUID and exact `updatedAt`;
- every initial Media decision UUID, action, decision time, and resulting review status;
- one public-safe message;
- an optional private reviewer note.

The client cannot supply the parent resolution. The service recalculates it from the complete validated child set.

## Atomic commit

The transaction acquires a Submission-scoped advisory lock and revalidates:

- parent type, `in_review` state, null resolution, and exact version;
- exact retained handoff event;
- absence of an earlier parent-resolution event;
- every child Media state and version;
- every durable initial Media decision identity and outcome;
- request-event uniqueness.

The same transaction changes the parent to `resolved`, stores `approved`, `partially_approved`, or `not_approved`, and appends `photo_parent_resolution_decided` with the complete bounded decision snapshot.

## Replay

```text
same UUID + same request → replayed receipt
same UUID + changed request → conflict
```

A concurrent unique or exact-state conflict rolls back the complete batch. If the identical event won the race, the service returns the durable replay.

## Private status

Private status may expose only:

- parent public status label;
- public-safe resolution message;
- opaque `MEDIA-<UUID>` references;
- `approved` or `rejected` per item.

It excludes storage keys, object URLs, filenames, hashes, reviewer identity, private notes, rights proof, contact data, status-token hashes, and private processing metadata.

## Authorization

The mutation uses a separate exact-subject capability:

```text
CPM_ADMIN_PHOTO_PARENT_RESOLUTION_SUBJECTS
submission:photos:resolve
```

Media review permission alone cannot resolve the parent.

## Explicit non-effects

P5-06E1 does not:

- make a Media decision;
- copy private objects into public storage;
- publish or unpublish Media;
- modify Entity, Location, Claim, or Evidence;
- delete Media or private objects;
- activate export or release data;
- perform P5-07 canonical application;
- claim configured production authorization or deployment.

## Next

After this service/API boundary merges, P5-06E2 will add a protected parent-resolution preview and reviewer control that can submit only the exact server-projected child decision set.
