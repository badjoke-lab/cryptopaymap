# P5-06B2B Photos parent review API

**Status:** In progress

## Purpose

Create the protected parent-Submission read boundary required before the Photos reviewer workspace can expose review-entry controls.

## Protected routes

```text
GET /admin/api/photo-submissions
GET /admin/api/photo-submissions/:submissionId
```

The queue returns bounded normalized summaries for actionable `photos` Submissions. The detail route returns:

- parent Submission metadata and workflow state;
- normalized target, relationship, and one-to-eight public-gallery candidate summaries;
- bounded workflow history.

## Privacy boundary

The responses do not include:

- object-storage keys;
- signed upload URLs;
- image bytes or private derivatives;
- contact values;
- status secrets or hashes;
- reviewer identity or private notes;
- internal persistence detail.

## Exact identity rules

The stored parent Submission type must be `photos`. Stored target type and target ID must exactly match the normalized review projection. Invalid or incomplete rows fail closed rather than returning a partial workspace.

## Explicit non-effects

This item does not:

- process or approve Media;
- publish an image;
- resolve the parent Submission;
- apply canonical data;
- export or deploy;
- add public access.

The following bounded UI item will connect these routes to a protected Photos parent queue/detail page and reuse the P5-06B1 review-entry API.
