# CryptoPayMap acceptance claim schema

## Purpose

An acceptance claim records a reviewable assertion that an entity accepts cryptocurrency within a defined scope. It is separate from the entity, physical location, asset, network, payment method, and evidence records.

## Claim scope

```text
location_specific
brand_region
brand_global
online_service
platform_capability
```

Only `location_specific` claims reference a physical location. Other scopes remain attached to the entity and may use claim-region rows where geographic applicability matters.

A platform capability does not by itself prove that any merchant or location accepts cryptocurrency.

## Acceptance scope

```text
all_checkout
selected_products
new_purchase_only
renewal_only
region_limited
temporary
```

Restrictions remain explicit public-safe text rather than being inferred from the scope value alone.

## Payment route

A direct-wallet route and a processor-checkout route remain separate. Processor checkout requires an explicit processor entity. Processor capability alone does not create an acceptance claim.

## Lifecycle

```text
candidate -> confirmed -> stale -> confirmed
                    \-> ended
candidate -> rejected
stale -> ended
```

Ended and rejected claims are terminal in the initial model. Reopening them requires a new reviewed claim rather than silently changing historical meaning.

## Confirmation requirements

A confirmed claim requires:

- non-empty payment instructions;
- first and most recent confirmation timestamps;
- correctly ordered confirmation timestamps.

A public claim additionally requires a confirmed, stale, or ended status, direct customer cryptocurrency payment, and explicit merchant acceptance.

An ended claim requires an ended timestamp. The public-safe ended reason remains optional because evidence and verification history are added separately.

## Merchant receipt

```text
crypto
fiat
crypto_or_fiat
not_publicly_confirmed
```

The value is never inferred from a processor's general capabilities.

## Regional applicability

Claim-region rows use an explicit include or exclude rule with a country code, optional region code, and optional notes. Regional rows do not replace the canonical claim scope.

## Deferred linked requirements

A fully publishable confirmed claim also requires an eligible asset-network-payment-method combination and qualifying evidence. Those cross-record requirements are implemented in P2-06 and P2-07 and cannot be enforced by the claim table alone.
