# P4-18C bounded UI residual audit

**Implementation item:** P4-18C  
**Status:** Active — C1 compact mobile discovery surfaces in progress  
**Last updated:** 2026-07-08

## Purpose

P4-18C closes only material UI residuals already visible in representative screenshot review. It does not reopen Phase 4 as an unlimited redesign cycle.

## Visual review source

The representative screenshot artifact generated from the post-B4 main state was inspected directly. A successful screenshot workflow is treated only as capture evidence; visual acceptance is recorded here from image review.

## Material findings

### C-UI-01 — Mobile Places List card density

**Status:** Material — C1 active

Observed issue:

- realistic multi-result lists require excessive scrolling;
- each card repeats four payment/freshness blocks in a single-column mobile definition list;
- 80px Media or placeholder, four vertical metadata blocks, and two actions create an unnecessarily tall result card.

Required correction:

- preserve status, category, name, locality, assets, networks, route, freshness, map selection, and payment-detail access;
- reduce mobile card padding and gaps;
- use a smaller mobile thumbnail/placeholder with the existing larger size retained at wider breakpoints;
- use a compact two-column metadata grid on mobile;
- preserve touch target requirements.

### C-UI-02 — Mobile Menu uses excessive screen area

**Status:** Material — C1 active

Observed issue:

- six primary links occupy a full-height drawer with substantial unused space;
- the menu visually reads as a large empty surface rather than a bounded navigation panel.

Required correction:

- retain overlay dismissal, Escape handling, focus trap, close-button focus, and trigger focus restoration;
- replace full-height drawer presentation with a bounded top-right panel;
- present the six links in a compact two-column grid while retaining minimum touch targets and active-page state.

### C-UI-03 — Expanded Place sheet delays payment-critical information

**Status:** Material — C2 planned

Observed issue:

The expanded mobile sheet currently renders Location, Navigate, About, Hours, Amenities, Contact/official links, and Gallery before `How to pay` and payment metadata. Payment instructions can therefore sit well below the first viewport even though payment usability is a primary responsibility of the product.

Required correction:

- keep the selected-place identity header concise;
- place `How to pay` and core payment metadata before long practical-profile sections and Gallery;
- preserve Location and navigation access near the top;
- avoid duplicating the complete canonical Place detail page.

### C-UI-04 — Mobile Filters lack an explicit completion affordance

**Status:** Material interaction residual — C2 planned

Current code already provides:

- immediate filter application;
- Clear;
- zero-result guidance;
- Widen area;
- Include Stale;
- Online Services and Suggest a Place exits;
- Map/List state preservation through shared discovery URL state.

Remaining issue:

- the mobile filter sheet can be dismissed through close X or backdrop, but has no explicit bottom completion action after changing filters;
- the long facet sheet therefore lacks a clear task-completion endpoint.

Required correction:

- add a mobile-only sticky completion footer showing current result count;
- retain immediate application, Clear, zero-result guidance, and existing close/backdrop behavior;
- keep desktop filter panel behavior unchanged.

### C-UI-05 — Representative long-form public pages

**Status:** No material defect found in current review

The representative Methodology mobile screenshot was inspected. It is long by content volume, but no material horizontal overflow, hidden interaction, or broken density/layout defect was observed. P4-18C will not churn this page without new material evidence.

## Execution slices

### C1 — Compact Mobile List and Menu

- compact result cards without removing payment/freshness information;
- bound the mobile navigation panel and use screen area coherently;
- preserve navigation, focus, Escape, overlay, and touch behavior;
- run focused tests and representative screenshots;
- inspect affected screenshots after capture.

### C2 — Expanded sheet payment order and Filters completion

- move payment-critical information ahead of long practical-profile content in expanded sheet;
- retain Location/navigation near the top;
- add explicit mobile Filters completion footer with result count;
- verify Clear, zero-result, widen-area, Include Stale, and Map/List behavior;
- run focused tests and inspect affected screenshots.

### C3 — Visual closure reconciliation

- inspect the latest affected mobile screenshots directly;
- verify no material horizontal overflow or hidden interactive surface;
- reconcile the five fixed P4-18C scope items;
- record small non-material preferences as later bounded follow-ups rather than keeping C open;
- move tracking to P4-18D only after material residuals are closed.

## Non-goals

- redesigning the public visual system;
- changing public data semantics;
- changing map selection or URL-state contracts;
- changing practical-profile data models;
- broad long-form page restyling without material evidence.
