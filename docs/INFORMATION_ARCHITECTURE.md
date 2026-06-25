# CryptoPayMap information architecture

## Purpose

This document defines the public route structure, navigation, page responsibilities, primary user journeys, URL-state behavior, indexing rules, and legacy-route handling for CryptoPayMap.

It is a product information-architecture contract. Data schemas, verification evidence classes, security implementation, and infrastructure details are defined in separate documents.

## Information-architecture principles

1. **Discovery comes first.** A user should reach usable payment information with the fewest practical steps.
2. **Physical places and online services remain distinct.** They share verification principles but use different discovery and scope models.
3. **Current data, record changes, future work, and released product changes remain separate.** Stats, Updates, Roadmap, and Changelog are different products surfaces.
4. **Candidate records are never public navigation destinations.** Only publishable canonical records create public routes.
5. **Map interaction always has a list alternative.** No essential information is map-only.
6. **Mobile routes preserve browser behavior.** Back navigation, shared URLs, filters, and selected records must remain understandable outside a native application shell.
7. **Legacy routes resolve deliberately.** Old links redirect to a canonical route or show a specific migration explanation instead of an unexplained raw 404.
8. **Private workflows are isolated.** Administration, private submission status, private evidence, and review data are not part of public discovery or indexing.

---

## 1. Global navigation

### 1.1 Desktop primary navigation

The persistent desktop header uses this order:

1. **Places** — `/places`
2. **Online Services** — `/online`
3. **Stats** — `/stats`
4. **Updates** — `/updates`
5. **Contribute** — `/contribute`
6. **Support** — `/support`

The CryptoPayMap logo links to `/`.

Roadmap and Changelog are important public pages, but they do not replace discovery actions in the primary header. They are linked from Home, the footer, and relevant update or release surfaces.

### 1.2 Mobile global navigation

The mobile application shell uses five primary destinations:

1. **Places**
2. **Online**
3. **Updates**
4. **Contribute**
5. **More**

`More` exposes:

- Stats
- Roadmap
- Changelog
- About
- Methodology
- Data
- Support
- Partners
- Contact

The Places screen also has a dedicated List / Map control. This control changes the Places presentation mode and is not a replacement for global navigation.

### 1.3 Footer navigation

The footer groups links by purpose.

#### Discover

- Places
- Online Services
- Browse by asset
- Browse by network
- Browse by category
- Browse by country or city

#### Project

- About
- Methodology
- Stats
- Updates
- Roadmap
- Changelog

#### Contribute

- Contribute overview
- Suggest a place or service
- Report a payment
- Report a problem
- Claim a business
- Add photos

#### Data and trust

- Data
- Sources and Licenses
- Privacy
- Terms
- Disclaimer
- Contact

#### Sustainability

- Support
- Partners

---

## 2. Canonical public routes

### 2.1 Home and discovery

| Route | Page | Responsibility |
|---|---|---|
| `/` | Home | Explain the product and route first-time users to Places, Online Services, recent verified changes, contribution, and trust information. |
| `/places` | Places | Coordinated physical-place map and list discovery. |
| `/place/{slug}` | Place detail | Complete public record for one physical place. |
| `/online` | Online Services | Searchable and filterable online-service discovery. |
| `/service/{slug}` | Service detail | Complete public record for one online service. |

### 2.2 Public dataset and change surfaces

| Route | Page | Responsibility |
|---|---|---|
| `/stats` | Stats | Describe the current published dataset and its coverage and quality. |
| `/updates` | Updates | Show changes to public acceptance records. |
| `/roadmap` | Product Roadmap | Show planned product capabilities using Now, Next, Later, and Exploring. |
| `/changelog` | Product Changelog | Record released product, interface, policy, and public data-contract changes. |

These routes must not be merged into a single activity feed.

### 2.3 Generated discovery pages

| Route | Page |
|---|---|
| `/assets/{asset}` | Confirmed acceptance for one canonical asset slug. |
| `/networks/{network}` | Confirmed acceptance for one canonical network slug. |
| `/processors/{processor}` | Confirmed processor-checkout records for one processor slug. |
| `/categories/{category}` | Confirmed records in one category. |
| `/countries/{iso2}` | Confirmed records in one country. |
| `/cities/{iso2}/{city-slug}` | Confirmed physical places in one city. |

Generated pages are created only from canonical registry values and public canonical records.

### 2.4 Contribution routes

| Route | Page | Responsibility |
|---|---|---|
| `/contribute` | Contribution overview | Explain contribution types, review, privacy, and expected outcomes. |
| `/suggest` | Suggest | Suggest a new physical place or online service. |
| `/payment-report` | I paid here | Report a successful or failed payment, normally with a preselected record. |
| `/report` | Report a problem | Report closure, ended acceptance, wrong instructions, wrong address, duplicate records, image-rights issues, privacy issues, or other problems. |
| `/claim` | Claim | Start business or service ownership verification. |
| `/photos` | Add photos | Submit rights-cleared public-gallery candidates for an existing record. |
| `/submission-status/{public-id}` | Private submission status | Show a submission state only after separate secret-token validation. |

`/submission-status/{public-id}` is not a public record page. It is always `noindex`, is excluded from navigation and sitemaps, and does not reveal useful submission information without its secret token. Token transport and storage are defined by the security architecture.

### 2.5 Trust, data, and legal routes

| Route | Page | Responsibility |
|---|---|---|
| `/about` | About | Explain what CryptoPayMap is and how its public surfaces relate. |
| `/methodology` | Methodology | Explain public inclusion, verification, freshness, and state concepts. |
| `/sources-and-licenses` | Sources and Licenses | Explain source categories, attribution, and public licensing boundaries. |
| `/data` | Data | Describe public data files, schemas, update times, and allowed reuse. |
| `/privacy` | Privacy | Explain collection, use, retention, and deletion of personal data. |
| `/terms` | Terms | Define public-site and contribution terms. |
| `/disclaimer` | Disclaimer | Explain limitations, freshness, and non-advisory status. |
| `/contact` | Contact | Provide the public contact path. |

### 2.6 Sustainability and partnership routes

| Route | Page | Responsibility |
|---|---|---|
| `/support` | Support | Explain voluntary support methods and the rule that support does not affect listing or verification. |
| `/partners` | Partners | Explain public partnership categories, disclosure, and verification independence. |

---

## 3. Administration routes

Administration routes are protected and excluded from public indexing and public navigation.

| Route | Responsibility |
|---|---|
| `/admin` | Dashboard and operational summary. |
| `/admin/review` | Unified review entry point. |
| `/admin/candidates` | Candidate queue and candidate detail. |
| `/admin/claims` | Acceptance-claim editing and state review. |
| `/admin/evidence` | Evidence review. |
| `/admin/rechecks` | Reconfirmation queue. |
| `/admin/submissions` | Public submission queue and submission detail. |
| `/admin/media` | Evidence, ownership-proof, and public-media review. |
| `/admin/exports` | Public export status and controlled publication. |
| `/admin/audit` | Audit-history search and review. |

Nested record routes may use stable internal identifiers, for example `/admin/candidates/{id}`. Internal identifiers must not become public slugs or leak private record existence through public endpoints.

---

## 4. Machine-readable and discovery files

### 4.1 Public data routes

Planned canonical files include:

- `/data/locations-osm.json`
- `/data/acceptance-claims.json`
- `/data/place-pins.json`
- `/data/places.json`
- `/data/places.geojson`
- `/data/online-services.json`
- `/data/stats.json`
- `/data/updates.json`
- `/data/assets.json`
- `/data/networks.json`
- `/data/manifest.json`
- `/version.json`

Candidate data, private evidence, submission contacts, ownership proof, internal notes, and review queues are never exposed through these routes.

### 4.2 Search and crawler files

- `/sitemap.xml`
- `/robots.txt`

Future sitemap splitting is permitted when route volume requires it.

---

## 5. Home information hierarchy

Home is an orientation and routing page, not a replacement for Places or Online Services.

Recommended order:

1. Product statement and primary search entry.
2. Places and Online Services entry actions.
3. Published physical-place and online-service counts.
4. Recently confirmed or reconfirmed records.
5. Browse by asset.
6. Browse by network.
7. Browse by region.
8. Online-service highlights.
9. Short methodology explanation.
10. Contribution entry.
11. Roadmap and Changelog entry.
12. Small Support entry.

Home never displays candidate counts, internal queues, or unreviewed totals.

---

## 6. Places information architecture

### 6.1 Desktop layout

Desktop Places uses a coordinated two-panel application layout:

- map: approximately 60%;
- list or selected-record panel: approximately 40%.

The top control area includes:

- search;
- asset;
- network;
- category;
- payment route;
- status;
- optional current-location action.

Confirmed records are shown by default. Stale is off by default. Candidate and rejected records never appear. Ended records are excluded from normal active discovery.

### 6.2 Map movement

Moving or zooming the map does not silently replace the current result set. The interface presents a **Search this area** action.

This prevents users from losing a reviewed result context while exploring the map.

### 6.3 Selection behavior

Selecting a map marker:

1. updates the selected place;
2. highlights or scrolls the corresponding list item;
3. opens the selected-place panel or bottom sheet;
4. updates restorable URL state.

Selecting a list result:

1. updates the selected place;
2. moves or focuses the map as appropriate;
3. highlights the marker;
4. opens the selected-place panel or bottom sheet;
5. updates restorable URL state.

### 6.4 Mobile Places

Mobile Places is an application shell containing:

- compact search and filters;
- Map / List presentation control;
- map or list surface;
- selected-place bottom sheet;
- global mobile navigation.

The bottom sheet supports:

- closed;
- peek;
- expanded.

Peek shows a minimal identity, accepted asset summary, and last-confirmed date. Expanded shows payment instructions, network, route, detail navigation, payment reporting, and problem reporting.

### 6.5 Restorable Places state

Shareable or restorable state may include:

- search query;
- asset;
- network;
- category;
- payment route;
- public status filter;
- map/list mode;
- map center and zoom;
- selected public place slug.

Exact browser geolocation is not persisted as a user history value. A map viewport is presentation state, not proof of a user's location.

Query-parameter variations use the canonical `/places` URL for search indexing.

### 6.6 Empty, loading, and error states

A zero-result state does not reveal candidates. It offers:

- clear filters;
- widen the map area;
- include stale records;
- browse Online Services;
- suggest a place.

Loading keeps the existing map or list context visible where possible and uses skeleton or progressive states. Errors preserve recoverable filters and provide retry or fallback navigation.

---

## 7. Place detail information hierarchy

Canonical route:

`/place/{slug}`

Recommended order:

1. cover or category placeholder;
2. name, category, address, and status;
3. accepted assets and networks;
4. payment route, payment method, and processor where applicable;
5. How to pay;
6. merchant-receipt information when publicly confirmed;
7. restrictions;
8. last confirmation and next review information suitable for public display;
9. evidence;
10. verification and change history;
11. gallery;
12. I paid here;
13. Report;
14. Claim;
15. Add photos;
16. view nearby places on the map.

A stale or ended detail page clearly displays its state before payment instructions. Historical content must not visually resemble a currently confirmed recommendation.

---

## 8. Online Services information architecture

### 8.1 List

Canonical route:

`/online`

Filters may include:

- category;
- asset;
- network;
- processor;
- acceptance scope;
- region;
- status.

Online-service filters use URL-backed state and canonicalize indexing to `/online` unless a dedicated generated landing page exists.

### 8.2 Service detail

Canonical route:

`/service/{slug}`

Recommended order:

1. service identity and official website;
2. category and public status;
3. assets and networks;
4. payment route, payment method, and processor;
5. How to pay;
6. applicable products or plans;
7. new-purchase, renewal, regional, or temporary restrictions;
8. last confirmation;
9. evidence;
10. verification and change history;
11. Report;
12. Claim.

---

## 9. Stats, Updates, Roadmap, and Changelog

### 9.1 Stats

`/stats` answers: **What does the current published dataset contain, and how complete or fresh is it?**

It may include public counts, route distribution, asset and network distribution, and verification-quality metrics. It never includes private candidate or review-queue counts.

### 9.2 Updates

`/updates` answers: **What changed in public acceptance records?**

Examples:

- newly confirmed;
- reconfirmed;
- payment method changed;
- marked stale;
- ended;
- new online service.

### 9.3 Roadmap

`/roadmap` answers: **What product capabilities are being developed or considered?**

It uses:

- Now;
- Next;
- Later;
- Exploring.

It does not publish private numeric targets, pull-request counts, commercial targets, or private deadlines.

### 9.4 Changelog

`/changelog` answers: **What product, interface, policy, or public data-contract changes have been released?**

Routine record additions and reconfirmations belong in Updates, not Changelog.

---

## 10. Contribution journeys

### 10.1 Contribution overview

`/contribute` explains:

- which contribution type to choose;
- what information is useful;
- that submission does not guarantee publication;
- that all canonical changes require review;
- how private contact and evidence are handled;
- how a submitter follows the result.

### 10.2 Suggest journey

`/suggest`

1. choose physical place or online service;
2. identify the business or service;
3. provide location or official URL;
4. describe asset, network, route, method, and How to pay;
5. provide evidence and observation date;
6. disclose relationship to the business;
7. optionally attach permitted media;
8. review and submit;
9. receive reference and secret status access.

An unknown network may be submitted for review but cannot become a confirmed direct-payment claim.

### 10.3 Payment-report journey

`/payment-report`

The route should normally be opened from a place or service detail page with the target preselected.

The user reports:

- successful or failed payment;
- date;
- asset;
- network;
- route;
- method;
- observed steps;
- optional evidence.

The form does not require payment amount, name, or wallet address.

### 10.4 Problem-report journey

`/report`

The route should normally be opened with the public target preselected. It supports closure, ended acceptance, failure, wrong payment details, wrong location, duplicate record, image-rights concern, privacy concern, and other corrections.

### 10.5 Claim journey

`/claim`

1. identify the business or service;
2. identify the claimant's role;
3. select affected records or locations;
4. provide official payment details and corrections;
5. choose an available ownership-verification method;
6. submit private verification material;
7. follow the private status route.

A submitted claim does not immediately change ownership or public data.

### 10.6 Photos journey

`/photos`

The user selects an existing target, image role, capture date, rights basis, public-display permission, and description. Images remain private until rights and privacy review succeeds.

---

## 11. Primary user journeys

### 11.1 First-time customer

`Home → Places or Online Services → filter or search → detail → How to pay and freshness → attempt payment → optional payment report`

### 11.2 Nearby customer

`Places → optional browser geolocation → Search this area → select marker or list result → bottom sheet → detail`

The browser's location permission is requested only after a user action and is not required for manual discovery.

### 11.3 Online-service customer

`Online Services → filter → service detail → restrictions and How to pay → official service`

### 11.4 Correcting a listing

`Place or service detail → Report → prefilled target → evidence or explanation → private status`

### 11.5 Business owner

`Place or service detail → Claim → ownership verification → review → private status → approved canonical update`

### 11.6 Data user

`Data → manifest or public files → source and license documentation → version information`

### 11.7 Following project development

`Roadmap → current capability milestone → released Changelog entry`

Record-level changes remain in Updates.

---

## 12. URL conventions

- Public paths use lowercase ASCII slugs.
- Words are separated with hyphens.
- Asset and network routes use canonical registry slugs.
- Country paths use lowercase ISO 3166-1 alpha-2 values.
- Public detail slugs are stable and human-readable.
- A name change does not automatically require a slug change.
- Internal database IDs do not appear in canonical public URLs.
- One trailing-slash policy must be applied consistently by the application and canonical tags.
- Filter and viewport query parameters do not create separate indexable pages.
- Public pages set canonical URLs explicitly.

---

## 13. Indexing and sitemap rules

### 13.1 Indexable by default

- Home;
- Places and Online Services roots;
- public place and service details;
- Stats, Updates, Roadmap, and Changelog;
- trust, data, legal, support, and partner pages;
- eligible generated discovery pages.

### 13.2 Generated-page threshold

Asset, network, processor, category, country, and city pages require at least three confirmed active public records to be indexable.

Below the threshold, the route may still provide useful navigation but uses `noindex` and is excluded from the sitemap.

### 13.3 Always excluded from indexing

- administration routes;
- private submission-status routes;
- private or signed media routes;
- candidate records;
- internal review or export endpoints;
- filter-only query variations;
- unresolved legacy-ID migration messages.

### 13.4 Stale and ended details

A stale or ended canonical detail may remain indexable when it provides substantive public evidence and history. It must clearly state its current status and remain excluded from default active discovery.

---

## 14. Legacy routes and redirects

Permanent redirects are used when a stable canonical replacement exists.

| Legacy route | Canonical destination |
|---|---|
| `/map` | `/places` |
| `/discover` | `/updates` |
| `/donate` | `/support` |
| `/submit` | `/contribute` |
| `/submit/owner` | `/claim` |
| `/submit/community` | `/suggest` |
| `/submit/report` | `/report` |
| `/accepts/BTC` | `/assets/btc` |
| `/city/tokyo` | `/cities/jp/tokyo` |

Equivalent asset and city routes should be mapped through canonical registry and migration data rather than hard-coded only for the examples above.

### 14.1 Legacy place identifiers

Legacy place URLs, including identifier-shaped paths such as an OpenStreetMap object reference, are resolved through the legacy-ID mapping layer.

- mapped identifier: permanent redirect to `/place/{slug}`;
- known but not yet migrated identifier: show a specific migration explanation and a Places search action;
- invalid or unrelated identifier: normal not-found response.

Migration explanations use `noindex` and are not treated as public place records.

### 14.2 Legacy fragments

URL fragments are not sent to the server and therefore cannot use an ordinary HTTP redirect.

For legacy links such as:

- `/about#privacy`
- `/about#disclaimer`

`/about` preserves compatible fragment targets or a small client-side handoff to the canonical standalone pages:

- `/privacy`
- `/disclaimer`

The standalone pages remain the canonical destinations.

---

## 15. Not-found and migration behavior

A normal 404 page provides:

- search Places;
- browse Online Services;
- return Home;
- report a broken link where appropriate.

A known legacy record that has not yet been mapped does not use the generic 404. It uses a migration-specific message without exposing candidate or private migration details.

---

## 16. Accessibility and interaction requirements

Information architecture must remain usable without map interaction or pointer gestures.

- Every map result has a list equivalent.
- Headings and landmarks communicate page hierarchy.
- Focus moves predictably when drawers, dialogs, and bottom sheets open.
- Browser back returns users to the prior discovery context.
- Status is communicated with text, not color alone.
- Contribution steps preserve entered data across recoverable validation errors.
- Reduced-motion preferences do not remove required state feedback.

Detailed component and conformance requirements are defined in the technical and security architecture.

---

## 17. Route ownership and later changes

Changes to canonical routes require:

1. a documented reason;
2. redirect impact review;
3. sitemap and canonical-tag review;
4. public data-link review;
5. contribution deep-link review;
6. Changelog impact review when the route has already been released.

Routes are not renamed solely for stylistic preference once publicly released.
