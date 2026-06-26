# CryptoPayMap asset registry

## Purpose

The asset registry gives payment claims a stable asset identity instead of storing an unchecked symbol string. It is separate from the network registry: an asset record never implies the network used for payment.

## Canonical fields

Each asset has:

- an internal UUID in PostgreSQL;
- a stable public slug;
- a canonical symbol and name;
- recognized aliases;
- a primary type of `native`, `token`, or `other`;
- stablecoin and wrapped-asset flags;
- an optional default decimal count;
- an `active` or `deprecated` lifecycle state.

Symbols are not database identifiers and are not assumed to be globally unique. The slug is the stable canonical key.

## Decimal rule

`defaultDecimals` is descriptive registry metadata only. It must not be used to construct a transaction without the network-specific asset record introduced later in Phase 2. Multi-network assets such as USDT and USDC therefore begin with a null default.

## Initial records

The initial validated registry contains BTC, ETH, USDT, USDC, SOL, XRP, LTC, DOGE, BCH, and BNB.

Aliases are normalized for lookup, but the original alias text remains stored. Lookup can return multiple candidates; application code must not silently choose an asset when an alias is ambiguous.

## Public boundary

The registry is canonical configuration, not evidence that any merchant accepts an asset. A public payment claim must later reference both an asset and an explicit network and must independently satisfy verification requirements.

## Database boundary

`src/db/schema/assets.ts` defines the operational table. `src/registries/assets.ts` defines the reviewed initial registry used for validation and eventual database seeding. No database connection is required for repository checks.
