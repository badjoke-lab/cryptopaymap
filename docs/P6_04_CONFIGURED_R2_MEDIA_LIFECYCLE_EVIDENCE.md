# P6-04 — Configured R2 media lifecycle evidence

## Decision

Repository-complete media handling is not configured-environment proof. P6-04 is a launch-blocking evidence gate for the full R2 lifecycle from upload authorization through quarantine, inspection, derivative generation, approval, publication, takedown, deletion, and cache invalidation.

Configured staging evidence: `unproven`.

Configured production evidence: `unproven`.

Neither environment may be marked `passed` without executed procedures and retained redacted artifacts.

## Required lifecycle

A passing run covers this ordered state model:

1. bounded upload authorization;
2. private quarantine upload;
3. server-side object inspection;
4. rejection or approval decision;
5. deterministic derivative generation;
6. media receipt and audit-event binding;
7. explicit public-derivative publication;
8. takedown or rights-removal transition;
9. object deletion or retention action;
10. CDN and externally observable unavailability verification.

A private original cannot become public by changing only a URL, object key, metadata flag, or database state.

## Upload authorization

The configured run proves that upload authorization is bound to:

- one submission or media intent identity;
- one allowlisted private object-key prefix;
- accepted MIME types;
- maximum object size;
- maximum object count;
- short expiry;
- one-use or otherwise bounded replay behavior;
- authenticated or permitted caller context where required.

Missing, expired, replayed, wrong-prefix, oversized, wrong-content-type, and over-count attempts fail closed.

## Quarantine and inspection

All uploaded originals enter private quarantine. Before approval, the run proves:

- the object is not publicly addressable;
- bucket policy and object-key scope prevent anonymous read;
- browser-supplied MIME type is not trusted;
- actual content type, dimensions, size, and supported format are inspected server-side;
- malformed, disguised, truncated, decompression-bomb-like, unsupported, or unsafe objects are rejected;
- rejected objects cannot create public derivatives or public database references;
- inspection failure leaves a safe failure receipt and no false approval state.

## Derivative generation and approval

For an approved object, evidence proves:

- derivative keys are deterministic and scoped to the approved media identity;
- derivative bytes have retained digests;
- width, height, format, and size constraints are recorded;
- EXIF or other unnecessary private metadata is removed where required;
- source identity, rights basis, attribution, and license metadata remain bound;
- the private original remains private;
- publication requires an explicit approved derivative and publication receipt;
- duplicate generation is idempotent and does not create conflicting public objects.

## Public delivery boundary

Only approved derivatives may be public.

The run proves:

- anonymous delivery succeeds only for the approved public key;
- quarantine and original keys return denial or not-found behavior;
- unapproved, rejected, superseded, and deleted derivative keys are not delivered;
- public cache headers are bounded according to takedown requirements;
- public database projection contains only approved derivative references and safe metadata.

## Failure, replay, and conflict matrix

| Case | Required result |
| --- | --- |
| Expired upload authorization | denied; no object accepted |
| Wrong object-key prefix | denied; no cross-submission write |
| Declared image with non-image bytes | quarantined then rejected; no derivative |
| Oversized or unsupported object | rejected; no public state |
| Duplicate upload replay | deterministic existing result or explicit rejection; no duplicate media identity |
| Concurrent derivative generation | at most one canonical derivative set |
| Stale approval decision | conflict; no publication |
| Failure after derivative write but before receipt commit | no orphaned public object; cleanup or quarantine proof retained |
| Failure after receipt creation but before public activation | no externally visible public object |
| Takedown during cached delivery | public reference removed and cache invalidation verified |

## Takedown and deletion

A configured takedown run proves:

1. the public projection stops referencing the derivative;
2. new origin requests cannot retrieve the removed derivative;
3. CDN purge or cache-version invalidation executes;
4. externally observable checks confirm unavailability after the bounded propagation window;
5. the private original follows the documented retention or deletion decision;
6. derivatives follow the documented deletion rule;
7. receipts and safe audit history remain according to policy;
8. rights removal does not silently erase required evidence that a takedown occurred.

Deletion of a database row alone is not sufficient proof of object deletion or CDN unavailability.

## Evidence receipt metadata

Each environment receipt records:

- evidence id;
- environment;
- source revision;
- R2 account and bucket safe identifier or digest;
- lifecycle-rule revision;
- upload authorization policy digest;
- media and submission safe identities;
- private original key digest;
- derivative key digests;
- original and derivative content digests;
- inspection result classes;
- derivative dimensions, formats, and sizes;
- approval, publication, takedown, and deletion receipt digests;
- audit-event digest;
- cache policy and purge receipt safe identifiers;
- origin and external availability check results;
- execution timestamps;
- exceptions;
- operator;
- expiry or recheck date;
- redacted artifact location and artifact digest.

No R2 credential, signed upload secret, raw private original, private submission payload, contact value, service token, or unrestricted bucket listing may appear in retained artifacts.

## Pass rule

An environment may be marked `passed` only when:

- authorization boundaries reject every required negative case;
- originals remain private throughout the lifecycle;
- inspection rejects unsafe and disguised objects;
- approved derivatives are deterministic, digest-bound, and rights-bound;
- public delivery exposes only explicitly approved derivatives;
- partial failure creates no orphaned public object or false publication state;
- replay and concurrency create no duplicate effect;
- takedown removes public references and delivery;
- deletion and retention match policy;
- CDN and external unavailability are verified;
- retained artifacts are present and digest-verified;
- the evidence has not expired;
- no high-severity exception remains open.

Repository audit passing means only that this evidence contract is present and internally consistent.

## Recheck rule

Repeat configured evidence after changes to:

- R2 account, bucket, binding, access policy, or custom domain;
- object-key strategy;
- upload authorization logic;
- file-type, dimension, or size limits;
- inspection or malware-detection implementation;
- derivative generation code or formats;
- media approval, publication, takedown, or retention state transitions;
- CDN cache policy or purge mechanism;
- rights, attribution, or license metadata handling.

Otherwise recheck before launch and at least every 90 days while operational.

## Boundary

This slice does not prove public export generation, release validation or activation, domain cutover, privacy deletion across all non-media records, backup restore, rollback drill, monitoring, or launch readiness.

## Next owner

P6-05 owns configured public export generation, validation, release creation, activation, and externally observable publication evidence.
