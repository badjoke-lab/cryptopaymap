# P5-06B2A report review-entry UI

**Status:** In progress

## Purpose

Connect the P5-06B1 protected review-entry API to the existing payment and problem report reviewer workspace.

## Result

The report detail page now loads the current private Submission state before showing any mutation control.

Supported controls:

```text
received -> triage
triage -> in_review
```

Each request includes:

- one UUID request identity;
- the exact report Submission type;
- the expected current workflow status;
- the exact current `updatedAt` value.

The client parses both the protected report detail response and the review-entry receipt. A failed retry reuses the same request identity, while a stale-state conflict directs the reviewer to reload current state.

## Explicit non-effects

This UI does not:

- make a positive or negative Evidence decision;
- create a recheck;
- change Claim status or visibility;
- apply a correction;
- mutate canonical records;
- export or publish;
- expose private contact, restricted evidence, reviewer identity, or backend details.

## Follow-up

P5-06B2B adds the Photos parent Submission queue/detail workspace and reuses the same review-entry boundary. P5-06C adds information, hold, and resume transitions.
