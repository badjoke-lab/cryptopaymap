# P5-04A Business claim contract and review-safe normalization

**Implementation item:** P5-04A  
**Status:** Completed through #203  
**Completed:** 2026-07-13

## Purpose

Define the first strict contract for business and service representatives to request a verified relationship with an existing CryptoPayMap Entity or Location.

A Claim Submission is a request for protected review. It does not verify the claimant, grant editing rights, accept Evidence, apply proposed fields, mutate a Claim, export data, or publish anything.

## Target boundary

P5-04A accepts only existing targets:

```text
entity
location
```

A target UUID is required. New-record proposals remain in Suggest. Claim-targeted Acceptance Claim changes remain normal payment-information proposals attached to an Entity or Location relationship request.

## Claimant roles

```text
owner
authorized_representative
authorized_employee
```

The common Submission relationship is fixed to:

```text
owner_or_authorized_representative
```

Other common relationship values cannot enter the business-claim contract.

## Requested scopes

Every Claim must include `representative_relationship` and may request:

```text
entity_profile
location_profile
payment_information
```

Entity targets cannot request Location-profile changes. Location targets cannot request Entity-profile changes. A proposed change is invalid unless its matching scope is requested.

## Verification methods

```text
official_domain_email
website_code
dns_txt
official_social
assisted_verification
```

Method-specific minimums are enforced:

- official-domain email requires a declared domain and an email on that domain or subdomain;
- website code requires an official HTTPS website URL;
- DNS TXT requires an official domain;
- official social verification requires an official social URL;
- assisted verification requires a bounded verifier reference.

P5-04A records the requested method only. It does not issue a code, query DNS, authenticate social accounts, contact a partner, or mark verification successful.

## Private values

The original private payload may contain:

- official contact email;
- protected proof URL;
- assisted verifier reference;
- authority statement.

The review-safe normalized projection never contains the contact email or proof URL. It exposes only bounded review signals such as method, declared public domain/URLs, and presence booleans.

## Proposed changes

The contract can carry:

- bounded Entity profile corrections;
- bounded Location practical-profile corrections;
- structured payment proposals using the existing Asset, Network, route, method, processor, How-to-pay, and restriction contract.

The contract deliberately excludes status, visibility, verification result, ownership status, canonical version, export, and publication fields.

## Completion evidence

P5-04A merged as #203 at main commit `60f68868fdb5a434be4b1ffa816c16efcaee6c71` after Foundation validation, Migration drift, Staging review validation, and representative screenshot capture all succeeded.

Focused validation proves method-specific requirements, Entity/Location scope consistency, payment proposal reuse, fixed representative relationship, and exclusion of official contact email and private proof URL values from the review-safe projection.

## Security and authority boundary

A successfully parsed or persisted Claim means only:

```text
private Submission accepted for review
```

It does not mean:

```text
identity verified
representative relationship approved
owner badge granted
canonical editing allowed
Evidence accepted
public record changed
```

## Next

P5-04B integrates the strict Claim parser and review-safe normalized projection with idempotent private Submission persistence. Verification state, adapters, protected reviewer entry, relationship decisions, expiration/revocation, public route, and configured audit remain separate later slices.
