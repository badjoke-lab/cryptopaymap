# CryptoPayMap product specification

## Product definition

CryptoPayMap helps people find physical places and online services where they can pay directly from a cryptocurrency wallet. A public listing is intended to explain what can be paid with, which network is used, how the payment works, what evidence supports the claim, and when it was last confirmed.

The product is not a generic directory of crypto-friendly businesses. It is a verification-focused discovery service for actual checkout acceptance.

## Core outcome

A user should be able to answer these questions before attempting payment:

- Which asset is accepted?
- Which network is required?
- Is the payment sent directly or through a processor?
- What steps should the customer follow?
- What evidence supports the listing?
- When was it last confirmed?
- Is the claim confirmed, stale, or ended?

## Primary users

### Customers

Customers need reliable discovery, filtering, payment instructions, freshness, and reporting tools.

### Businesses and service operators

Businesses need a way to suggest or correct listings, describe payment methods, provide official evidence, claim their records, and request removal of incorrect or unauthorized material.

### Data users

Data users need structured public records, clear provenance, update dates, status, and licensing.

### Payment providers and wallets

Payment providers and wallets may use the service to describe supported checkout routes, improve integration accuracy, and support disclosed partnerships. Commercial relationships never determine verification status.

## Included scope

### Physical places

A physical place may be listed when the business itself accepts payment through one of these routes:

- direct wallet transfer;
- Bitcoin on-chain payment;
- Bitcoin Lightning payment;
- a business-enabled cryptocurrency point-of-sale flow;
- a processor checkout or invoice enabled by the business;
- a staff-presented payment QR or equivalent wallet interaction.

### Online services

An online service may be listed when its own checkout or invoice accepts cryptocurrency for a product or service. Examples include hosting, software, travel, communications, games, subscriptions, and e-commerce.

Restrictions such as selected products, new purchases only, renewals only, regional limits, or temporary availability must be shown.

## Excluded scope

The main Places and Online Services directories exclude:

- general-purpose crypto cards used over card networks;
- gift cards or vouchers purchased with cryptocurrency;
- bill-payment intermediaries;
- cryptocurrency ATMs, exchanges, or cash-conversion services;
- routes where cryptocurrency is sold and the merchant only receives an ordinary fiat payment;
- vague claims such as “crypto friendly” without a verified checkout route;
- unreviewed third-party directory or OpenStreetMap entries;
- marketplaces where only individual sellers independently accept cryptocurrency;
- generic prepaid balance deposits.

These indirect spending routes may be considered later as separately identified guides. They are not treated as merchant checkout acceptance.

## Public record requirements

A confirmed acceptance claim must identify:

- the business or online service;
- the applicable location or scope;
- the accepted asset;
- the network;
- the payment route;
- the payment method;
- usable payment instructions;
- supporting evidence;
- the last confirmation date.

A direct payment with an unknown network cannot be confirmed. Candidate records remain private and do not appear in public maps, search results, or public statistics.

## Record states

### Candidate

An internal review record. It is never public by default.

### Confirmed

The claim satisfies the published verification requirements and includes usable payment details.

### Stale

The claim was previously confirmed but has passed its reconfirmation window or has unresolved contradictory evidence. Stale records are excluded from default discovery results.

### Ended

Reliable evidence shows that acceptance, the business, the service, or the applicable payment option has ended. Ended records may remain available as history but do not appear in normal active discovery.

## Data model principles

The product separates:

- source candidates from reviewed canonical records;
- brands or entities from physical locations;
- acceptance claims from the businesses they describe;
- payment route from payment method;
- evidence from public summaries;
- user submissions from canonical data;
- private media from public media;
- current state from verification history.

## Discovery experience

### Places

Places provides a coordinated map and list experience. Confirmed places are shown by default. Users can filter by asset, network, category, payment route, and status. Moving the map does not silently replace results; the interface asks the user to search the visible area.

On mobile, the experience uses a map/list toggle and a bottom sheet. Map, list, filters, selected place, and browser-back behavior must remain synchronized.

### Online Services

Online Services provides a separate list and detail experience with filters for category, asset, network, processor, acceptance scope, region, and status.

### Detail pages

A place or service detail page shows payment instructions, assets, networks, route, processor where applicable, merchant-receipt information when known, evidence, freshness, status, history, reporting actions, and contribution actions.

## Contributions and corrections

The product supports these contribution paths:

- suggest a place or service;
- report a successful or failed payment;
- report incorrect or ended information;
- claim a business or service record;
- submit photos.

Submissions never update public canonical data automatically. They are stored separately, checked, reviewed, and applied only through an explicit decision. Partial approval, requests for more information, and time-bounded holds are supported.

## Media principles

Evidence images, owner-verification material, and public gallery candidates are separate purposes. Submission approval does not automatically approve media for public display.

Public media requires rights review, privacy review, metadata removal, and an approved public derivative. A listing may be published without an image.

## Public information surfaces

- `Stats` describes the current public dataset.
- `Updates` shows changes to public records.
- `Roadmap` shows future product capabilities.
- `Changelog` records released product, interface, policy, and data-contract changes.

These surfaces have distinct roles and must not be merged into one feed.

## Integrity principles

- Verification is independent from sponsorship, advertising, payment, or partnership status.
- Candidate data is private.
- User submissions are reviewed before canonical changes.
- Public exports exclude private review data and personal information.
- Sources, dates, status, and licensing remain traceable.
- The interface must provide a list-based alternative to map-only interaction.

## Product direction

The initial product establishes verified discovery, reviewable evidence, structured public data, record history, contribution workflows, and an application-quality mobile web experience. Later capabilities may include business management, broader data access, notifications, saved places, multilingual support, and separately labeled indirect-spending guides.
