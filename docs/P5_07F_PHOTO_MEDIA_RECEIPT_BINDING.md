# P5-07F Photos Media receipt binding

**Implementation item:** P5-07F  
**Status:** Active  
**Last updated:** 2026-07-21

## Purpose

P5-07F reconciles the resolved Photos parent Submission with the durable Media review decisions that actually applied every child outcome.

The existing parent decision remains the source decision. The common application lifecycle no longer uses that parent Submission event as a substitute application receipt. Instead, an approved or partially approved Photos parent registers the complete exact child receipt set as:

```text
kind: media_review_decision
ids: every decisionId from the parent event
```

## Exact binding

Registration parses the exact private `photo_parent_resolution_decided` payload and requires:

- the payload request ID to equal the source decision event ID;
- the payload Submission ID and resolution to equal current canonical Submission state;
- unique child Media review decision IDs;
- every referenced `media_review_decisions` row to exist;
- exact Media Asset ID, action, initial pending status, resulting accepted/rejected status, and decision timestamp agreement.

Missing, duplicated, or mismatched child receipts make the registration ineligible or unavailable. The client cannot supply or reorder receipt IDs.

## Lifecycle result

For `approved` or `partially_approved` Photos parents:

```text
applicationKind: photo_media_set
applicationStatus: committed
applicationReceipt: media_review_decision[]
publicationStatus: pending
publicationReceipt: null
```

The source decision reference still points to the parent resolution event. This preserves both levels: the parent explains the aggregate outcome, while the application receipt identifies the exact canonical Media writes.

## Publication boundary

Publication remains pending. A later export release decision is the only valid publication receipt and release activation owner.

No Media, Submission, export, or release mutation is added by P5-07F. No new endpoint, table, migration, reviewer control, deployment, or retention behavior is introduced.

## Verification

```text
node scripts/check-p5-07f-photo-media-receipt-binding.mjs
npx vitest run tests/submission-application-registration.test.ts
npm run check
```

## Next

P5-07G executes bounded retention for contact, payload, Evidence, proof, and Media private material. Publication and export activation remain separate owners.
