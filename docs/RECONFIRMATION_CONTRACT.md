# Reconfirmation and review-window contract

**Implementation item:** P3-09A  
**Status:** Repository contract

## Purpose

Reconfirmation scheduling and Claim status mutation are separate responsibilities.

The queue evaluator classifies Claims and recommends work. It never changes Claim state. A separate expiration service may perform the policy-defined `confirmed → stale` transition only after the stored review deadline has passed and every reviewed field still matches.

## Queue eligibility

The pure queue evaluator returns:

- `overdue`: a confirmed Claim whose `next_review_at` is at or before the evaluation time;
- `missing_deadline`: a confirmed Claim with no `next_review_at`;
- `stale_review`: an existing stale Claim requiring manual review;
- `due_soon`: a confirmed Claim due within the configured bounded window.

Candidate, ended, rejected, deleted, and future Claims outside the due-soon window are excluded.

## Recommended action

- overdue confirmed Claim: `mark_stale`;
- missing deadline, stale Claim, or due-soon Claim: `review`.

A recommendation is not a mutation and does not prove that acceptance ended.

## Automatic expiration boundary

The expiration service accepts only a system actor with `claim:expire`.

Every request fixes:

- Claim ID;
- exact Claim version;
- expected confirmed status;
- exact visibility;
- exact `next_review_at` deadline;
- effective time;
- reason code `review_window_expired`;
- normalized request fingerprint.

The service rejects execution before the deadline. It transitions only `confirmed → stale`, creates a `marked_stale` event projection, preserves Claim visibility, and retains the expired review date for queue context.

## Replay and atomicity

An identical request ID and normalized payload replays the prior receipt. Reusing the request ID with different content is a conflict.

The in-memory reference backend uses copy-on-write state. Claim status, event projection, and replay receipt commit together. Injected pre-commit failure leaves all state unchanged.

## Manual reconfirmation boundary

Manual confirmation, reconfirmation, restoration, ending, and rejection remain Evidence-backed decisions. P3-09 does not bypass the P3-08 Evidence threshold or decision contract.

## Persistence handoff

P3-09A does not add a database table, scheduler, or protected queue. P3-09B must add durable expiration receipts, transactional Claim guards, verification-event persistence, and the bounded database queue before scheduled or operator execution is connected.

## Exclusions

- no automatic ended status;
- no automatic publication or visibility change;
- no automatic reconfirmation;
- no inference that an expired Claim is false;
- no live scheduler, database, or Cloudflare Access verification claim.
