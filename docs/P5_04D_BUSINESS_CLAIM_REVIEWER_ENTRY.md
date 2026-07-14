# P5-04D Business claim protected reviewer entry

**Implementation item:** P5-04D  
**Status:** Completed through #209  
**Started:** 2026-07-14  
**Completed:** 2026-07-14

## Purpose

Expose received business Claim submissions to authorized reviewers through a bounded queue and detail entry that composes the P5-04A review-safe projection with the P5-04C canonical target context.

## Authorization boundary

P5-04D uses a protected Submission-read capability separate from public intake, private submitter status access, workflow transitions, ownership-verification decisions, canonical mutation, export, and publication.

Unauthorized callers receive no queue, detail, target context, contact data, ownership proof, or existence signal beyond the established bounded Admin failure contract.

## Queue contract

The protected queue may expose only bounded operational metadata required to select work:

- internal Submission ID and opaque public reference;
- target type and target ID;
- claimant role;
- requested scopes;
- requested verification method;
- workflow status and resolution;
- priority;
- Evidence count and protected-material presence booleans;
- submitted and updated timestamps;
- bounded pagination cursor.

The queue must not expose:

- plaintext contact email;
- encrypted contact value or email hash;
- authority statement;
- private proof URL;
- assisted-verifier reference value;
- status secret;
- arbitrary original payload.

## Detail contract

The protected detail response composes:

1. bounded Submission metadata;
2. the validated P5-04A review-safe Claim projection;
3. bounded workflow-event summaries;
4. the P5-04C canonical target snapshot and read-only signals;
5. explicit private-material presence flags without protected values.

The response is strictly schema validated before returning to the reviewer surface.

## Consistency and failure behavior

P5-04D fails closed when:

- the Submission is missing or is not a business Claim;
- the stored normalized payload is malformed or unsupported;
- target context cannot be loaded or validated;
- target identity no longer matches the stored Claim target;
- an authorization, repository, or response-validation failure occurs.

Errors remain bounded and do not expose SQL, configuration, private contact, proof, internal stack content, or another Submission.

## Read-only boundary

P5-04D does not:

- verify ownership or authority;
- send a verification challenge;
- grant editing rights;
- transition Submission workflow state;
- accept or reject proposed fields;
- create Evidence or a representative relationship;
- mutate canonical data;
- export or publish data.

Reviewer actions remain separately authorized later slices.

## Completion gate

An authorized reviewer can list eligible business Claim submissions and open one validated detail view containing the review-safe proposal and P5-04C target context, while unauthorized callers and malformed records fail closed and no state changes occur.

## Completion evidence

Pull request #209 merged to `main` as `ec2048faea97ce3efdc4710d42ea9cf83135d0b6` after successful Foundation validation, migration drift validation, staging review validation, and representative screenshot capture. Foundation validation covered formatting, lint, Astro and TypeScript checks, runtime schemas, migration history, unit and component tests, static build, accessibility, Phase 1 file checks, and staging artifact checks.

## Next

P5-04E adds exact-state guarded Claim review transitions and verification-request preparation without recording a verified representative relationship. Provider-specific verification execution and relationship decisions remain separate later slices.
