# CryptoPayMap claim asset combinations

## Purpose

A claim asset row defines one explicit combination of:

```text
acceptance claim
asset
network
payment method
optional contract address
```

Asset symbols never imply a network. A multi-network asset such as USDT or USDC requires a separate row for every supported network and payment method.

## Canonical requirements

Every canonical combination requires an asset, network, and payment method. Incomplete observations belong in the private candidate and review layers rather than in `claim_assets`.

A publishable combination additionally requires active asset, network, and payment-method registry entries.

## Uniqueness

The same claim cannot contain the same asset, network, payment method, and contract address more than once. Rows without a contract address use a separate partial unique index so PostgreSQL null handling cannot create duplicates.

## Primary combination

At most one database row per claim may be marked primary. A publishable claim asset set requires exactly one primary row. Draft canonical work may temporarily contain no primary row, but confirmation and public export must reject that state.

Primary means preferred or prominently displayed. It does not imply that other combinations are unsupported.

## Route and method compatibility

The initial runtime rules are:

- `lightning_invoice` and `lightning_nfc` require the `lightning` network;
- `onchain` cannot use the `lightning` network;
- the `processor_checkout` payment method requires the `processor_checkout` route.

Other methods remain route-aware but are not over-constrained because a processor checkout may expose invoices, payment links, QR codes, or point-of-sale interfaces.

## Contract addresses

Contract addresses are optional and case-preserving. Input is trimmed, but CryptoPayMap does not globally lowercase addresses because address rules differ between networks.

A contract address must not be blank when present. Native assets and networks without a contract-address model use `null`.

## Confirmation boundary

P2-06 establishes explicit and eligible payment combinations. A confirmed claim still requires qualifying evidence, which is implemented separately in P2-07. Neither an active registry entry nor a processor capability proves merchant acceptance by itself.
