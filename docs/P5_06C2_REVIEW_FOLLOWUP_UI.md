# P5-06C2 reviewer follow-up UI and cross-submission controls

**Implementation item:** P5-06C2  
**Status:** Implemented; repository validation pending  
**Depends on:** P5-06C1 merged in PR #233

## Purpose

Expose the P5-06C1 exact-state information-request, Hold, and resume API through bounded protected administration controls for Suggest, payment/problem reports, and Photos parent Submissions.

## Covered workspaces

```text
/admin/submissions/detail
/admin/submissions/report-detail
/admin/submissions/photo-detail
```

Each workspace loads its existing protected detail response, validates the complete response schema, and extracts only:

- Submission ID;
- public Submission reference;
- exact Submission type;
- current workflow status;
- exact `updatedAt` state guard.

## Available controls

From `in_review`:

- request information with bounded requested-action and public-status text;
- place review on a 30, 60, or 90 day Hold with private reason, required action, and public-status text.

From `needs_information`:

- explicitly resume review.

From `on_hold`:

- explicitly resume review.

No automatic transition occurs when a Hold date arrives.

## Retry and conflicts

- a failed network or bounded service response may retry the exact same request UUID;
- stale workflow status or `updatedAt` produces a bounded conflict and requires current-state reload;
- successful operations update the locally displayed state only from the validated receipt;
- backend details, private reviewer content, status secrets, contact data, and storage identities are not rendered.

## Suggest migration

The Suggest page no longer renders the earlier one-direction-only information-request and Hold panels. The common P5-06C panel replaces them and adds both resume operations while retaining:

- P5-02 review entry;
- accepted-as-Candidate;
- protected detail and read-only signals.

The earlier services and endpoints remain available for compatibility in this slice; removal or consolidation is not part of P5-06C2.

## Explicit non-effects

P5-06C2 does not:

- accept submitter response content;
- resolve a Submission;
- decide Evidence or reports;
- approve or reject Media;
- synchronize Photos child Media decisions to the parent;
- apply canonical changes;
- export or publish data;
- change public status without a protected exact-state operation;
- claim deployment or launch readiness.

## Validation

Focused browser tests cover:

- report information request with exact request content and transition to resumable state;
- Photos Hold resume without rendering opaque upload identity;
- built Suggest, report, and Photos reviewer surfaces;
- absence of protected operational fields in generated HTML.

## Next

P5-06D adds bounded common terminal outcomes only where type-specific decisions have not already resolved the Submission.
