# Places UX acceptance contract

**Status:** Active acceptance contract  
**Last updated:** 2026-07-07

## Purpose

This document defines the required interaction and presentation behavior for `/places` across desktop and mobile.

It is the authoritative acceptance contract for Places map presentation, selected-Place information, panel and sheet behavior, gallery interaction, external navigation, current-location handling, and selection-state semantics.

For implementation order and dependency grouping, also read `docs/PLACES_RECOVERY_PLAN.md`.

Shared public data and URL state do not imply a shared visual shell. Desktop and mobile use different interaction structures while preserving the same discovery state and the same public information boundary.

## Contract precedence

For Places-specific map, marker, selected-panel, bottom-sheet, gallery, navigation, camera, and selection behavior, this document and `docs/PLACES_RECOVERY_PLAN.md` are the governing contracts.

General repository specifications remain applicable for verification, privacy, provenance, accessibility, state ownership, media rights, and public export boundaries. A narrower pull-request description does not supersede this contract.

## Shared behavior

Both layouts must preserve these rules:

- Confirmed Places are visible by default.
- Stale Places are opt-in.
- Candidate records are never substituted into public results.
- Map movement alone does not replace the current result set.
- After deliberate user map movement, `Search this area` appears and applies the pending viewport only when pressed.
- Search, facets, selected Place, committed viewport, zoom, and Map/List mode are URL-owned where applicable.
- Back/forward navigation restores the committed discovery state.
- Selected Place, selected marker, and selected list item remain synchronized.
- Loading, empty, map-unavailable, and map-error states always retain a usable list path.
- Focus and reduced-motion behavior must remain usable.
- A selected Place surface must expose enough reviewed information for ordinary visit and payment decisions without making the canonical detail page mandatory for routine information.
- The canonical detail page remains available for indexing, sharing, Evidence, history, provenance, complete claim detail, and other long-form public record responsibilities.

## Map presentation contract

### Initial camera

The default camera must not depend on the first record in the pin array.

Required rules:

- normal first access uses a stable world or broad regional view that makes the map purpose immediately recognizable;
- a valid URL-owned committed viewport is restored when present;
- Current location moves or focuses the map only after explicit user action;
- exact browser geolocation is not automatically written to the URL or persistent history;
- focusing on Current location does not by itself commit a new result area;
- an explicit Place deep link may focus the Place at a bounded neighborhood or city-useful zoom level;
- Place focus must not zoom so tightly that surrounding street and district context becomes unintelligible.

### Basemap

The basemap must support practical place discovery.

It must prioritize:

- roads and streets;
- districts and neighborhoods;
- transit and useful geographic context;
- readable city and locality labels;
- sufficient contrast for Place pins and clusters.

A country-fill-dominant, choropleth-like, or political-map presentation that visually overwhelms streets and local context is not accepted for the default Places experience.

The MapLibre renderer may remain. The style source remains configurable and must preserve attribution and provider migration boundaries.

### Single-Place markers

A single Place is represented by an explicit map-pin marker rather than a generic circle point.

Marker behavior must include:

- normal state;
- hover/focus state where pointer or keyboard semantics apply;
- selected state;
- Confirmed and Stale distinction when both are visible;
- sufficient contrast against the basemap;
- deterministic hit area and selection behavior.

### Clusters

Clusters and single Places must be visually distinct.

- cluster: aggregate/count-bearing symbol;
- single Place: pin marker.

A user must be able to identify whether a symbol represents one Place or multiple Places without trial clicking.

### Map interaction

The map provides:

- clustering;
- selected marker treatment;
- user-driven pan and zoom;
- `Search this area` after deliberate user map movement;
- Current location action;
- persistent results while a pending area has not been committed;
- selection clearing only from intentional empty-canvas behavior, not from unrelated controls.

## Public Place information contract

The selected-Place experience requires a reviewed practical-information path in addition to payment-acceptance claims.

When reviewed and publicly available, a Place may expose:

- Place name;
- category;
- full address;
- locality;
- region;
- postal code;
- country;
- latitude and longitude;
- phone;
- official website;
- approved official social links;
- opening hours;
- public description or about text;
- amenities or practical attributes;
- cover media;
- approved gallery media;
- payment assets;
- networks;
- route type;
- payment method;
- processor when applicable;
- Merchant receives;
- How to pay;
- restrictions;
- public status;
- last confirmed date and other public-safe freshness information.

The implementation may use normalized related records or bounded structured fields. It does not need to copy the legacy schema literally.

All new public fields remain subject to:

- canonical review;
- provenance;
- privacy rules;
- source and license rules;
- public projection allowlisting;
- runtime schema validation;
- leakage validation.

## Desktop contract

### Structure

At `lg` and above, the primary discovery workspace is a stable two-column application surface:

```text
Discovery controls
Map 60% | Results or selected Place 40%
```

The right-side workspace does not disappear when a Place is selected. It changes responsibility from result browsing to selected Place context.

### Discovery controls

Desktop provides direct access to:

- Search;
- Asset;
- Network;
- Category;
- Payment type;
- Public status;
- Current location.

The design may use compact selects, chips, popovers, or a bounded control panel, but the common discovery facets and location action must be reachable without opening a mobile-style full-screen sheet.

### Right-side workspace: normal state

Show the public result list with:

- visible result count;
- Place name;
- category;
- locality/country;
- status;
- assets;
- networks;
- payment route summary;
- last confirmed date.

Selecting a result must select and reveal its marker without losing the current discovery context.

### Right-side workspace: selected state

The desktop selected-Place panel is a near-complete practical record surface.

When public data is available, it must be able to show:

- cover or category fallback;
- Place name;
- category;
- full reviewed address and location context;
- phone;
- official website;
- approved official social links;
- opening hours;
- public description/about text;
- amenities or practical attributes;
- status;
- assets;
- networks;
- Direct wallet or Processor checkout route;
- payment method;
- processor when applicable;
- How to pay;
- Merchant receives;
- restrictions;
- last confirmed date and public-safe freshness context;
- approved gallery media;
- Google Maps navigation action;
- Apple Maps navigation action;
- problem-report route;
- canonical Place detail link.

The canonical detail link remains available but is not the required path for ordinary selected-Place information.

Closing the selected panel clears selection and returns the right-side workspace to the result list without clearing search, filters, or committed viewport.

### Desktop selection behavior

- Marker selection selects the matching list result and opens selected Place context.
- List selection selects the marker and moves/reveals the map camera as needed.
- Re-selecting the same marker is a no-op.
- Selecting another Place changes selection.
- Clicking empty map canvas may clear selection.
- Interacting with map navigation controls, discovery controls, result list, navigation actions, gallery, lightbox controls, or selected Place panel must not accidentally clear selection.

## Mobile contract

### App shell

Below `lg`, `/places` is an application surface rather than a vertically stacked desktop page.

The primary structure is:

```text
Compact header
Map or List primary mode
Map HUD / search and filters access
Bottom sheet for selected Place
```

The map mode uses the available dynamic viewport height beneath the compact header and safe areas. It must not inherit a desktop fixed minimum height that produces page-like dead space or forces the footer into the primary map workflow.

### Mobile header and menu

- Keep the primary header compact.
- Use a mobile menu surface rather than a compressed horizontal desktop navigation row.
- Menu, Filters, selected Place sheet, and media viewer must have deterministic stacking and must not close one another accidentally.

### Map HUD

Map mode provides a compact, non-blocking HUD containing:

```text
Locate | Filters | N places
```

The exact visual treatment may evolve, but these responsibilities remain available without leaving the map.

### Filters

Mobile filters open as a sheet/overlay over the map instead of pushing the map down the document.

The sheet provides:

- Asset;
- Network;
- Category;
- Payment type;
- Public status;
- clear/reset action;
- visible result count;
- zero-result guidance.

Zero-result guidance must not cover the center of the map. It should be presented in the filter/list context and may offer:

- widen the area;
- include Stale;
- view Online Services;
- suggest a Place.

### Map/List mode

- Map and List are mutually explicit primary modes on mobile.
- Switching modes preserves search, filters, selection, viewport, sheet state where valid, and list position.
- List mode uses page-level scrolling rather than unnecessary nested scrolling.
- Selecting a list result returns to or reveals Map mode as required by the interaction flow, focuses/reveals the Place, and opens the selected Place state.

### Bottom-sheet states

Selected Place uses three application states:

```text
closed
peek
expanded
```

#### Peek responsibility

`peek` is intentionally compact and prioritizes:

- Place name;
- status/category context;
- compact reviewed address or location context;
- primary accepted-asset summary;
- last confirmed date.

Long text and heavy media must not overload `peek`.

#### Expanded responsibility

`expanded` is the practical full selected-Place surface.

When public data is available, it must be able to show:

- Place identity and category;
- full reviewed address and location context;
- phone;
- official website;
- approved official social links;
- opening hours;
- public description/about text;
- amenities or practical attributes;
- status;
- How to pay;
- assets;
- networks;
- route type;
- payment method;
- processor when applicable;
- Merchant receives;
- restrictions;
- public-safe freshness context;
- approved gallery media;
- Google Maps navigation action;
- Apple Maps navigation action;
- problem-report route;
- canonical Place detail route.

The expanded state must not require canonical-detail navigation merely to see normal practical Place information that is already public and available to the selected-Place model.

### Bottom-sheet gesture and motion contract

Required interaction:

- tapping a single marker opens `peek`;
- tapping/selecting a list result opens `peek` and synchronizes the marker;
- upward drag or explicit expand action moves toward `expanded`;
- downward drag from `expanded` moves toward `peek`;
- downward close gesture from the permitted state may move toward `closed`;
- during direct drag, the sheet follows bounded pointer/touch movement rather than waiting until release and then only changing height;
- after release, threshold/velocity logic settles the sheet to a valid state;
- visible controls remain available for expand/collapse/close actions;
- reduced-motion mode may snap between states without transform animation;
- opening, dragging, settling, and closing the sheet must not block map state updates or corrupt selection state.

A height-only state transition that does not provide direct drag-following movement does not satisfy the complete sheet interaction contract.

### State restoration

Returning from a Place detail page, or using browser back/forward, restores where valid:

- viewport;
- zoom;
- filters;
- selected Place;
- Map/List mode;
- bottom-sheet state;
- list scroll position.

## Gallery and media interaction contract

Approved gallery media must be available in:

- desktop selected-Place panel;
- mobile `expanded` sheet;
- canonical Place detail page.

Selected-Place surfaces may use a bounded grid, horizontal scroll, or carousel pattern appropriate to the layout.

Selecting an image opens an accessible enlarged-media viewer or equivalent.

The viewer must support, where multiple images exist:

- enlarged image presentation;
- previous/next controls;
- close control;
- keyboard Escape;
- predictable focus entry and return;
- touch navigation where applicable;
- reduced-motion compatibility;
- alt text and attribution display where required.

Media interaction must not accidentally clear the selected Place.

## External navigation contract

Desktop selected Place and mobile expanded Place provide navigation handoff actions for:

- Google Maps;
- Apple Maps.

Navigation URLs are derived from public coordinates and/or reviewed address information.

Navigation actions are separate from:

- official website;
- phone;
- social links;
- payment instructions.

CryptoPayMap discovers and explains the Place; external map services provide turn-by-turn route guidance.

## Current-location contract

- Geolocation starts only from explicit user action.
- Exact current location remains ephemeral.
- Focusing the map on current location does not automatically commit the area or replace results.
- `Search this area` is the deliberate result-area commit action.
- Programmatic current-location movement must not masquerade as a user pan that immediately creates incorrect pending state.
- The interface provides clear permission-denied, unavailable, timeout, and unsupported feedback.

## Selection lifecycle contract

The complete Places selection lifecycle is:

```text
marker selection
→ select Place
→ synchronize list and marker
→ open desktop panel or mobile peek

list selection
→ select Place
→ reveal/focus map marker
→ open desktop panel or mobile peek

same marker selected again
→ no-op

another Place selected
→ replace selected Place

empty map canvas interaction
→ may clear selection

map controls / filters / menu / panel content / sheet content / media viewer
→ do not accidentally clear selection
```

Back/forward behavior restores validated URL-owned discovery state and permitted history-owned ephemeral UI state.

## Canonical detail-page responsibility

`/place/{slug}` remains the canonical public record route.

Its responsibilities include:

- search indexing;
- stable sharing URL;
- complete public Evidence;
- verification and change history;
- provenance;
- complete payment-claim detail;
- long-form restrictions and explanations;
- complete public media presentation;
- contribution and reporting entry points where implemented;
- nearby discovery return path.

The detail page complements the map selected-Place experience. It must not be used as a substitute for an incomplete desktop panel or mobile expanded sheet.

## Responsive quality gates

A responsive change is not accepted only because it avoids overflow. Acceptance requires separate desktop and mobile interaction checks.

### Desktop checks

- stable 60/40 map/workspace structure;
- stable broad default camera when no committed viewport exists;
- street-map-oriented basemap readability;
- pin markers for single Places;
- visible cluster/single-Place distinction;
- discovery controls and Current location are directly usable;
- marker and list selection produce synchronized state;
- selected Place context includes practical basic information and payment information;
- gallery and image enlargement are usable;
- Google Maps and Apple Maps actions are usable;
- empty map canvas clearing does not make controls or sidebar interactions clear selection;
- keyboard focus remains visible and recoverable.

### Mobile checks

- compact header and menu work without horizontal navigation overflow;
- map occupies the intended dynamic viewport workspace;
- stable broad default camera when no committed viewport exists;
- street-map-oriented basemap remains readable at mobile sizes;
- `Locate | Filters | N places` responsibilities remain available on map mode;
- Filters overlay does not push the map down the page;
- marker selection opens `peek`;
- peek remains compact;
- expanded state contains practical Place information, payment information, gallery, and navigation actions;
- direct drag follows touch/pointer movement and settles predictably;
- reduced-motion behavior remains equivalent;
- Map/List mode preserves discovery state;
- gallery enlargement is usable without accidental selection loss;
- no horizontal page overflow at narrow widths;
- safe-area and touch targets remain usable.

## 17-point acceptance matrix

The Places recovery is not complete until all of these are satisfied:

1. stable non-first-pin-dependent initial camera;
2. street-map-oriented default basemap;
3. single Place uses a pin marker rather than a generic circle;
4. cluster and single Place are visually distinct;
5. reviewed practical Place basic-information path exists;
6. full reviewed address/location information is surfaced in selected-Place UI;
7. desktop selected-Place panel is near-complete for ordinary practical use;
8. mobile expanded sheet is a practical full selected-Place view;
9. mobile peek and expanded responsibilities are clearly separated;
10. bottom sheet uses real position-based slide/drag behavior with drag following;
11. gallery exists in desktop selected panel and mobile expanded sheet;
12. gallery images can be enlarged accessibly;
13. Google Maps and Apple Maps navigation handoff exists;
14. canonical detail page retains SEO/trust/long-form responsibilities without being mandatory for routine selected-Place information;
15. Current location preserves ephemeral focus versus committed search-area separation;
16. selection semantics are deterministic across map, list, controls, panel, sheet, and browser restoration;
17. all requirements remain documented and covered by appropriate regression, schema, privacy, responsive, accessibility, and interaction checks.

## Non-goals

This contract does not require copying the previous CryptoPayMap visual design.

It preserves useful place-discovery behavior while the current product retains:

- its verification model;
- canonical/public separation;
- public data contracts and validation;
- URL-state model;
- MapLibre renderer;
- current responsive shell;
- current design system;
- media rights and privacy controls.

Legacy behavior is evidence for useful interaction patterns, not an instruction to restore obsolete implementation details blindly.