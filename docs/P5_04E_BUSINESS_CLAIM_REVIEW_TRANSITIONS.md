# P5-04E Business Claim review transitions and verification-request preparation

**Implementation item:** P5-04E  
**Status:** Completed through #210  
**Started:** 2026-07-14  
**Completed:** 2026-07-14

## Purpose

Add separately authorized, exact-state guarded reviewer transitions for business Claim Submissions and prepare a bounded ownership-verification request without executing verification or creating a representative relationship.

## Authorization boundary

P5-04E uses mutation capabilities separate from:

- protected Submission read access;
- public Claim intake;
- private submitter status access;
- verification-provider execution;
- representative-relationship approval;
- canonical Entity, Location, Acceptance Claim, Evidence, Media, export, or publication mutation.

A caller authorized to read Claim details is not automatically authorized to transition them or prepare verification requests.

## Exact-state transition boundary

Each mutation requires:

- one existing business Claim Submission ID;
- the expected current workflow status;
- the expected Submission update timestamp;
- one allowed target workflow status;
- a bounded action and reason code;
- the authorized reviewer identity;
- an idempotency key;
- one transaction covering the Submission update and audit event.

Allowed operational review transitions:

```text
received → triage
triage → in_review
in_review → needs_information
in_review → on_hold
needs_information → in_review
on_hold → in_review
```

P5-04E does not resolve the Claim, approve authority, grant editing rights, or apply proposed changes.

## Verification-request preparation

For an `in_review` Claim, an authorized reviewer may prepare one bounded request matching the normalized method:

```text
official_domain_email
website_code
dns_txt
official_social
assisted_verification
```

Preparation creates only review-controlled metadata required for a later execution slice, including:

- Submission ID and target identity;
- verification method;
- normalized official domain, website, or social destination where applicable;
- opaque preparation identifier;
- creation and expiry timestamps;
- reviewer and audit metadata;
- protected-material presence flags.

Preparation does not return or copy plaintext contact email, private proof URL, assisted-verifier reference value, status secret, arbitrary original payload, or provider credentials into the reviewer response or audit summary.

## Consistency and failure behavior

P5-04E fails closed for:

- missing or non-Claim Submissions;
- malformed normalized Claim projections;
- target identity mismatch;
- unexpected workflow state or stale concurrency timestamp;
- unsupported transition or verification method;
- duplicate idempotency key with changed content;
- missing protected material required by the selected method;
- authorization, persistence, or response-validation failure.

A failed operation does not partially change workflow state, preparation state, or audit history.

## Non-effects

P5-04E does not:

- send email, DNS, website, social, or assisted-verification challenges;
- mark a challenge as passed or failed;
- verify ownership, authority, employment, or business control;
- create a representative relationship;
- grant editing rights;
- accept or reject proposed fields;
- mutate canonical records;
- create accepted Evidence;
- export or publish data;
- expose a public Claim route.

## Completion gate

An authorized reviewer can perform the allowed exact-state Claim workflow transitions and prepare one validated, idempotent verification request while stale, unauthorized, malformed, or conflicting operations fail atomically and no authority is granted.

## Completion evidence

Pull request #210 merged to `main` as `e1369049529055939dc955318e76a2a3005df7b4` after successful Foundation validation, migration drift validation, staging review validation, and representative screenshot capture. Foundation validation covered formatting, lint, Astro and TypeScript checks, runtime schemas, migration history, unit and component tests, static build, accessibility, Phase 1 file checks, and staging artifact checks.

## Next

P5-04F executes prepared verification attempts through bounded method adapters and records privacy-safe results. Representative-relationship decisions remain separately authorized after verification results exist.
