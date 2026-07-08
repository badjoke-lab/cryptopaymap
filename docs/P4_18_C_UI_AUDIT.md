# P4-18C bounded UI residual audit

**Implementation item:** P4-18C  
**Status:** Active — C1 visually accepted; C2 planned next  
**Last updated:** 2026-07-08

## Purpose

P4-18C closes only material UI residuals already visible in representative screenshot review. It does not reopen Phase 4 as an unlimited redesign cycle.

## Visual review source

The representative screenshot artifact generated from the post-B4 main state was inspected directly. A successful screenshot workflow is treated only as capture evidence; visual acceptance is recorded here from image review.

C1 was also reviewed directly from the representative screenshot artifact generated from the formatted final C1 head. The affected Mobile Places List and open Mobile Menu images were inspected rather than inferred from the capture workflow result.

## Material findings

### C-UI-01 — Mobile Places List card density

**Status:** Closed by C1 visual acceptance

Original issue:

- realistic multi-result lists required excessive scrolling;
- each card repeated four payment/freshness blocks in a single-column mobile definition list;
- 80px Media or placeholder, four vertical metadata blocks, and two actions created an unnecessarily tall result card.

C1 result:

- status, category, name, locality, assets, networks, route, freshness, map selection, and payment-detail access are preserved;
- mobile card padding and gaps are reduced;
- mobile thumbnails/placeholders are reduced while wider-breakpoint sizing remains;
- Assets, Networks, Routes, and Last confirmed use a compact two-column mobile summary;
- action controls retain minimum touch target height;
- direct review of the C1 Mobile Places List screenshot confirms materially better scan density without information loss or horizontal overflow.

### C-UI-02 — Mobile Menu uses excessive screen area

**Status:** Closed by C1 visual acceptance

Original issue:

- six primary links occupied a full-height drawer with substantial unused space;
- the menu visually read as a large empty surface rather than a bounded navigation panel.

C1 result:

- overlay dismissal, Escape handling, focus trap, close-button focus, trigger focus restoration, body scroll lock, and active-page state remain covered;
- the menu is now a bounded top-right panel;
- six primary links are presented as a three-row, two-column grid with minimum touch targets;
- direct review of the C1 open-menu screenshot confirms the previous full-height empty-area problem is removed and navigation remains readable.

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

### C1 — Compact Mobile List and Menu — Visually accepted

Completed result:

- compact result cards preserve payment/freshness information;
- bounded mobile navigation panel uses screen area coherently;
- navigation, focus, Escape, overlay, body-scroll, active-state, and touch behavior remain covered;
- focused tests and representative screenshots completed successfully;
- affected screenshots were directly inspected and accepted.

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
