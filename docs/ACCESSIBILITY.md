# CryptoPayMap accessibility baseline

## Goal

CryptoPayMap targets a WCAG 2.2 AA-oriented implementation. Accessibility is a shared foundation requirement for public discovery, contribution flows, and protected administration rather than a final launch-only review.

P1-10 establishes the minimum contract that later pages and application areas must preserve.

## Document structure

Every shared page provides:

- a declared document language;
- a non-empty page title;
- a visible-on-focus skip link;
- a programmatically focusable main landmark;
- labeled primary and footer navigation;
- one page-level `h1` on the foundation page;
- no positive `tabindex` values;
- no automatic focus without a specific reviewed interaction need.

The main landmark uses `tabindex="-1"` so keyboard users can move directly to content through the skip link without placing the landmark in the normal tab sequence.

## Keyboard and focus

Interactive controls must:

- use native buttons, links, inputs, and form semantics where possible;
- expose a visible focus indicator;
- meet the shared 44px-oriented touch-target baseline;
- remain operable by keyboard;
- avoid custom tab ordering;
- return focus predictably after modal surfaces close.

Dialog and sheet primitives use Radix-managed modal semantics, focus containment, Escape handling, and trigger-focus restoration. They also expose visible, named close buttons.

## Forms

Shared form fields connect:

- visible labels through `for` and `id`;
- hints and errors through `aria-describedby`;
- invalid state through `aria-invalid`;
- immediate validation messages through `role="alert"` when appropriate.

Placeholder text is not a substitute for a label.

## Status and loading

Status cannot be communicated by color alone. Badges and panels contain text labels, while decorative icons are hidden from assistive technology.

Loading placeholders expose a text alternative through a status region rather than relying on animation or shape alone.

## Motion

The shared motion system respects `prefers-reduced-motion`. Reduced motion removes nonessential animation while preserving state changes and task completion.

Astro page transitions and React interaction motion have separate ownership. The application must not duplicate route announcements already supplied by Astro's client router.

## Map and discovery requirements

Future map features must always provide a synchronized list or equivalent non-map route. A user must be able to:

- search and filter without operating the map;
- reach every public place result through the list or detail route;
- understand selected and filtered state without color alone;
- restore map and list state through normal browser navigation.

Map-only interaction is not an acceptable completion state.

## Automated checks

The repository runs three accessibility-related layers:

1. component tests for labels, descriptions, modal semantics, close controls, and keyboard dismissal;
2. static build checks for document language, title, landmarks, navigation labels, headings, duplicate IDs, accessible control names, labels, and forbidden focus patterns;
3. existing formatting, lint, type, build, and reduced-motion checks.

`npm run accessibility:check` runs against the generated `dist/index.html` and fails closed when a required foundation contract is missing.

## Manual verification gate

P1-12 performs the first integrated manual review on the real Cloudflare staging deployment after P1-09 through P1-11 are complete. That review covers:

- keyboard-only traversal;
- visible focus;
- skip-link behavior;
- dialog and sheet focus containment and restoration;
- reduced-motion behavior;
- browser accessibility tree and route announcements;
- mobile zoom and touch targets;
- representative screen-reader flows.

Automated checks support but do not replace this manual review.
