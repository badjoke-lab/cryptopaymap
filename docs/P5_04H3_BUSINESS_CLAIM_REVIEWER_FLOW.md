# P5-04H3 Business Claim field-application reviewer flow

**Implementation item:** P5-04H3  
**Status:** Completed through #215  
**Started:** 2026-07-14  
**Completed:** 2026-07-14

## Purpose

Expose the completed P5-04H1 projection and P5-04H2 durable application transaction through one protected, operator-safe reviewer flow.

## Delivered boundary

P5-04H3:

- requires a verified administration identity authorized by `CPM_ADMIN_CLAIM_FIELD_APPLICATION_SUBJECTS`;
- exposes only a bounded private administration API;
- requires one exact Business Claim Submission UUID and one exact approved relationship-decision UUID;
- requires one UUID `Idempotency-Key` for application POST requests;
- presents current and submitted values without exposing protected contact, proof, authority statement, provider response, account, or permission material;
- requires complete accept/reject partitions for every submitted Entity, Location, and payment proposal;
- copies values only from the normalized Claim projection;
- binds POST decisions to the exact workspace Submission, relationship, Entity, and Location versions;
- returns bounded committed or replayed receipts;
- fails closed for stale, malformed, unauthorized, incomplete, leaking, or conflicting operations.

P5-04H3 does not:

- add a public Claim route;
- grant an owner account or editing permission;
- allow arbitrary replacement values;
- create public Evidence or Media;
- convert private payment drafts directly into public acceptance claims;
- trigger export or publication;
- expose protected verification material.

## Protected reviewer flow

The protected route is:

```text
GET  /admin/api/business-claims/{submissionId}/field-application
POST /admin/api/business-claims/{submissionId}/field-application
```

Both operations require the exact `relationshipDecisionId` query parameter. POST additionally requires a UUID `Idempotency-Key`.

GET returns:

- exact Submission state and version;
- approved relationship summary;
- exact canonical target identity and version;
- current and submitted values for reviewable Entity or Location fields;
- indexed payment proposals;
- a request seed for the durable decision;
- bounded eligibility issues.

POST accepts only:

- the exact request-seed versions;
- complete field and payment accept/reject partitions;
- no replacement values;
- no protected verification or account material.

## One-time application audit

The H3 integration audit identified that an identical Claim could previously attempt a second H2 application under a different request UUID after the first application updated the Submission timestamp.

P5-04H3 closes that gap at two layers:

1. the application service checks for an existing `business_claim_fields_applied` event before projection;
2. the atomic database guard requires that no prior application event exists for the Submission before any canonical update or receipt insert occurs.

An identical request UUID can still replay the stored receipt. A different UUID for an already applied Submission fails as a bounded conflict. Concurrent attempts remain protected by the atomic guard and rollback behavior.

## Completion evidence

Pull request #215 adds:

- a strict reviewer workspace contract and loader;
- a strict editor request contract;
- a protected Cloudflare Pages GET/POST function;
- exact allowlisted-subject authorization;
- UUID idempotency-key binding;
- bounded API error responses;
- safe current-versus-proposed Entity, Location, and payment presentation;
- Submission-level one-time application checks;
- an atomic database `not exists` guard for prior field applications;
- workspace, API, one-time application, authorization, conflict, and leakage tests;
- an executable reviewer-flow schema check.

Final implementation head `958562c69881da8790126e3aa09538295d229622` passed Foundation validation, Migration drift, Staging review validation, and representative screenshot capture.

## Completion gate

An authorized operator can load one safe field-application workspace, submit explicit complete field decisions with an exact idempotency key, receive one durable committed or replayed receipt, and cannot bypass any Claim, relationship, canonical-version, one-time-application, privacy, or publication boundary.

## Next

P5-04 Business and service claims are repository-complete through P5-04H3. P5-05 begins Photo and Media submission intake while preserving separate Submission approval, Media privacy review, rights review, quarantine, and publication decisions.
