# Responsive UX boundary

## Purpose

CryptoPayMap uses shared public data and shared interaction state, but the public shell must not treat mobile as a scaled-down desktop layout.

## Desktop boundary

At `lg` and above, Places discovery presents Map and Result List together. Desktop selection uses an in-map selected Place card. Filters remain an inline panel so the user can keep geographic and result context visible while refining the query.

## Mobile boundary

Below `lg`, Places discovery presents one primary result mode at a time: Map or List. Selection uses the mobile bottom sheet. Filters use a bottom sheet rather than pushing the map or list down the page. The mobile header uses a compact menu instead of a horizontally scrolling desktop navigation row.

## Shared state

The following remain shared across breakpoints:

- URL-owned search and facet state
- selected Place slug
- committed viewport
- Search this area bounds commit
- browser history restoration
- public data filtering

Responsive separation is a presentation and interaction boundary, not a separate data model.

## Review rule

A responsive implementation is not accepted merely because CSS wraps without overflow. Mobile and desktop must each preserve a clear primary task, usable navigation, appropriate scroll ownership, and breakpoint-specific selection behavior.
