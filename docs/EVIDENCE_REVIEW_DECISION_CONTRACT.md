# Evidence review decision contract

**Implementation item:** P3-08A  
**Status:** Repository contract

## Purpose

Evidence review is a separate administration capability. Reviewing one Evidence record may change the Evidence disposition and may perform one explicit Claim action, but only inside one guarded atomic decision.

## Authorization

- capability: `evidence:review`
- environment allowlist: `CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS`
- verified administration identity required
- UUID idempotency key required
- Candidate promotion authorization does not grant Evidence review access

## Evidence disposition

- `accepted`: the Evidence becomes accepted and may support one explicit Claim action
- `rejected`: the Evidence becomes rejected and cannot change Claim state
- `held`: the Evidence remains pending and cannot change Claim state

A rejected or held decision uses the `insufficient` finding and `no_change` action.

## Finding

- `supports_claim`
- `contradicts_claim`
- `insufficient`

Supporting and contradicting findings must match the stored Evidence polarity when the Evidence is accepted.

## Claim action

- `no_change`
- `confirm`
- `mark_stale`
- `end`
- `reject`

Confirmation requires the post-decision accepted Evidence set to satisfy the existing threshold evaluator and requires the Claim payment flags and payment instructions. Mark-stale, end, and reject actions require accepted contradicting Evidence.

## Version and set guards

Every decision fixes:

- Evidence ID, version, and pending review status
- Claim ID, version, status, and visibility
- exact accepted Evidence ID set before the decision
- decision time and normalized request content

Changed state produces a conflict rather than a partial review.

## Atomicity and replay

The in-memory reference backend uses copy-on-write state. Evidence status, Claim state, verification-event projection, and the request receipt commit together. Injected pre-commit failure leaves all state unchanged.

An identical request ID and normalized payload replays the prior receipt. Reusing the request ID with different content is a conflict.

## Persistence handoff

P3-08A does not add a durable decision table or database migration. P3-08B must add durable decision persistence, the missing rejected verification-event representation, and a Drizzle/Neon atomic backend before a protected reviewer workspace is connected.

## Exclusions

- no automatic publication
- no Evidence visibility change
- no public Claim visibility change
- no live Cloudflare Access verification claim
- no live database transaction verification claim
