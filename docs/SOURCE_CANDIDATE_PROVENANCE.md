# CryptoPayMap source candidates and provenance

## Purpose

External observations enter CryptoPayMap as source records and private candidates. They do not become canonical records or public output automatically.

```text
source
  -> source record
  -> private candidate
  -> review and duplicate resolution
  -> canonical record
  -> provenance link
```

## Licenses and sources

A license stores a stable slug, name, version, URL, attribution requirement, share-alike flag, and notes. A source may declare a default license and attribution text. Attribution-required sources need attribution text before their data can be exported.

Licensing a source does not prove the accuracy of its payment-acceptance statements.

## Source records

A source record stores one fetched observation: source identity, external ID or URL or content hash, raw payload, observation and publication and fetch times, archive URL, and license reference.

At least one stable identity is required. External IDs are unique within one source. Raw payloads are operational records and are never serialized directly into public output.

## Source candidates

Candidate types are `physical_place`, `online_service`, `payment_processor`, `payment_program`, and `platform`.

Candidate statuses are `new`, `triaged`, `linked`, `promoted`, `duplicate`, `rejected`, and `archived`.

Candidates have no public visibility field. Linked and promoted candidates require a canonical target. Promoted physical-place candidates require a canonical location. Promoted non-physical candidates require a canonical entity.

Promotion creates or updates canonical records in a reviewed transaction. Changing only the candidate status does not publish anything.

## Candidate-to-source relationships

A candidate may link to source records as `origin`, `supporting`, `contradiction`, `update`, or `duplicate_signal`. This relationship does not assign Evidence A, B, or C by itself.

## Duplicate boundaries

Duplicate detection creates signals, not automatic decisions.

A shared source identity for candidates of the same type is a strong signal. The same normalized name is only a review signal because unrelated businesses can share names and one brand can have multiple locations.

Name normalization uses Unicode NFKC, lowercase comparison, punctuation and whitespace normalization, and a stable ampersand-to-word conversion. Original source spelling remains in the source record.

Duplicate groups are private review containers. A candidate marked duplicate must belong to a group. Resolving or dismissing a group requires an explicit resolution time. A group decision does not remove source records or provenance.

## Provenance links

A provenance link connects one source record to a canonical subject or field. Subject types are `entity`, `location`, `acceptance_claim`, `claim_asset`, `evidence`, `verification_event`, and `media`. Roles are `origin`, `verification`, `correction`, and `attribution`.

A null field path applies to the whole subject. A field path uses a lowercase dot-separated form such as `address_line` or `coordinates.latitude`.

The subject reference is polymorphic, so application code verifies that the target exists in the table implied by the subject type. The database enforces source-record and license foreign keys.

## Evidence integration

P2-09 converts evidence source-record and license identifiers into foreign keys. Evidence remains a reviewed interpretation of a source record rather than a copy of the raw payload.

## Deferred relationships

The import-batch identifier remains a private UUID boundary until importer work. Submission foreign keys are deferred until the submission phase. Media provenance becomes enforceable when the media table is added.

## Public boundary

Public exports exclude source candidates, duplicate groups, raw payloads, priorities, import-batch identifiers, unreviewed source records, duplicate signals, private evidence, and non-allowlisted provenance metadata.

Publication eligibility comes from canonical records, accepted evidence, verification history, and the export allowlist—not from source presence alone.
