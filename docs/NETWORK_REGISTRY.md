# CryptoPayMap network registry

## Purpose

The network registry gives payment claims a stable network identity. It is separate from the asset registry, so application code must never infer a network from an asset symbol.

## Fields

Each network has an internal UUID, stable public slug, canonical name, aliases, lifecycle status, and timestamps. The slug is the canonical key. Aliases support import and review but are not public identifiers.

## Initial records

The initial registry contains Bitcoin, Lightning Network, Ethereum, Base, Tron, Solana, XRP Ledger, Polygon PoS, Arbitrum One, BNB Smart Chain, Avalanche C-Chain, Litecoin, Dogecoin, and Bitcoin Cash.

## Alias rules

```text
LN -> lightning
Bitcoin mainnet -> bitcoin
TRC20 -> tron
ERC20 -> ethereum
BSC -> bnb-smart-chain
```

Lookup returns candidates and must not silently choose an ambiguous match.

## Asset boundary

An asset never supplies a default network. Multi-network assets such as USDT and USDC require an explicit network on each acceptance claim. Network-specific asset details are added later in Phase 2.

## Publication boundary

A registered network is not evidence that a merchant accepts payments on that network. Publication still requires a reviewed claim and evidence.
