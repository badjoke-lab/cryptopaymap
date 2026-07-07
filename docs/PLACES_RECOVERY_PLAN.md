# Places recovery plan

**Status:** Active  
**Last updated:** 2026-07-07

## Purpose

This document is the implementation-order companion to `docs/PLACES_UX_ACCEPTANCE.md`.

It converts the currently known Places regressions and missing capabilities into a fixed recovery sequence. The sequence is intentionally broader than one responsive-layout patch. It covers map presentation, Place information, desktop and mobile selected-Place surfaces, motion, media, navigation, state behavior, and final acceptance verification.

For all Places work after this document is introduced:

1. read `docs/PROJECT_STATUS.md`;
2. read the active item in `docs/IMPLEMENTATION_PLAN.md`;
3. read `docs/PLACES_UX_ACCEPTANCE.md`;
4. read this recovery plan;
5. compare the required behavior with the current branch and merged repository state;
6. do not mark the Places recovery complete until every item below has an implemented and tested completion path.

## Recovery principles

- Do not restore the legacy visual design wholesale.
- Preserve the current verification model, public-data boundaries, MapLibre renderer, URL state, and responsive application shell.
- Restore useful map-service behavior that was lost or weakened.
- The map must look and behave like a place-discovery map, not a political or statistical thematic map.
- The selected-Place panel and expanded mobile sheet must support practical visit and payment decisions without forcing routine navigation to the SEO detail page.
- Detail pages remain canonical public routes for indexing, sharing, Evidence, history, provenance, and complete record presentation.
- Public basic business information must still follow provenance, review, privacy, and publication rules. Recovery work must not expose unreviewed candidate data or private material.

## Fixed 17-point recovery set

### R1 — Initial camera

**Change:** Remove first-pin-dependent default camera behavior. Default first access to a stable world or broad regional view. Restore URL-owned viewports when present, use explicit current-location focus only after user action, and use bounded Place focus for explicit Place deep links.

**Outcome:** A first-time visitor immediately understands that the product is a geographic discovery map. Data ordering no longer changes the opening country or city.

### R2 — Basemap style

**Change:** Replace the current country-fill-dominant presentation with a street-map-oriented style that prioritizes roads, streets, districts, transit context, and readable place names. Keep the MapLibre renderer and keep the style source configurable.

**Outcome:** Users can understand where a business is in relation to streets, stations, districts, and surrounding geography.

### R3 — Single-Place marker shape

**Change:** Replace single-Place circle points with explicit map-pin markers. Provide distinct normal, hover/focus, selected, Confirmed, and Stale treatments where those states are publicly visible.

**Outcome:** A single business location is immediately recognizable as a place rather than an abstract data point.

### R4 — Cluster and Place distinction

**Change:** Keep clusters visually distinct from single Place markers. Clusters use count-bearing aggregate symbols; single Places use pin markers.

**Outcome:** Users can instantly distinguish one Place from a group of Places.

### R5 — Public Place basic-information contract

**Change:** Extend the reviewed canonical/public Place information path as needed so a public Place can expose, when reviewed and available: full address, locality, region, postal code, country, phone, official website, approved social links, opening hours, public description/about text, amenities or practical attributes, coordinates, and approved public media.

Implementation may use normalized related tables or bounded structured fields rather than copying the legacy schema literally. Public projection schemas and leakage validation must be updated together.

**Outcome:** CryptoPayMap becomes useful for deciding whether and how to visit a Place, not only for reading payment-acceptance claims.

### R6 — Address and location presentation

**Change:** Surface the reviewed address and location context in the desktop selected panel and mobile selected sheet. Do not reduce available location information to locality and country when a reviewed fuller address is already public.

**Outcome:** Users can identify the selected business without opening another route.

### R7 — Desktop selected-Place completeness

**Change:** Make the desktop selected-Place workspace a near-complete practical record surface. When public data exists, it should be able to show identity, category, address, contact and official links, opening hours, description, amenities, status, assets, networks, route, method, processor, merchant-receipt information, How to pay, restrictions, freshness, gallery, navigation actions, reporting, and a link to the canonical detail page.

**Outcome:** Normal desktop discovery and visit/payment decisions can remain inside the map workspace.

### R8 — Mobile expanded-sheet completeness

**Change:** Make `expanded` a real full selected-Place view rather than a payment-only summary. It must be able to include basic information, practical location and contact data, payment information, restrictions, gallery, external navigation actions, reporting, and canonical detail navigation.

**Outcome:** Mobile users can select a pin, expand the sheet, and obtain most practical information without leaving the map flow.

### R9 — Peek and expanded role separation

**Change:** Keep `peek` intentionally compact and move complete practical content to `expanded`. Peek should prioritize identity, status/category context, compact address, primary accepted-asset summary, and freshness. Heavy media and long text belong in expanded state.

**Outcome:** Mobile selection remains fast while expansion has a clear informational purpose.

### R10 — Real bottom-sheet slide interaction

**Change:** Replace state changes that only animate height with a position-based sheet transition. During direct dragging, the sheet should follow pointer/touch movement within bounded limits, then settle to `peek`, `expanded`, or `closed` according to the gesture and threshold. Visible button alternatives remain required. Reduced-motion mode may snap between states.

**Outcome:** The sheet behaves like an intentional mobile map sheet instead of changing height only after a swipe ends.

### R11 — Gallery in selected-Place surfaces

**Change:** Surface approved gallery media in the desktop selected panel and mobile expanded sheet, using an appropriate grid, horizontal scroll, or carousel pattern.

**Outcome:** Users can inspect a Place visually without opening the canonical detail page solely to see photos.

### R12 — Image enlargement

**Change:** Add an accessible lightbox or equivalent enlarged-media viewer for public gallery images. Support close, previous/next where applicable, keyboard Escape, focus handling, and touch navigation where applicable.

**Outcome:** Exterior, interior, payment-sign, terminal, menu, or other approved images can be meaningfully inspected.

### R13 — External map navigation

**Change:** Provide external directions/navigation actions for Google Maps and Apple Maps on desktop selected Place and mobile expanded sheet, derived from the selected public coordinates and/or reviewed address. Keep website, phone, and social links separate from navigation actions.

**Outcome:** The user can discover a crypto-accepting Place in CryptoPayMap and hand off route guidance to a familiar navigation service.

### R14 — Detail-page responsibility

**Change:** Stop treating the canonical Place detail route as the mandatory path for ordinary selected-Place information. Preserve the route for search indexing, sharing, complete Evidence, verification history, provenance, full claim detail, and other long-form public record responsibilities.

**Outcome:** Map discovery is efficient while canonical detail pages retain strong SEO, sharing, and trust roles.

### R15 — Current-location behavior

**Change:** Keep exact browser geolocation ephemeral. User activation may focus the map, but focusing must not automatically commit a new result area or write exact current-location history. `Search this area` remains the deliberate commit action.

**Outcome:** Current-location use feels natural without collapsing the distinction between temporary map focus and committed discovery state.

### R16 — Selection-state semantics

**Change:** Preserve a deterministic selection lifecycle across map, list, controls, desktop panel, and mobile sheet:

- marker selection selects the Place;
- list selection selects the Place and reveals/focuses it on the map;
- reselecting the same marker is a no-op;
- selecting another Place changes selection;
- empty map canvas may clear selection;
- map navigation controls, filters, menu, list interaction, and selected-Place content do not accidentally clear selection;
- mobile list-to-map selection opens the selected Place state;
- browser back/forward restores validated discovery and ephemeral UI state where specified.

**Outcome:** Users can predict why a Place opens, changes, remains selected, or closes.

### R17 — Acceptance contract and regression coverage

**Change:** Keep every requirement above in `docs/PLACES_UX_ACCEPTANCE.md`, the active implementation plan, and test coverage appropriate to each layer. Any newly discovered Places defect must be added to the same contract or a linked tracked item before it is considered part of completion.

**Outcome:** Previously reported defects do not disappear from later work because a narrower pull-request description became the only remembered scope.

## Implementation sequence

The recovery is executed in dependency order.

### P4-17A — Contract and tracking correction

- update authoritative Places acceptance requirements;
- add this recovery plan;
- synchronize implementation plan and project status;
- make future Places work read these documents first.

**Completion result:** the 17-point scope is durable before more code changes continue.

### P4-17B — Map presentation foundation

Covers R1–R4:

- stable initial camera policy;
- street-map-oriented basemap;
- pin marker rendering;
- cluster/single-Place visual distinction;
- selected/status marker states;
- map presentation regression tests.

**Completion result:** `/places` reads as a usable place-discovery map before selected-record expansion work proceeds.

### P4-17C — Place information and public projection

Covers R5–R6:

- canonical model review for missing practical Place information;
- schema/migration work where required;
- admin/review path adjustments where required;
- public projection schema and export updates;
- provenance, privacy, and leakage validation;
- selected-surface model updates.

**Completion result:** reviewed practical Place information can flow safely from canonical storage to public UI models.

### P4-17D — Selected-Place desktop and mobile surfaces

Covers R7–R10 and R14:

- desktop selected panel completeness;
- mobile peek/expanded information hierarchy;
- drag-following position-based sheet interaction;
- reduced-motion behavior;
- canonical detail-page role preserved without forcing routine navigation.

**Completion result:** ordinary Place discovery, visit context, and payment understanding work inside the map flow.

### P4-17E — Media and navigation completion

Covers R11–R13:

- gallery in desktop selected panel;
- gallery in mobile expanded sheet;
- accessible image enlargement;
- Google Maps handoff;
- Apple Maps handoff.

**Completion result:** selected Place surfaces support visual inspection and real-world navigation.

### P4-17F — State, responsive, and final acceptance audit

Covers R15–R17 and cross-checks all earlier items:

- current-location focus/commit separation;
- deterministic selection semantics;
- Map/List synchronization;
- browser restoration;
- narrow mobile and desktop responsive checks;
- keyboard and reduced-motion checks;
- public-schema and privacy checks for information additions;
- complete 17-point acceptance matrix review.

**Completion result:** Phase 4 is not declared repository-complete until the full Places acceptance contract passes.

## Completion rule

P4-16 remains the existing MVP-A integration audit line, but the known Places recovery discovered during that audit is now represented by P4-17. Phase 4 repository completion requires P4-17A through P4-17F, or explicitly documented replacement items that preserve every requirement in this plan.

No single pull request title or temporary task description supersedes this document. If a later implementation discovers additional Places defects, add them to the acceptance contract and implementation tracking before closing the recovery program.