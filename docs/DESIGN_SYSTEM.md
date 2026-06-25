# CryptoPayMap design system foundation

## Purpose

This document defines the first reusable visual and responsive contract for CryptoPayMap. It is intentionally smaller than the finished product design system. Later implementation items add component primitives, interaction states, motion, and accessibility tests without changing these semantic foundations casually.

## Principles

- Use semantic tokens rather than repeating raw colors and dimensions.
- Keep public status colors distinct from brand and action colors.
- Design mobile behavior first and expand at documented breakpoints.
- Preserve usable keyboard focus and at least 44px interactive targets.
- Use motion for orientation and feedback, never as a requirement for understanding.
- Do not implement dark mode during the MVP foundation phase, but avoid structures that would make a later theme impossible.

## Color tokens

| Token | Value | Purpose |
|---|---:|---|
| `brand-50` | `#CCFBF1` | soft brand surface and selected navigation |
| `brand-600` | `#0F766E` | primary action and brand emphasis |
| `brand-700` | `#0F5F59` | hover and strong brand text |
| `brand-800` | `#115E59` | selected text on light brand surfaces |
| `ink` | `#0F172A` | primary text |
| `muted` | `#475569` | secondary text |
| `canvas` | `#F8FAFC` | page background |
| `surface` | `#FFFFFF` | cards, header, and footer |
| `border` | `#CBD5E1` | neutral boundaries |
| `confirmed` | `#059669` | confirmed acceptance status |
| `stale` | `#D97706` | stale acceptance status |
| `ended` | `#64748B` | ended acceptance status |
| `danger` | `#DC2626` | errors and destructive actions |

Status must never be communicated by color alone. Text or an icon must accompany status color.

## Radius tokens

| Token | Value | Use |
|---|---:|---|
| `card` | `12px` | panels and cards |
| `control` | `10px` | buttons, inputs, and navigation items |
| `pill` | `999px` | compact badges and status chips |

## Breakpoints

The responsive contract matches the published product specification:

| Name | Width |
|---|---:|
| `sm` | `640px` |
| `md` | `768px` |
| `lg` | `1024px` |
| `xl` | `1280px` |

Do not create a new breakpoint for a single component without documenting the reason.

## Layout utilities

- `app-shell` creates the header, content, and footer grid.
- `page-container` constrains page content to `1280px`.
- `safe-area-inline` protects content from display cutouts and edge gestures.
- `safe-area-block-end` protects bottom controls from the mobile home indicator.
- `skip-link` provides immediate keyboard access to main content.

The viewport uses `viewport-fit=cover` so safe-area variables are effective on supported mobile browsers.

## Interaction requirements

- Interactive controls use a minimum height of 44px unless a larger target wraps them.
- `:focus-visible` remains clearly visible against both canvas and surface backgrounds.
- Horizontal mobile navigation may scroll, but all links remain keyboard reachable.
- Reduced-motion preferences suppress non-essential transitions and animations.
- Touch feedback must not remove keyboard or screen-reader semantics.

## Ownership by implementation item

- `P1-02` owns tokens, responsive shell, safe-area behavior, and the basic page frame.
- `P1-03` owns reusable UI primitives and full loading, empty, success, and error states.
- `P1-04` owns motion tokens and component motion behavior.
- `P1-10` owns the formal accessibility baseline and automated checks.

## Change rule

A semantic token may be changed when the change improves consistency or accessibility across the product. Page-specific styling should not redefine a global token. Breaking changes to status colors, breakpoints, or public interaction requirements require a documented implementation decision and cross-page review.
