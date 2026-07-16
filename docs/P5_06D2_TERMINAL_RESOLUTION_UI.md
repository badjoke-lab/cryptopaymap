# P5-06D2 terminal-resolution reviewer controls

**Implementation item:** P5-06D2  
**Status:** Active  
**Last updated:** 2026-07-16

## Purpose

P5-06D2 connects the merged P5-06D1 terminal-resolution service to protected Suggest, payment/problem report, and Photos parent workspaces.

## Type-specific control matrix

| Workspace | Common terminal controls shown |
|---|---|
| Suggest | not approved, duplicate, no change, withdrawn |
| Payment/problem report | not approved, withdrawn |
| Photos parent | duplicate, no change, withdrawn |

Problem Report duplicate and no-change remain owned by P5-03G. Business Claim not-approved remains owned by P5-04G. Photos not-approved remains owned by P5-06E child-Media aggregation.

## Safety properties

- controls load and validate the current protected detail response before rendering;
- every request carries exact Submission type, workflow state, and `updatedAt`;
- duplicate requires an exact different same-type Submission UUID;
- retry reuses the same request UUID and body;
- a stale Submission or duplicate reference returns bounded conflict guidance;
- the public message is required and capped at 1,000 characters;
- the optional internal reviewer note is never projected to the submitter;
- no status secret, contact value, request fingerprint, duplicate public reference, or private object identity is rendered into static HTML;
- successful closure updates only the local protected state shown to the reviewer.

## Exclusions

No submitter withdrawal endpoint, Business Claim UI expansion, Photos child-Media aggregation, canonical application, Evidence acceptance, Media approval, export, publication, deployment, or launch claim is included.
