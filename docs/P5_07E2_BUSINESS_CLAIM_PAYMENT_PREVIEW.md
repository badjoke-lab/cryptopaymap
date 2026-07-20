# P5-07E2 Business Claim payment preview

**Implementation item:** P5-07E2  
**Status:** Active  
**Last updated:** 2026-07-20

## Purpose

P5-07E2 adds a protected, read-only preview for accepted Business Claim payment drafts after P5-07E1 has left the common application in `pending / blocked` state.

The preview consumes the exact durable `business_claim_fields_applied` payload. It does not accept a reconstructed proposal or client-selected registry identity.

## Classification

Each accepted draft preserves its original submitted index and is classified as exactly one of:

- `attach_existing_claim` — one exact compatible Claim exists and the tuple is new;
- `create_candidate_claim` — no compatible Claim exists and all canonical identities resolve;
- `needs_selection` — multiple compatible Claims exist and the preview refuses to guess;
- `already_present` — one compatible Claim already contains the exact Claim Asset tuple;
- `blocked` — required registry, route, processor, or target material is absent or ambiguous.

## Exact resolution

The preview resolves active Asset, Network, Payment Method, and payment-processor records. Processor checkout requires one exact active processor identity. Direct-wallet proposals cannot resolve to a processor.

Compatible Claims must belong to the exact Entity or Location target, remain undeleted, use the exact route and processor identity, and have status `candidate`, `confirmed`, or `stale`.

The returned `draftSetHash` binds the durable accepted proposal order, resolved registries, compatible Claim IDs, and readiness result for the next planning slice.

## Privacy and access

The GET route is protected by verified Admin identity plus the dedicated environment allow-list `CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PREVIEW_SUBJECTS`. Responses are `private, no-store`.

## Exclusions

P5-07E2 creates no Claim, Claim Asset, processor, registry, Source Record, provenance, Evidence, Verification Event, lifecycle transition, export, release, retention, migration, or deployment mutation.

## Next

P5-07E3 should persist one exact durable payment application plan. It must bind the E2 hash and explicit reviewer selections, and must still avoid canonical mutation. Entity and Location field-level provenance completion remains a separate owner.
