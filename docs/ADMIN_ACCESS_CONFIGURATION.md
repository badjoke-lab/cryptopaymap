# Admin Access configuration contract

**Status:** Active repository contract  
**Last updated:** 2026-07-08

## Purpose

CryptoPayMap administration uses a verified Cloudflare Access identity and separate allowlists for separate protected capabilities.

This document explains the identifier format expected by repository configuration keys. It does not contain live allowlist values, Access policy details, secrets, or production configuration.

## Verified identity forms

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

## Configuration families

All allowlists are serialized JSON arrays of strings.

### Subject-based allowlists

These keys require the raw verified Access `sub` value:

- `CPM_ADMIN_DASHBOARD_SUBJECTS`;
- `CPM_ADMIN_CANDIDATE_SUBJECTS`;
- `CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS`;
- `CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS`;
- `CPM_ADMIN_LOCATION_CORRECT_SUBJECTS`;
- `CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS`;
- `CPM_ADMIN_RECONFIRMATION_SUBJECTS`.

Illustrative shape:

```json
["reviewer-subject"]
```

### Actor-ID-based allowlists

These keys require the normalized actor ID derived from the verified subject:

- `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS`;
- `CPM_ADMIN_EXPORT_RELEASE_ACTOR_IDS`;
- `CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS`;
- `CPM_ADMIN_AUDIT_READ_ACTOR_IDS`.

Illustrative shape:

```json
["cloudflare-access:reviewer-subject"]
```

## One operator across multiple boundaries

An operator who needs capabilities from both configuration families must be represented in both formats in the relevant allowlists.

For the same verified Access identity:

```text
subject-based key
reviewer-subject

actor-ID-based key
cloudflare-access:reviewer-subject
```

Do not copy the normalized actor ID into a subject-based key. Do not copy the raw subject into an actor-ID-based key. Both mistakes fail authorization closed.

## Capability boundaries

The repository currently separates these capabilities:

| Operation | Capability | Identifier family |
|---|---|---|
| Dashboard read | `dashboard:read` | Access subject |
| Candidate queue/detail read | `candidate:read` | Access subject |
| Duplicate resolution | `candidate:resolve` | Access subject |
| Promotion and existing-target linking | `candidate:promote` | Access subject |
| Existing-Location correction | `location:correct` | Access subject |
| Evidence review | `evidence:review` | Access subject |
| Reconfirmation read | `claim:recheck` | Access subject |
| Reconfirmation expiration | `claim:expire` | Access subject authorization |
| Media review | `media:review` | normalized actor ID |
| Export release decision | `export:release` | normalized actor ID |
| Publication and restore mutation | `export:publish` | normalized actor ID |
| Audit history read | `audit:read` | normalized actor ID |

Possession of one capability does not imply another capability.

## Reconfirmation actor semantics

The repository intentionally distinguishes authorization identity from expiration event semantics.

A manual protected reconfirmation expiration request:

1. verifies a human Access identity;
2. authorizes the raw Access subject against `CPM_ADMIN_RECONFIRMATION_SUBJECTS`;
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
- a mutation requires an idempotency key and the key is missing or invalid.

## Environment verification boundary

Repository tests can verify parsing, deterministic identity normalization, policy matching, capability output, and fail-closed behavior.

Repository tests do not prove:

- the live Cloudflare Access application policy;
- the actual production Access subject values;
- the actual production actor-ID allowlist values;
- environment-variable propagation to deployed Functions;
- live identity claims received from Cloudflare Access.

Those checks must be classified explicitly during P4-18D/P4-18E environment verification. Live values must not be committed to the repository.
