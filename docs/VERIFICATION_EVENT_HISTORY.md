# CryptoPayMap verification event history

## Purpose

Verification events provide an append-only audit history for acceptance-claim decisions.

```text
evidence review
  -> verification decision
  -> verification event
  -> current claim projection
```

The current claim status and visibility remain stored on the acceptance claim for efficient reads. The ordered event history records why that state was reached and must replay to the same projection.

## Append-only boundary

A verification event is not edited or deleted to rewrite history. Corrections are recorded as new `corrected` events. An event stores its creation time separately from the effective time of the decision.

```text
created_at
when the history row was recorded

effective_at
when the decision or state change applies
```

Late entry is therefore possible without pretending that the decision occurred at ingestion time.

## Event types

```text
confirmed
reconfirmed
marked_stale
ended
restored
corrected
hidden
unhidden
```

Initial status transitions are:

```text
new or candidate -> confirmed
confirmed -> confirmed         reconfirmed
confirmed -> stale
confirmed or stale -> ended
stale -> confirmed             restored
```

Visibility history remains separate from verification status:

```text
public -> hidden or temporarily_hidden
hidden or temporarily_hidden -> public
```

Hiding does not assert that cryptocurrency acceptance ended.

## Reason codes

Every event requires a stable lowercase machine-readable reason code such as:

```text
evidence_threshold_met
acceptance_reconfirmed
review_overdue
newer_contradiction
payment_route_ended
publication_approved
privacy_review
record_correction
```

Reason codes support filtering and automation. A public summary provides an optional publishable explanation. An internal note remains outside public exports.

## Evidence relationships

Verification events link to evidence through a join table rather than storing evidence identifiers in an array.

```text
basis
contradiction
context
superseded
```

Confirmation, reconfirmation, and restoration require at least one `basis` evidence link. Marking a claim stale or ended requires at least one `basis` or `contradiction` link.

The same evidence record cannot be linked twice to the same event. Evidence remains an independent reviewed record and is not copied into the event row.

## Actors

```text
operator
system
import
```

Operator events require an actor identifier. System and import events may omit an actor identifier but retain the actor type so automated and migration decisions remain distinguishable from manual review.

## History replay

Events are replayed in effective-time order. When an event declares a `from_status` or `from_visibility`, it must match the current projection at that point. A mismatch indicates an incomplete, out-of-order, or corrupted history and fails validation.

A successful replay returns the projected current status and visibility. The administration layer will compare that projection with the current acceptance-claim row before committing a decision.

## Transaction boundary

P2-08 defines the schema, transition validation, and replay rules. The administration phase must apply the acceptance-claim update, verification event, and evidence links in one database transaction. The event table alone does not mutate the claim.

## Public boundary

Public history may expose the event type, effective time, stable reason, public summary, and approved public evidence references. It must never expose internal notes, private or restricted evidence, actor identifiers, or review-only metadata.
