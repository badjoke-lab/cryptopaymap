# P5-07E1 Business Claim application order

**Implementation item:** P5-07E1  
**Status:** Active  
**Last updated:** 2026-07-20

## Purpose

P5-07E1 corrects the common application lifecycle ordering for Business Claims that have a durable `business_claim_fields_applied` event but still contain accepted private payment drafts.

The field event remains authoritative for reviewed Entity and Location decisions. It is not the final application receipt when accepted payment proposals have not been consumed by a separately guarded payment transaction.

## Ordering rule

```text
approved representative relationship
→ field decisions and private payment drafts
→ payment application pending, when accepted drafts exist
→ canonical payment transaction
→ common application committed
→ publication pending
```

A Business Claim with no accepted payment drafts may register as `committed / pending` using the field-application event receipt. A Business Claim with accepted payment drafts registers as `pending / blocked` with no final receipt.

## Durable source

The registration backend parses the strict private `business-claim-field-application-event-v1` payload and derives pending payment work from `projection.paymentApplication.acceptedProposals.length`. It fails closed for malformed or cross-Submission payloads. The client cannot supply this flag.

## Compatibility

P5-07E1 does not rewrite existing application rows or field events. Existing replay identities remain valid. A later E slice must reconcile any already-registered committed application whose exact field event still contains unconsumed payment drafts.

## Explicit exclusions

No Claim, Claim Asset, Entity, Location, registry, Source Record, provenance, Evidence, Verification Event, export, release, retention, migration, or deployment mutation is added.

## Next

P5-07E2 will add the protected exact payment-draft and canonical-target preview. It must resolve Claim ownership, registries, processors, and submitted ordering without guessing or exposing protected material.
