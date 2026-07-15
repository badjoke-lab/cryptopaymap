# P5-06B1 common review entry

**Status:** In progress in PR #229

## Purpose

P5-06B1 closes the protected review-entry gap for `payment_report`, `problem_report`, and `photos` Submissions. Public intake continues to create private Submissions in `received`; this item allows an authorized reviewer to move those records into the existing review workflow without applying decisions, changing canonical data, or publishing Media.

## Supported transitions

```text
received -> triage
triage -> in_review
```

Every transition requires:

- an exact supported Submission type;
- the expected current workflow status;
- the exact expected `updatedAt` value;
- a UUID request identity;
- an authorized protected-admin subject with `submission:review-entry` capability.

## Protected boundary

```text
POST /admin/api/review-entry/:submissionId
```

The endpoint accepts strict JSON only and returns bounded error codes. It does not expose database, audit, identity-policy, or persistence details.

## Persistence and replay

The implementation reuses the shared atomic Submission transition and Audit boundary. It provides deterministic replay, changed-use conflict detection, exact-state race recovery, and rollback on persistence failure.

## Explicit non-effects

P5-06B1 does not add:

- report or Photos reviewer UI;
- information requests, holds, resumes, or terminal decisions;
- Media approval or publication;
- canonical mutation;
- export activation;
- deployment or launch claims.

P5-06B2 will connect the protected API to reviewer UI controls after this contract is merged.

## Verification

Before merge, all normal repository workflows must pass, including Foundation validation, migration drift, staging review validation, and representative screenshot capture.
