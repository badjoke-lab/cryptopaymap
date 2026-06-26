# CryptoPayMap payment registries

## Purpose

Payment route and payment method are separate concepts.

A route describes who presents and manages the payment path:

```text
direct_wallet
processor_checkout
```

A method describes the concrete customer interaction:

```text
onchain
lightning_invoice
lightning_nfc
wallet_qr
processor_checkout
pos_terminal
invoice
payment_link
```

## Separation rule

The application must not treat a method as proof of a route. A point-of-sale terminal, invoice, payment link, or QR interaction may be implemented differently by different merchants. The acceptance claim records the route, while its asset entry records the concrete payment method.

## Canonical fields

Routes and methods use internal UUIDs, stable slugs, canonical names, descriptions, lifecycle status, and timestamps. Methods also preserve aliases used by source material.

## Lookup rule

Lookup normalizes case, spacing, underscores, periods, and hyphens. It returns candidates and does not silently choose an ambiguous match. Original source wording remains part of later candidate and provenance records.

## Publication boundary

A registered route or method is configuration, not evidence that a merchant accepts cryptocurrency. Public output still requires an eligible canonical acceptance claim with an explicit asset, network, route, method, and reviewed evidence.
