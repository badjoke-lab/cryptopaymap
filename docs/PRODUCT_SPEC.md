# CryptoPayMap product specification

**Status:** Active specification  
**Last updated:** 2026-06-25

## 1. Product definition

CryptoPayMap helps people find physical places and online services where they can actually pay from a crypto wallet.

A published listing is intended to explain:

- which asset is accepted;
- which network is used;
- whether the payment is made directly or through a processor;
- how the customer completes the payment;
- what evidence supports the listing;
- when the payment method was last confirmed;
- whether the payment method is currently confirmed, stale, or ended.

The core product message is:

> Where crypto actually works at checkout.

## 2. Problem statement

Existing crypto-payment directories often leave important questions unanswered:

- The accepted asset is unclear.
- The payment network is missing or inferred.
- A direct wallet payment is confused with a processor checkout.
- The customer does not know what to ask for or what to scan.
- Old or ended payment methods remain visible without warning.
- Brand-wide claims are applied to locations without location-level evidence.
- Indirect spending methods are mixed with merchant crypto acceptance.
- A source directory entry is treated as proof without further review.

CryptoPayMap addresses these problems by publishing reviewed, structured payment claims rather than unqualified "crypto accepted" labels.

## 3. Intended users

### 3.1 Customers

Customers use CryptoPayMap to:

- find nearby physical places that accept wallet-based crypto payments;
- search by asset, network, category, payment route, and status;
- understand the payment steps before visiting or purchasing;
- distinguish current, stale, and ended information;
- find online services with supported crypto checkout flows;
- report successful payments, failures, closures, or incorrect information.

### 3.2 Merchants and online-service operators

Businesses use CryptoPayMap to:

- suggest a new listing;
- correct an existing listing;
- state supported assets, networks, routes, and instructions;
- submit official evidence;
- claim a business record through a verification process;
- provide media with the required rights and permissions.

### 3.3 Data users

Data users may use public exports to:

- inspect confirmed payment claims;
- identify supported assets and networks;
- understand source and license boundaries;
- track public verification and status changes;
- build compatible research or discovery tools.

### 3.4 Payment providers and ecosystem partners

Payment processors, wallets, point-of-sale providers, and other partners may use the project to:

- clarify real payment routes;
- improve integration information;
- identify documentation or coverage gaps;
- participate in disclosed partnerships without affecting verification status.

## 4. Product scope

CryptoPayMap covers two primary discovery surfaces:

1. physical places;
2. online services.

These surfaces share verification principles but use different location and scope models.

## 5. Included payment cases

### 5.1 Physical places

A physical-place listing may cover:

- payment to a merchant-controlled wallet;
- Bitcoin on-chain payment;
- Bitcoin Lightning payment;
- a crypto-enabled point-of-sale terminal;
- a merchant-enabled processor checkout;
- a payment invoice or payment link used at checkout;
- a wallet QR, invoice QR, NFC flow, or another documented crypto-payment interaction.

The merchant or location must explicitly accept the payment route. Technical capability alone is not sufficient.

### 5.2 Online services

An online-service listing may cover:

- checkout payments for all products or plans;
- selected products or plans;
- new purchases only;
- renewals only;
- region-limited availability;
- temporary availability when clearly identified.

The service itself must provide the crypto checkout or invoice flow. A platform is not treated as accepting crypto merely because an individual seller accepts it independently.

### 5.3 Payment routes

CryptoPayMap distinguishes:

- `direct_wallet`: the customer sends crypto through a merchant-directed payment flow;
- `processor_checkout`: a payment processor presents or manages the crypto checkout.

A payment route is separate from the customer-facing payment method, such as an on-chain transfer, Lightning invoice, wallet QR, point-of-sale terminal, or hosted checkout.

## 6. Excluded payment cases

The main Places and Online Services directories do not treat the following as direct merchant crypto acceptance:

- crypto-funded Visa, Mastercard, or other general payment cards;
- gift cards or vouchers bought with crypto;
- indirect purchase services that resell gift cards or balances;
- general bill-payment intermediaries;
- crypto ATMs;
- exchanges or currency-conversion services;
- payments where crypto is first sold and the merchant receives an ordinary card or fiat payment unrelated to merchant crypto support;
- generic card-accepting merchants that have not enabled a crypto route themselves;
- vague "crypto friendly" claims without a reviewable payment path;
- source-directory or OpenStreetMap entries that have not met the publication requirements;
- marketplace-wide listings based only on individual seller arrangements;
- generic prepaid-balance funding that is not a purchase checkout.

Some indirect spending methods may be covered later in separate guides. They are not mixed into the core merchant-acceptance dataset.

## 7. Published listing contract

A confirmed published payment claim must identify:

- the relevant business or service;
- the physical location or online scope;
- the accepted asset;
- the payment network;
- the payment route;
- the payment method;
- usable "How to pay" instructions;
- supporting evidence;
- the last confirmation date;
- the current public status.

Where known and appropriate, a listing may also explain:

- the processor;
- product, plan, branch, or regional restrictions;
- whether the merchant receives crypto, fiat, either, or has not publicly confirmed the settlement choice;
- the verification history;
- public media and attribution.

The project does not infer a network merely from an asset symbol. Multi-network assets require an explicit network.

## 8. Public status model

### 8.1 Confirmed

A confirmed claim has met the publication requirements and has a documented payment path, evidence, and confirmation date.

### 8.2 Stale

A stale claim was previously confirmed but has exceeded its reconfirmation window or otherwise needs renewed verification. Stale records are not shown by default in the primary discovery experience.

### 8.3 Ended

An ended claim has sufficient evidence that the payment method, business, service, plan, or relevant availability has ended. Ended information may remain available as history but is not treated as a current payment option.

### 8.4 Candidate

Candidate records are non-public research or review items. They do not appear on the public map, in public search results, or in public coverage totals merely because they were imported or submitted.

## 9. Verification and publication principles

### 9.1 Evidence before publication

A source mention is a research lead, not automatic proof. Publication requires review under the verification policy.

### 9.2 Instructions are part of verification

A listing is not complete when it only says that crypto is accepted. The project must explain how the customer reaches or completes the payment flow.

### 9.3 Network clarity

Direct payment claims require a known network. Stablecoins and other multi-network assets must identify the supported network rather than relying on a default assumption.

### 9.4 History is retained

Reconfirmation, payment-method changes, stale transitions, and ended transitions are recorded rather than silently overwriting the past.

### 9.5 User submissions require review

Suggestions, payment reports, problem reports, owner claims, and photos do not update canonical public data automatically.

### 9.6 Sponsorship is separate from verification

Sponsorship, advertising, affiliate relationships, support, or payment do not create, improve, rank, or preserve confirmed status.

> Sponsored does not mean confirmed.

Sponsored or affiliate content must be labeled separately from verification evidence and status.

## 10. Brand and location boundaries

CryptoPayMap separates:

- the business or service entity;
- a physical location where relevant;
- the acceptance claim.

A brand-level claim is not automatically copied to every branch. Public location pins normally require location-specific confirmation unless an official all-location claim, a reliable location list, and manageable exceptions support broader coverage.

A payment platform's technical capability alone does not create a merchant listing.

## 11. Core public experiences

The intended public product includes:

- a physical-place map and synchronized result list;
- physical-place detail pages;
- online-service discovery and detail pages;
- asset, network, processor, category, country, and city discovery pages where appropriate;
- public dataset statistics and quality indicators;
- record-level updates;
- a capability-based public roadmap;
- a product changelog;
- contribution and reporting entry points;
- methodology, sources, licensing, privacy, terms, disclaimer, and contact information;
- public machine-readable data exports.

The detailed route and page contract is defined separately in the information architecture specification.

## 12. Experience principles

### 12.1 Mobile application quality

Although CryptoPayMap is delivered as a web product, the main discovery and contribution flows should behave like a high-quality mobile application.

The product should provide:

- coordinated map and list interactions;
- touch-friendly controls;
- a mobile bottom-sheet interaction model;
- restorable URL-backed search state;
- browser-back behavior that restores prior context;
- clear loading, empty, success, and error states;
- reduced-motion support;
- an accessible list alternative to map-only interaction.

### 12.2 Clear uncertainty

The interface must not present stale, ended, candidate, restricted, or unconfirmed information as equivalent to a current confirmed payment option.

### 12.3 Progressive detail

The discovery interface should expose the most useful decision information first, with evidence, history, restrictions, and deeper methodology available when needed.

### 12.4 Public-data integrity

Public pages and exports must be generated from reviewed public fields. Private review notes, submission contacts, private evidence, and unreviewed media must remain excluded.

## 13. Product information surfaces

The product distinguishes four types of public information:

- **Stats:** the current state and quality of the published dataset;
- **Updates:** changes to individual public records;
- **Roadmap:** capabilities being built, planned, or explored;
- **Changelog:** product, interface, policy, schema, and platform changes that have actually been released.

The public roadmap does not use private numeric targets or completion percentages. Record growth and dataset totals belong in Stats, not in roadmap promises.

## 14. Initial non-goals

The initial product does not require:

- public user accounts;
- unrestricted self-service editing of merchant records;
- automatic publication from external data sources;
- automatic publication from user submissions;
- merchant dashboards or multi-location management;
- a paid API;
- favorites, notifications, or full offline data access;
- dark mode;
- crypto-card, gift-card, or bill-payment directories inside the main acceptance map.

Some of these may be considered after the formal MVP.

## 15. Product integrity requirements

A release is not product-complete merely because pages render. The product must preserve:

- candidate/canonical separation;
- reviewed publication;
- evidence and confirmation dates;
- asset and network clarity;
- route and payment-method clarity;
- usable payment instructions;
- history and status transitions;
- privacy and media-rights boundaries;
- accessibility and mobile usability;
- validated public exports.

## 16. Related specifications

This document is the public product constitution. Detailed contracts are defined in separate specifications as they are added:

- `MVP_SCOPE.md`
- `INFORMATION_ARCHITECTURE.md`
- `DATA_MODEL.md`
- `VERIFICATION_POLICY.md`
- `SOURCE_AND_LICENSE_POLICY.md`
- `SUBMISSION_WORKFLOW.md`
- `MEDIA_POLICY.md`
- `TECH_ARCHITECTURE.md`
- `SECURITY_AND_PRIVACY.md`
- `OPERATIONS.md`
- `MIGRATION_AND_CUTOVER.md`
- `LAUNCH_CRITERIA.md`
- `ROADMAP.md`
