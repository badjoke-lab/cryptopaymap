# Admin Access configuration contract

**Status:** Active repository contract  
**Last updated:** 2026-07-30

## Purpose

CryptoPayMap administration uses a verified Cloudflare Access identity and separate allowlists for separate protected capabilities.

This document explains the identifier format expected by repository configuration keys. It does not contain live allowlist values, Access policy details, secrets, or production configuration.

## Verified human identity forms

The verified Access payload supplies a stable subject identifier in `sub`.

CryptoPayMap preserves two deterministic forms from the same verified identity:

```text
Access subject
<sub>

Normalized actor ID
cloudflare-access:<sub>
```

For example, for a hypothetical subject `reviewer-subject`:

```text
subject
reviewer-subject

actorId
cloudflare-access:reviewer-subject
```

The example above is illustrative only and is not a live configuration value.

Email addresses are metadata only. Email is not used as an authorization identifier.

## Verified service-token identity forms

A Cloudflare Access service-token JWT is accepted only after cryptographic signature, issuer, audience, expiration, and not-before validation. Its verified payload uses an empty `sub` and a bounded `common_name` ending in `.access`.

CryptoPayMap normalizes that verified service identity as:

```text
Access service-token common name
<common_name>.access

Subject-based allowlist value
service-token:<common_name>.access

Normalized actor ID
cloudflare-access:service-token:<common_name>.access
```

Service-token client IDs and client secrets are never authorization identifiers by themselves and are never committed. The `common_name` is used only after it is received inside a fully verified Access JWT.

An empty `sub` without a valid verified service-token `common_name` fails closed. A service-token identity containing a user email also fails closed.

## Configuration families

All allowlists are serialized JSON arrays of strings.

### Subject-based allowlists

These keys require the normalized verified subject value:

- `CPM_ADMIN_DASHBOARD_SUBJECTS`;
- `CPM_ADMIN_CANDIDATE_SUBJECTS`;
- `CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS`;
- `CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS`;
- `CPM_ADMIN_LOCATION_CORRECT_SUBJECTS`;
- `CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS`;
- `CPM_ADMIN_RECONFIRMATION_SUBJECTS`.

Human illustrative shape:

```json
["reviewer-subject"]
```

Service identity illustrative shape:

```json
["service-token:example-service-identity.access"]
```

### Actor-ID-based allowlists

These keys require the normalized actor ID derived from the verified identity:

- `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS`;
- `CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS`;
- `CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS`;
- `CPM_ADMIN_AUDIT_READ_ACTOR_IDS`.

Human illustrative shape:

```json
["cloudflare-access:reviewer-subject"]
```

Service identity illustrative shape:

```json
["cloudflare-access:service-token:example-service-identity.access"]
```

## One operator across multiple boundaries

An operator who needs capabilities from both configuration families must be represented in both formats in the relevant allowlists.

For the same verified human Access identity:

```text
subject-based key
reviewer-subject

actor-ID-based key
cloudflare-access:reviewer-subject
```

For the same verified service identity:

```text
subject-based key
service-token:example-service-identity.access

actor-ID-based key
cloudflare-access:service-token:example-service-identity.access
```

Do not copy an actor ID into a subject-based key. Do not remove the `service-token:` namespace from a verified service identity. Both mistakes fail authorization closed.

## Capability boundaries

The repository currently separates these capabilities:

| Operation | Capability | Identifier family |
|---|---|---|
| Dashboard read | `dashboard:read` | verified subject |
| Candidate queue/detail read | `candidate:read` | verified subject |
| Duplicate resolution | `candidate:resolve` | verified subject |
| Promotion and existing-target linking | `candidate:promote` | verified subject |
| Existing-Location correction | `location:correct` | verified subject |
| Evidence review | `evidence:review` | verified subject |
| Reconfirmation read | `claim:recheck` | verified subject |
| Reconfirmation expiration | `claim:expire` | verified subject authorization |
| Media review | `media:review` | normalized actor ID |
| Export release decision | `export:release` | normalized actor ID |
| Publication and restore mutation | `export:publish` | normalized actor ID |
| Audit history read | `audit:read` | normalized actor ID |

Possession of one capability does not imply another capability.

## Reconfirmation actor semantics

The repository intentionally distinguishes authorization identity from expiration event semantics.

A manual protected reconfirmation expiration request:

1. verifies an Access identity;
2. authorizes the verified subject against `CPM_ADMIN_RECONFIRMATION_SUBJECTS`;
3. preserves the normalized operator `actorId` in the mutation context;
4. records `actorType: system` for the expiration transition contract;
5. requires a UUID `Idempotency-Key`.

Scheduled expiration also uses the system expiration contract. The protected manual path remains attributable through the preserved operator-derived `actorId`.

P4-18D treats this as an explicit repository semantic boundary, not as evidence that a scheduled job and a human reviewer are the same authorization path.

## Idempotency contract

Every reachable protected mutation UI must generate a UUID request identifier and send it as:

```text
Idempotency-Key: <UUID>
```

The server validates the key before executing the mutation. Identical request replay and changed-content conflict behavior are operation-specific and remain covered by each mutation contract.

## Fail-closed rules

Administration authorization must fail closed when:

- the required allowlist is absent or empty;
- the serialized JSON value is malformed;
- the verified identity is missing;
- the identifier is present in the wrong representation;
- the verified identifier is not allowlisted;
- a service-token assertion lacks a valid verified `common_name`;
- a mutation requires an idempotency key and the key is missing or invalid.

## Environment verification boundary

Repository tests can verify parsing, deterministic identity normalization, policy matching, capability output, and fail-closed behavior.

Repository tests do not prove:

- the live Cloudflare Access application policy;
- the actual staging or production Access identity values;
- the actual subject-based or actor-ID-based allowlist values;
- environment-variable propagation to deployed Functions;
- live identity claims received from Cloudflare Access;
- capability separation for configured live identities.

Those checks require configured-environment execution. Live values and credentials must not be committed to the repository.


## Configured staging derived service authentication

Configured staging uses `CPM_ADMIN_AUTH_MODE=derived_staging_service`. Reviewer and publisher
HMAC keys are derived from the existing review seed with separate HKDF labels and synchronized
only to the Pages preview environment. Each request carries a role, timestamp, and HMAC signature;
the signature is verified with WebCrypto inside a bounded clock window. Unverified email headers,
missing signatures, stale signatures, and cross-role signatures fail closed. Production and the
default mode remain Cloudflare Access with issuer, audience, and signature validation. No raw key
or request signature may be retained in logs, receipts, artifacts, or repository files.
