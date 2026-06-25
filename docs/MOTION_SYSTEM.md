# CryptoPayMap motion system

## Purpose

Motion helps users understand selection, opening, closing, loading, and result changes. It must not delay payment discovery, hide state, require movement to understand an outcome, or compete with map interaction.

## Timing tokens

| Token | Duration | Typical use |
|---|---:|---|
| `instant` | 80ms | immediate pressed or focus feedback |
| `fast` | 140ms | hover, color, border, short exit, toast dismissal |
| `normal` | 220ms | dialog, sheet, content replacement, page entry |
| `slow` | 320ms | reserved for larger orientation changes |

The CSS variables and Motion for React tokens use the same values.

## Easing tokens

| Token | Value | Purpose |
|---|---|---|
| `standard` | `cubic-bezier(0.2, 0, 0, 1)` | ordinary feedback and panel movement |
| `enter` | `cubic-bezier(0, 0, 0, 1)` | content entering the interface |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | content leaving quickly and clearly |

Do not add arbitrary durations or easing curves inside feature components without documenting the reason.

## Responsibility boundaries

### Astro page navigation

Astro `ClientRouter` owns transitions between public routes. The root page transition uses opacity only. It must preserve route announcements, browser navigation, and the operating system reduced-motion preference.

Page navigation must not depend on a long transition. The fallback remains a direct swap when animation support is unavailable.

### React application state

Motion for React owns coordinated state changes inside an interactive React surface, including:

- selected asset or network summaries;
- result-card replacement;
- filter-result summaries;
- controlled presence of application feedback.

`MotionConfig reducedMotion="user"` is the default policy. Components that use movement must provide an equivalent opacity-only or immediate state when reduced motion is requested.

### Radix portal surfaces

Dialog, Sheet, Select, and Toast portal surfaces use CSS animation driven by Radix `data-state` and swipe attributes. They share the same duration and easing tokens as Motion for React.

The behavioral primitive continues to own focus, Escape, dismissal, and keyboard handling. Animation must never replace those controls.

## Approved patterns

- short color, border, and shadow feedback;
- opacity changes for content replacement;
- movement of four pixels or less for small in-context state changes;
- bottom-sheet entry from the bottom edge;
- side-sheet entry from the right edge;
- dialog opacity and subtle scale;
- toast entry, exit, and user-controlled swipe dismissal;
- page opacity transition through Astro.

## Prohibited patterns

- long intro sequences;
- autoplaying decorative backgrounds;
- parallax;
- looping motion unrelated to loading;
- motion that blocks map pan, zoom, or selection;
- delayed buttons that wait for animation before acting;
- large movement for ordinary filter or selection feedback;
- route transitions that hide content for an extended period;
- animation as the only indication of success, error, stale, or ended status.

## Reduced motion

When `prefers-reduced-motion: reduce` is active:

- CSS animation and transition durations collapse to an effectively immediate value;
- Astro root view-transition animations are disabled;
- Motion for React suppresses transform and layout movement through `MotionConfig`;
- `AnimatedSwap` avoids vertical movement;
- loading indicators remain understandable through text and `aria-busy` even if rotation is disabled;
- closing, submitting, filtering, and navigation remain fully available.

Reduced motion does not mean reduced information.

## Map and bottom-sheet rules

Future Places work must follow these constraints:

- map movement is controlled by the map library, not page animation;
- selecting a result may move the map and open a sheet, but neither action waits for the other animation to finish;
- bottom-sheet gestures always have visible button alternatives;
- list and selected-place state update immediately before or alongside animation;
- the map remains interactive during non-modal result updates;
- reduced-motion mode may snap the sheet between states.

## Loading motion

- Loading indicators supplement readable status text.
- Skeletons reserve layout and may pulse only when motion is allowed.
- Long operations need an explicit label, not only a spinner.
- Existing safe content should remain visible during background refresh when possible.

## Review checklist

For every new motion pattern, confirm:

- the movement explains a state change;
- the state is understandable without animation;
- the duration uses an existing token;
- keyboard and screen-reader behavior is unchanged;
- reduced-motion behavior is equivalent;
- touch input is not blocked;
- map interaction remains available where applicable;
- no private state or sensitive value is exposed through the URL or transition snapshot.

## Ownership

- P1-04 owns the token contract, reduced-motion policy, root page transition, and primitive motion classes.
- Feature phases may compose these foundations but must not redefine the global timing system silently.
- P1-10 verifies accessibility behavior.
- Later Places implementation verifies map and bottom-sheet behavior on real mobile devices.
