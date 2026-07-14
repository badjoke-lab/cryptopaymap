# P5-04F Business Claim verification execution and result recording

**Implementation item:** P5-04F  
**Status:** Active  
**Started:** 2026-07-14

## Purpose

Execute one unexpired P5-04E verification preparation through a bounded method adapter and record a privacy-safe result without creating a representative relationship or granting editing rights.

## Authorization boundary

P5-04F must use a dedicated verification-execution capability separate from:

- protected Submission read access;
- ordinary Claim workflow transitions;
- verification-request preparation;
- representative-relationship decisions;
- canonical mutation, export, and publication.

Preparation authorization does not imply execution authorization.

## Supported methods

The execution boundary supports the five normalized request methods:

```text
official_domain_email
website_code
dns_txt
official_social
assisted_verification
```

Each method is implemented behind a strict adapter contract. Provider credentials, decrypted contact values, private proof locations, and assisted-verifier references remain inside the method-specific protected adapter boundary and are never included in the public or general reviewer result.

## Execution request

One execution requires:

- one business Claim Submission ID;
- one existing P5-04E preparation event ID;
- one execution request UUID;
- the expected prepared method;
- the expected preparation expiry timestamp;
- the authorized executor identity;
- a bounded execution timestamp.

The service must confirm that:

- the Submission still exists and is a business Claim;
- its workflow status remains `in_review`;
- the preparation event belongs to the same Submission;
- the preparation event is valid, unexpired, and method-compatible;
- no conflicting result exists for the same execution UUID.

## Adapter result

Method adapters return a bounded result only:

```text
passed
failed
inconclusive
provider_error
```

The result may include:

- bounded result code;
- adapter identifier and version;
- execution and observation timestamps;
- expiry status;
- retryable boolean;
- privacy-safe summary;
- opaque provider reference hash when required for audit correlation.

The result must not include:

- plaintext contact email;
- private proof URL or content;
- assisted-verifier reference value;
- verification challenge secret;
- status secret;
- provider credential;
- raw provider response;
- arbitrary original Submission payload.

## Persistence and idempotency

Execution writes one private audit event atomically.

The event must bind:

- execution UUID;
- preparation event ID;
- Submission ID;
- method;
- bounded outcome;
- privacy-safe summary;
- adapter metadata;
- executor identity;
- execution timestamp.

An identical retry replays the stored result. Reuse of the same execution UUID with changed Submission, preparation, method, or input fingerprint fails as an idempotency conflict.

## Failure behavior

P5-04F fails closed for:

- unauthorized execution;
- missing or malformed preparation events;
- expired preparations;
- method mismatch;
- Submission or target mismatch;
- non-`in_review` workflow state;
- unavailable protected material;
- malformed adapter output;
- persistence conflict;
- private-value leakage in result material.

Provider failure is recorded only as the bounded `provider_error` outcome when the adapter completed safely. Internal exceptions and malformed output do not create a result event.

## Non-effects

P5-04F does not:

- approve ownership, authority, employment, or business control;
- create a representative relationship;
- grant editing rights;
- transition the Submission to a terminal state;
- accept or reject proposed fields;
- create accepted public Evidence;
- mutate Entity, Location, Acceptance Claim, or Media records;
- export or publish data;
- expose a public Claim route.

## Completion gate

An authorized executor can run each supported prepared method through a bounded adapter and obtain one validated, idempotent, privacy-safe result while expired, mismatched, unauthorized, malformed, or conflicting executions fail without partial persistence or authority changes.

## Next

P5-04G will convert reviewed verification results into separately authorized representative-relationship decisions. Canonical proposal application remains a later independent slice.
