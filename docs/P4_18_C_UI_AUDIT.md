# P4-18C bounded UI residual audit

**Implementation item:** P4-18C  
**Status:** Repository and visual review complete through C1 and C2; C3 closure reconciliation complete  
**Last updated:** 2026-07-08

## Purpose

P4-18C closes only material UI residuals visible in representative screenshot review. It does not reopen Phase 4 as an unlimited redesign cycle.

## Visual review sources

The representative screenshot artifact generated from the post-B4 main state was inspected directly. A successful screenshot workflow was treated only as capture evidence; visual acceptance was recorded only after image review.

C1 was reviewed directly from the representative screenshot artifact generated from the formatted final C1 head. The affected Mobile Places List and open Mobile Menu images were inspected rather than inferred from the capture workflow result.

C2 was reviewed directly from the representative screenshot artifact generated from the final C2 head. The expanded Place sheet, Filters-open state, Mobile Places List, open Mobile Menu, and representative Methodology page were inspected from the same artifact set before C3 closure.

## Closure result

The fixed five-item P4-18C scope is closed:

1. Mobile Places List compactness and scanability — closed by C1;
2. Mobile Menu density — closed by C1;
3. expanded-sheet information order and access to payment-critical information — closed by C2;
4. Filters completion, clear, zero-result recovery, and shared Map/List state behavior — closed by C2 plus existing shared discovery-state coverage;
5. material density or layout defects on representative long-form public pages — no material defect found in direct review.

No material horizontal overflow, hidden primary interaction, or unresolved density defect was found in the final C2 artifact review. Small future visual preferences may be handled as bounded follow-up fixes and do not keep P4-18C open.

## Material findings and results

### C-UI-01 — Mobile Places List card density

**Status:** Closed by C1 visual acceptance

Original issue:

- realistic multi-result lists required excessive scrolling;
- each card repeated four payment/freshness blocks in a single-column mobile definition list;
- large Media or placeholder blocks, four vertical metadata blocks, and two actions created an unnecessarily tall result card.

C1 result:

- status, category, name, locality, assets, networks, route, freshness, map selection, and payment-detail access are preserved;
- mobile card padding and gaps are reduced;
- mobile thumbnails/placeholders are reduced while wider-breakpoint sizing remains;
- Assets, Networks, Routes, and Last confirmed use a compact two-column mobile summary;
- action controls retain minimum touch target height;
- direct final-artifact review confirms materially better scan density without information loss or horizontal overflow.

### C-UI-02 — Mobile Menu uses excessive screen area

**Status:** Closed by C1 visual acceptance

Original issue:

- six primary links occupied a full-height drawer with substantial unused space;
- the menu visually read as a large empty surface rather than a bounded navigation panel.

C1 result:

- overlay dismissal, Escape handling, focus trap, close-button focus, trigger focus restoration, body scroll lock, and active-page state remain covered;
- the menu is now a bounded top-right panel;
- six primary links are presented as a three-row, two-column grid with minimum touch targets;
- direct final-artifact review confirms the previous full-height empty-area problem is removed and navigation remains readable.

### C-UI-03 — Expanded Place sheet delays payment-critical information

**Status:** Closed by C2 visual acceptance

Original issue:

The expanded mobile sheet rendered Location, Navigate, About, Hours, Amenities, Contact/official links, and Gallery before `How to pay` and payment metadata. Payment instructions could therefore sit well below the first viewport even though payment usability is a primary responsibility of the product.

C2 result:

- Location and navigation remain near the top;
- `How to pay` follows Location and Navigate directly;
- Networks, Payment routes, Payment methods, Processor, Merchant receives, and Restrictions remain grouped with the payment context;
- About, Hours, Amenities, Contact/official links, and Gallery follow payment-critical information;
- the complete practical profile and detail/report exits remain available;
- direct final-artifact review confirms payment-critical information is visible before long practical-profile content without horizontal overflow or hidden actions.

### C-UI-04 — Mobile Filters lack an explicit completion affordance

**Status:** Closed by C2 visual acceptance and interaction coverage

The existing implementation already provided:

- immediate filter application;
- Clear;
- zero-result guidance;
- Widen area;
- Include Stale;
- Online Services and Suggest a Place exits;
- Map/List state preservation through shared discovery URL state.

C2 result:

- a mobile-only sticky completion footer now shows the live result count;
- the completion action closes the filter sheet explicitly;
- the completion action participates in the mobile focus trap;
- immediate application, Clear, zero-result guidance, Widen area, Include Stale, existing backdrop/close behavior, and desktop filter behavior remain unchanged;
- direct final-artifact review confirms the completion action is visible and readable without horizontal overflow.

### C-UI-05 — Representative long-form public pages

**Status:** Closed with no material defect found

The representative Methodology mobile screenshot was inspected again from the final C2 artifact set. It is long by content volume, but no material horizontal overflow, hidden interaction, or broken density/layout defect was observed. P4-18C therefore does not churn this page without new material evidence.

## Execution slices

### C1 — Compact Mobile List and Menu — Completed and visually accepted

Completed result:

- compact result cards preserve payment/freshness information;
- bounded mobile navigation panel uses screen area coherently;
- navigation, focus, Escape, overlay, body-scroll, active-state, and touch behavior remain covered;
- focused tests and representative screenshots completed successfully;
- affected screenshots were directly inspected and accepted.

### C2 — Expanded sheet payment order and Filters completion — Completed and visually accepted

Completed result:

- payment-critical information is placed ahead of long practical-profile content in expanded sheet;
- Location/navigation remain near the top;
- mobile Filters include an explicit completion footer with live result count;
- Clear, zero-result recovery, Widen area, Include Stale, and shared Map/List state behavior remain covered;
- focused tests and representative screenshots completed successfully;
- expanded-sheet and Filters-open screenshots were directly inspected and accepted.

### C3 — Visual closure reconciliation — Completed

C3 directly inspected the latest representative artifact across:

- Mobile Places List;
- open Mobile Menu;
- expanded Place sheet;
- Filters-open state;
- representative Methodology long-form page.

No material residual remained in the fixed P4-18C scope. P4-18C is closed and tracking may move to P4-18D.

## Closure decision

P4-18C is complete.

The next implementation item is P4-18D — Administration workflow integration audit.

P4-18D must audit real operator journeys across Candidate, duplicate, Promotion, existing-target linking, Location correction, Evidence, reconfirmation, Media, export, Audit history, and rollback/retry boundaries. Environment-specific checks must be classified precisely as completed, unavailable, or assigned to P4-18E/launch work; repository tests must not be described as live verification.

## Non-goals

- redesigning the public visual system;
- changing public data semantics;
- changing map selection or URL-state contracts;
- changing practical-profile data models;
- broad long-form page restyling without material evidence.
