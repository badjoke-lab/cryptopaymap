# CryptoPayMap technical architecture

## Purpose

This document defines the technical boundaries for CryptoPayMap's public site, interactive application surfaces, public data delivery, administration, submissions, media processing, state management, testing, deployment, accessibility, performance, and future scaling.

The architecture is designed to provide application-quality mobile interaction without turning every page into a large single-page application.

---

## 1. Architecture goals

1. Deliver a fast, indexable public site.
2. Treat Places, contribution flows, and administration as coordinated application experiences.
3. Keep public browsing available from generated public data even when the operational database is unavailable.
4. Separate source candidates, operational canonical data, and public projections.
5. Preserve browser navigation, shareable URLs, and accessibility.
6. Avoid unnecessary client-side JavaScript outside interactive surfaces.
7. Keep infrastructure and processing components replaceable.
8. Fail closed when public-data, privacy, or publication validation fails.
9. Support a small initial dataset without blocking future region, viewport, or tile-based delivery.
10. Keep secrets and private records out of public builds and browser bundles.

---

## 2. System overview

```text
Public browser
├─ Astro-rendered pages
├─ React application areas
├─ MapLibre GL JS
└─ Generated public JSON / GeoJSON

Cloudflare
├─ static site hosting and edge cache
├─ Workers or Functions APIs
├─ Access for administration
├─ Turnstile for public submissions
├─ private and public R2 media storage
└─ Web Analytics

Neon Postgres
├─ source and candidate layer
├─ canonical records
├─ evidence and verification history
├─ submissions and private contacts
├─ media metadata
├─ audit history
└─ publication runs

GitHub Actions
├─ checks
├─ schema and public-export validation
├─ build
├─ controlled publication support
└─ scheduled maintenance workflows where approved
```

---

## 3. Web application structure

### 3.1 Astro responsibilities

Astro is the page and content framework for:

- Home;
- About;
- Methodology;
- Sources and Licenses;
- Data;
- Stats initial HTML;
- Updates;
- Roadmap;
- Changelog;
- Support;
- Partners;
- legal and contact pages;
- generated asset, network, category, country, and city pages;
- initial HTML for place and service detail pages.

These pages are statically generated where practical.

### 3.2 React responsibilities

React is used for cohesive interactive application areas:

- `PlacesApp`;
- Online Services explorer where interaction justifies it;
- contribution forms;
- secret submission-status interaction;
- administration and review;
- media upload and review;
- advanced Stats interactions.

React is not added to a page solely for static presentation.

### 3.3 Places as one application area

The `/places` discovery surface is one coordinated React application boundary:

```text
PlacesApp
├─ search
├─ filters
├─ map
├─ result list
├─ selected place
├─ desktop detail panel
├─ mobile bottom sheet
├─ URL synchronization
├─ loading, empty, and error states
├─ toasts
└─ browser-history integration
```

Map, list, filters, selected place, and bottom sheet are not implemented as unrelated independently hydrated islands. They share one state contract and one selection lifecycle.

### 3.4 Page transitions

Astro page navigation may use `ClientRouter` and browser-native view transitions where they improve continuity.

Requirements:

- normal browser navigation remains the baseline;
- transitions never block navigation;
- browser forward and back remain correct;
- reduced-motion preferences disable nonessential animation;
- forms or links that require full navigation can opt out;
- URL values passed to programmatic navigation are validated by application code.

React application-state animation is handled separately from document navigation.

---

## 4. State ownership

State is assigned by responsibility.

### 4.1 Server state — TanStack Query

Use for:

- API responses;
- private administration queries;
- submission-status responses;
- controlled retries;
- cache invalidation;
- mutation status;
- background refresh where appropriate.

Generated public JSON loaded once for static pages does not require TanStack Query by default.

### 4.2 Shared client UI state — Zustand

Use for coordinated application state such as:

- selected place;
- map/list presentation mode;
- mobile bottom-sheet state;
- temporary map viewport;
- list scroll restoration;
- non-shareable UI preferences within the current session.

### 4.3 Shareable and restorable state — URL

The URL owns state that users may share, bookmark, refresh, or restore through browser history:

- search query;
- asset;
- network;
- category;
- payment route;
- public status filter;
- map/list mode;
- selected public slug;
- map center and zoom when useful.

URL updates are bounded and avoid generating excessive browser-history entries during map movement.

### 4.4 Local component state

Use React local state for temporary values that do not need cross-component synchronization, such as:

- one open disclosure;
- local input focus;
- an uncommitted form section;
- a transient animation state.

### 4.5 Persisted browser state

Persist only low-risk presentation preferences.

Do not persist:

- exact browser geolocation history;
- private status tokens;
- private evidence URLs;
- submission contacts;
- ownership-proof state;
- administration data.

---

## 5. Public data delivery

### 5.1 Initial delivery model

Public pages read generated, validated artifacts:

```text
/data/place-pins.json
/data/places.json
/data/places.geojson
/data/online-services.json
/data/stats.json
/data/updates.json
/data/assets.json
/data/networks.json
/data/manifest.json
/version.json
```

The operational database is not queried on every public page request.

### 5.2 Map payload strategy

The first map request uses a compact pin projection containing only fields required to:

- render clusters or markers;
- identify public status;
- show a small selection preview;
- load the public place detail when selected.

Large evidence collections, full histories, internal IDs, private metadata, and full media objects are excluded.

### 5.3 Publication behavior

```text
canonical change
→ publication run
→ projection generation
→ schema validation
→ privacy and provenance validation
→ artifact hashing
→ release
```

A failed run:

- does not replace the last valid snapshot;
- does not expose partially generated files;
- records a private failure summary;
- does not tell a submitter that publication succeeded.

### 5.4 Cache behavior

- versioned assets may use long immutable caching;
- current manifest and version files use shorter cache lifetimes;
- publication changes invalidate affected edge cache entries;
- private routes use no-store or appropriately restrictive caching;
- signed media URLs are never cached as public assets.

### 5.5 Scaling path

The public-data access layer must allow later replacement with:

- region-split JSON;
- viewport APIs;
- PMTiles;
- vector tiles;
- edge-cached query responses;
- incremental publication.

UI code consumes a data-access interface rather than assuming that all future records always arrive from one global file.

---

## 6. Mapping

### 6.1 MapLibre GL JS

MapLibre GL JS is the browser map renderer.

Responsibilities:

- vector-tile or compatible style rendering;
- camera and interaction handling;
- clusters and public markers;
- selected-marker state;
- accessible controls outside the canvas;
- event integration with `PlacesApp`.

### 6.2 Basemap and styles

The basemap and style source must:

- permit the intended use;
- provide required attribution;
- remain configurable outside application logic;
- avoid embedding secret keys in the repository;
- support a migration path to another compatible style provider.

The initial plan may use OpenFreeMap or another approved compatible source, but the map-rendering contract does not depend on one commercial provider.

### 6.3 Search this area

Map movement updates temporary viewport state. It does not automatically replace the result set.

The user activates **Search this area**, which:

1. commits the visible bounds or center and zoom to the query state;
2. requests or filters the applicable public data;
3. preserves existing results while loading;
4. updates the URL at a controlled point.

### 6.4 Accessibility alternative

Every public map result exists in an operable list. Essential actions are available without canvas interaction.

---

## 7. Mobile application experience

### 7.1 Application shell

Interactive mobile surfaces provide:

- safe-area support;
- persistent global navigation where appropriate;
- touch-friendly controls;
- clear page or application title;
- predictable browser back behavior;
- explicit loading, empty, error, and success states.

### 7.2 Touch targets

Interactive targets aim for at least 44 by 44 CSS pixels unless a larger surrounding target provides equivalent usability.

### 7.3 Bottom sheet

The Places bottom sheet supports:

```text
closed
peek
expanded
```

It must:

- remain keyboard operable;
- expose semantic dialog or region behavior appropriate to its state;
- avoid trapping users when a full detail page is more appropriate;
- respond to viewport and safe-area changes;
- preserve selection through List / Map mode changes;
- support reduced motion.

### 7.4 Gesture policy

Gestures supplement visible controls and never become the only way to:

- close a sheet;
- open details;
- change List / Map mode;
- submit a form;
- navigate back.

### 7.5 Offline and installation

MVP includes:

- Web App Manifest;
- application name;
- icons;
- theme and background colors;
- standalone display support;
- valid start URL.

The MVP does not promise broad offline acceptance data. Stale payment information must not be silently presented as current because it was cached offline.

Later offline support may include only clearly dated application shell and recently viewed records with freshness warnings.

---

## 8. Motion and feedback

### 8.1 Motion tokens

```text
instant  80 ms
fast     140 ms
normal   220 ms
slow     320 ms
```

These are semantic starting points, not mandatory durations for every platform.

### 8.2 Appropriate motion

Use motion for:

- button press feedback;
- marker and card selection;
- bottom-sheet transitions;
- filter expansion;
- result updates;
- page continuity;
- gallery navigation;
- success or error feedback.

### 8.3 Inappropriate motion

Avoid:

- continuously moving backgrounds;
- long introductions;
- map-obscuring animation;
- excessive parallax;
- animation that delays input;
- full-screen fades for routine state changes.

### 8.4 Reduced motion

`prefers-reduced-motion` disables or minimizes nonessential motion while preserving understandable state changes.

---

## 9. Design system foundation

### 9.1 Tokens

Initial semantic tokens include:

```text
primary:          #0F766E
primary-subtle:   #CCFBF1
text-primary:     #0F172A
status-confirmed: #059669
status-stale:     #D97706
status-ended:     #64748B
status-error:     #DC2626
```

Tokens are represented through CSS custom properties so a later theme can be added without replacing component APIs.

### 9.2 Typography and icons

- system UI font stack;
- Lucide icons;
- icons supplement text and accessible labels rather than replacing them where meaning is unclear.

### 9.3 Geometry

```text
card radius:   12 px
button radius: 10 px
pill radius:   999 px
```

### 9.4 Breakpoints

Initial responsive breakpoints:

```text
640
768
1024
1280
```

Components respond to available space rather than relying only on device labels.

### 9.5 UI primitives

The foundation includes:

- typography;
- buttons;
- inputs;
- selects and comboboxes;
- chips;
- cards;
- dialogs;
- bottom sheet;
- popovers;
- toasts;
- skeletons;
- empty and error states;
- status badges;
- responsive application shell;
- gallery;
- tabs;
- form stepper.

Radix Primitives may provide accessible behavior where appropriate. Public component APIs remain project-owned.

### 9.6 Dark mode

Dark mode is outside the MVP. Tokens must not prevent a later theme.

---

## 10. Forms

### 10.1 Form stack

- React Hook Form for interactive form state where useful;
- Zod for shared request and domain validation;
- server-side validation remains authoritative;
- browser validation improves feedback but never replaces server validation.

### 10.2 Multi-step forms

Contribution forms may use steps when the sequence improves comprehension.

Requirements:

- preserve entered data across recoverable errors;
- expose a clear current step;
- allow safe back navigation;
- summarize before submission;
- do not submit partial canonical changes from the browser;
- upload media through scoped private paths;
- separate required payment facts from optional contact and media.

### 10.3 Idempotency

Mutating requests use an idempotency mechanism where duplicate submission would create harmful repeated records or uploads.

---

## 11. Administration

### 11.1 Protection

Administration is protected by Cloudflare Access or an equivalent identity-aware edge control.

The MVP does not implement a separate public administrator-account system.

### 11.2 Administration application

The React administration application covers:

- dashboard;
- candidate queue;
- claim editor;
- evidence review;
- rechecks;
- submissions;
- media;
- publication runs;
- audit history.

### 11.3 Server trust boundary

Administration authorization is checked by the server or trusted edge on every protected request. Hiding a route in the client is not authorization.

### 11.4 Audit

Material actions generate audit events with:

- actor identity or trusted actor reference;
- action;
- target;
- before and after values where appropriate;
- timestamp;
- correlation ID.

---

## 12. API boundaries

### 12.1 Public read APIs

The preferred public read path is generated data. Dynamic public APIs are added only when needed for scale or a documented product capability.

### 12.2 Submission APIs

Submission endpoints handle:

- Turnstile validation;
- rate limits;
- safe parsing;
- registry validation;
- duplicate controls;
- private contact encryption;
- status-token generation and hashing;
- immutable payload storage;
- private upload authorization.

### 12.3 Status APIs

Status endpoints require the public reference and secret access mechanism. They return a minimal public-safe projection and never expose raw submission records.

### 12.4 Administration APIs

Administration APIs provide scoped operations rather than generic table access.

Examples:

- review candidate;
- record evidence decision;
- create proposed canonical diff;
- resolve submission fields;
- start publication run;
- retry failed publication;
- record media decision.

### 12.5 Health and operational endpoints

Health endpoints reveal only the minimum necessary operational status. They do not expose connection strings, detailed errors, record counts from private queues, or infrastructure secrets.

---

## 13. Database access

### 13.1 Drizzle ORM

Drizzle manages:

- typed schema definitions;
- typed queries;
- reviewed migrations;
- transaction boundaries.

Complex reporting or migration work may use reviewed parameterized SQL where it is clearer or safer.

### 13.2 Neon serverless driver

Workers or other approved serverless runtimes connect to Neon through the serverless driver using HTTP for suitable one-shot operations and an approved transaction-capable path where interactive transactions require it.

Client browsers never receive database credentials.

### 13.3 Connection behavior

- secrets are runtime bindings;
- public builds do not contain database URLs;
- connection and query timeouts are bounded;
- retries are limited to safe operations;
- transaction retries account for idempotency;
- logs redact statements or values that may contain private data.

### 13.4 Migration behavior

- migration files are reviewable;
- destructive changes require backup and recovery planning;
- schema and application deployment order is documented;
- old and new versions coexist where required for safe rollout;
- failed migration does not corrupt the last valid public export.

---

## 14. Media processing

### 14.1 MVP-A

Operator-managed uploads use an authenticated processing path, initially supported by a controlled Node.js and Sharp workflow or an equivalent replaceable processor.

### 14.2 MVP-B

Public users upload directly to private quarantine through short-lived scoped authorization.

Processing may be asynchronous, but the system must preserve:

- status transitions;
- idempotency;
- bounded resources;
- private originals;
- approved public derivatives;
- deletion schedules;
- audit events.

### 14.3 Replaceable processor

The application depends on a media-processing interface, not one vendor-specific transformation URL format.

---

## 15. Testing architecture

### 15.1 Unit tests — Vitest

Examples:

- registry normalization;
- state transitions;
- evidence eligibility helpers;
- public-projection filters;
- URL serialization;
- export validation;
- retention-date calculation.

### 15.2 Component tests — React Testing Library

Examples:

- forms;
- filters;
- bottom sheet;
- status badges;
- dialogs;
- keyboard interactions;
- empty and error states.

### 15.3 End-to-end tests — Playwright

Required flows include:

- map and list discovery;
- filter and URL restoration;
- marker and list synchronization;
- detail and browser-back restoration;
- mobile bottom sheet;
- suggestion;
- payment report;
- problem report;
- claim;
- private submission status;
- administrative review;
- canonical publication;
- legacy redirects.

### 15.4 Accessibility checks

- automated axe checks;
- keyboard-only review;
- focus-order review;
- representative screen-reader review;
- reduced-motion review;
- map alternative review.

### 15.5 Data tests

- schemas;
- orphan references;
- duplicates;
- invalid coordinates;
- missing network;
- missing How to pay;
- insufficient evidence;
- expired confirmations;
- public/private leakage;
- missing provenance or license metadata.

---

## 16. Continuous integration

Every applicable pull request runs available checks for its affected area.

Initial code CI should include:

- formatting or linting;
- type checking;
- unit tests;
- build;
- documentation-link or format checks where useful.

As features are added, CI expands to:

- component tests;
- end-to-end tests;
- accessibility checks;
- migration checks;
- public-export fixtures;
- privacy leakage checks;
- dependency and secret scanning.

Checks are not reported as passed unless they actually ran and passed.

---

## 17. Deployment

### 17.1 Environments

```text
local
preview
staging
production
```

Preview and staging never use production private data unless an explicitly approved sanitized process exists.

### 17.2 Public site

The default public delivery is a static Astro build deployed to Cloudflare Pages or an equivalent static edge host.

A Cloudflare Astro server adapter is introduced only for routes that require server rendering; static routes remain prerendered where practical.

### 17.3 APIs

Dynamic APIs deploy as Cloudflare Workers or Pages Functions with separate environment bindings.

### 17.4 Publication

Public dataset publication is a controlled action. Application deployment and public-data publication may be independent so a failed data export does not require a code rollback.

### 17.5 Rollback

- code deployments retain a previous known-good deployment;
- public artifacts retain the previous valid snapshot;
- database changes include recovery or compatibility plans;
- redirects and route changes are verified before production switch.

---

## 18. Observability

### 18.1 Public analytics

Cloudflare Web Analytics provides privacy-conscious aggregate traffic measurement.

Additional search-demand events, where approved, use canonical values such as:

- country;
- city;
- asset;
- network;
- category;
- result-count bucket;
- date.

Do not record exact browser location, raw coordinate history, full free-text search, or persistent device identifiers for this purpose.

### 18.2 Operational logs

Logs use structured events and correlation IDs.

Logs must redact:

- secrets;
- authorization headers;
- signed URLs;
- status tokens;
- email addresses;
- private evidence;
- wallet addresses or transaction data supplied privately;
- database connection values.

### 18.3 Error monitoring

Error reports contain:

- stable error code;
- route or operation;
- deployment version;
- correlation ID;
- safe technical context.

They do not include raw private payloads by default.

---

## 19. Performance budgets

Targets for representative public pages:

```text
LCP  ≤ 2.5 seconds
INP  ≤ 200 milliseconds
CLS  ≤ 0.1
```

These are measured goals, not claims that every network and device will always meet them.

### 19.1 Performance practices

- hydrate only interactive areas;
- load MapLibre only on map surfaces;
- use compact pin data;
- defer noncritical media;
- provide responsive image derivatives;
- keep existing results visible during refetch;
- avoid heavy React rerenders during map movement;
- virtualize large lists if measurement shows a need;
- split or tile data before one global payload becomes excessive;
- use edge caching for public artifacts.

### 19.2 Performance regression

Representative budgets become CI or staging checks after the application foundation exists.

---

## 20. Accessibility target

The product targets WCAG 2.2 AA conformance for the supported public and administrative flows.

Requirements include:

- semantic structure;
- visible focus;
- keyboard operation;
- appropriate labels and descriptions;
- focus management for dialogs and sheets;
- text alternatives;
- error association;
- status not communicated by color alone;
- sufficient contrast;
- touch-friendly controls;
- reduced motion;
- a list alternative to the map.

A map canvas is never the only route to listing information or actions.

---

## 21. Dependency policy

- prefer maintained dependencies with clear ownership and release history;
- pin versions through the lockfile;
- update in bounded pull requests;
- review breaking changes before upgrade;
- remove unused packages;
- avoid packages that duplicate platform capabilities without a clear benefit;
- review client bundle impact;
- run security scanning after code foundation exists;
- do not expose dependency demonstration keys or sample secrets.

The architecture names responsibilities rather than freezing a major version before implementation.

---

## 22. Initial technology set

```text
Astro
TypeScript
React
Tailwind CSS
CSS custom properties
Radix Primitives
Lucide
Motion for React
TanStack Query
Zustand
React Hook Form
Zod
MapLibre GL JS
Drizzle ORM
Neon serverless driver
Cloudflare Pages / Workers / Access / Turnstile / R2
Vitest
React Testing Library
Playwright
```

A technology may be replaced through a documented decision when the replacement preserves the required architecture and improves security, maintenance, performance, accessibility, or portability.

---

## 23. Technical completion checklist

Before the foundation phase is considered complete, verify:

- [ ] Astro and React responsibilities are separated.
- [ ] Places is one coordinated React application area.
- [ ] URL, server, shared UI, and local state ownership is documented and implemented.
- [ ] Public pages can use validated generated data without per-request database access.
- [ ] Dynamic APIs keep database and storage credentials server-side.
- [ ] Administration is protected by server-enforced access control.
- [ ] Submission and status APIs return minimal projections.
- [ ] Private originals cannot become public fallbacks.
- [ ] Map interaction has a complete list alternative.
- [ ] Mobile safe areas, browser back, bottom sheet, and reduced motion work.
- [ ] Applicable lint, type, test, build, accessibility, and export checks run.
- [ ] Public artifact failure preserves the last valid snapshot.
- [ ] Performance and accessibility targets are measured on representative flows.
