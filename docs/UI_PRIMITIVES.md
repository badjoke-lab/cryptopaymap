# CryptoPayMap UI primitives

## Purpose

This document defines the shared component contract introduced in P1-03. These components are foundations for Places, Online Services, contribution forms, and protected review screens. Product-specific components may compose them, but should not replace their accessibility behavior with page-specific implementations.

## Dependencies

- `radix-ui` provides low-level behavior for select, dialog, sheet, and toast patterns.
- `lucide-react` provides the icon layer.
- CryptoPayMap owns visual styling, semantic tokens, public-state meaning, and component composition.

Icons supplement text and accessible labels. They do not replace status text or required control names.

## Components

### Button

Variants:

- `primary`
- `secondary`
- `ghost`
- `danger`

Sizes:

- `sm`
- `md`
- `lg`
- `icon`

Rules:

- normal controls meet the 44px minimum target;
- icon-only controls require an accessible label;
- loading sets `aria-busy` and disables repeat activation;
- destructive actions use the danger variant but still require clear text.

### TextField and FieldFrame

The field contract connects:

- visible label;
- input identifier;
- optional hint;
- validation message;
- `aria-invalid`;
- `aria-describedby`.

Errors use both text and visual treatment. Placeholder text is never the only label.

### SelectField

The select primitive supports:

- keyboard selection;
- trigger and option focus management;
- placeholder state;
- disabled options;
- hint and error connections;
- explicit asset-and-network labels.

A stablecoin selection must identify its network in the option label or adjacent context.

### Badge

Tones:

- neutral
- brand
- confirmed
- stale
- ended
- danger

Status badges always include readable text. Color and icons are supplementary.

### Card

The card provides optional:

- eyebrow;
- title;
- description;
- content;
- footer.

Cards do not become interactive automatically. A clickable card must expose a real link or button with an accessible name.

### ModalDialog

The dialog foundation requires:

- trigger;
- title;
- description;
- close control;
- managed focus;
- Escape behavior;
- modal background separation.

Use a dialog for focused tasks that interrupt the current page context. Do not use it for ordinary navigation.

### Sheet

The sheet uses the dialog behavior foundation but presents content from the bottom or right edge. It is intended for:

- mobile place details;
- filters;
- secondary review information;
- short contextual tasks.

Sheet movement and gesture behavior are owned by P1-04 and later feature work. Closing must never require a gesture.

### ToastProvider and ToastNotice

Toast messages support:

- information;
- success;
- warning;
- error.

A toast action must be safe to ignore. Required confirmation, destructive approval, or legal consent belongs in a dialog or alert dialog instead.

### Skeleton

Skeletons visually reserve layout while content is loading. The surrounding region supplies the readable loading state. Reduced-motion preferences disable the pulse animation.

### StatePanel

State panels provide standardized:

- empty;
- loading;
- success;
- warning;
- error.

Each state requires a title and explanatory text. Optional recovery or next-step actions use the shared Button primitive.

## Keyboard and focus contract

- Every interactive primitive is reachable by keyboard.
- Visible focus remains present.
- Dialog and sheet focus remains inside the modal surface while open.
- Escape closes dismissible modal surfaces.
- Select follows the primitive keyboard pattern.
- Toasts do not steal focus for ordinary notifications.

## Reuse rule

A feature should compose these components before introducing a new base primitive. New base primitives require:

1. a missing interaction pattern;
2. a documented API;
3. keyboard and screen-reader behavior;
4. loading, disabled, error, and reduced-motion consideration;
5. usage that is not limited to a single page.

## Ownership by later work

- P1-04 adds motion tokens and coordinated state transitions.
- P1-07 adds component and unit-test infrastructure.
- P1-10 adds automated accessibility checks and manual keyboard review.
- Feature phases add domain components such as place cards, asset selectors, evidence summaries, and review diffs by composing these primitives.
