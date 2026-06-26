# CryptoPayMap entity and location schema

## Purpose

CryptoPayMap separates an organization or service identity from each physical place where it operates.

```text
Entity
  -> zero or more Locations
  -> Acceptance claims are added separately
```

An online service, payment processor, program, or platform may exist without a physical location. A merchant brand may own multiple location records.

## Entity

An entity represents a merchant, online service, payment processor, payment program, or platform. It stores the canonical name, optional public slug, official website, jurisdiction, lifecycle state, visibility, and audit timestamps.

Entity status describes the organization or service itself. It does not state whether cryptocurrency payment is currently available.

## Location

A location represents one physical place associated with an entity. It stores a stable public slug, canonical address fields, coordinates, branch-specific contact information, lifecycle state, visibility, and optional OpenStreetMap identity.

Location status is independent from acceptance-claim status. A location can remain active while one payment method ends, and an acceptance claim can become stale while the location remains open.

## Visibility

New canonical records default to hidden. Public visibility is an explicit reviewed decision and does not automatically follow from record creation or source import.

## Coordinates and source identity

Latitude must be between -90 and 90. Longitude must be between -180 and 180. An OpenStreetMap element type and ID must either both be present or both be absent. The pair is unique when present.

OpenStreetMap identity is provenance support, not the public canonical identity. Public routes use CryptoPayMap slugs.

## Acceptance boundary

Neither an entity nor a location proves cryptocurrency acceptance. Publication requires a separate reviewed acceptance claim with an explicit asset, network, payment route, payment method, evidence, instructions, and eligible status.
