# CryptoPayMap development rules

These instructions apply to the entire repository.

## 1. Start every task by establishing the current state

Before changing files:

1. Read `docs/PROJECT_STATUS.md`.
2. Find the active implementation item in `docs/IMPLEMENTATION_PLAN.md`.
3. Read the public specification documents relevant to the change.
4. Compare the documents with the actual `main` branch, merged pull requests, and available CI results.

For Phase 4 closure work, also read `docs/PHASE4_CLOSURE_PLAN.md`.

For Places work, also read:

1. `docs/PLACES_UX_ACCEPTANCE.md`;
2. `docs/PLACES_RECOVERY_PLAN.md`;
3. `docs/PLACES_UX_FINAL_AUDIT.md`;
4. `docs/PLACE_PUBLIC_PROFILE.md` when practical Place information is affected;
5. `docs/PRACTICAL_PROFILE_DATA_MODEL_EXTENSION.md` for P4-18B practical profile data work.

The complete Places contract remains in force even when one pull request implements only a bounded part of it.

For Phase 5 submission work, also read:

1. `docs/SUBMISSION_WORKFLOW.md`;
2. `docs/PHASE5_IMPLEMENTATION_SEQUENCE.md`;
3. `docs/DATA_MODEL.md`;
4. `docs/PHASE4_CLOSURE_PLAN.md` for the handoff gate;
5. `docs/MEDIA_POLICY.md` when Media intake or review is affected.

When repository reality and a status document disagree, repository reality is authoritative. Correct tracking in the same pull request or the next dedicated correction pull request.

## 2. Use implementation item IDs

Every planned change must reference an implementation item ID, such as:

- `P0-01`;
- `P4-18B2`;
- `P5-03`;
- `FIX-P1-001`.

Pull request numbers are not implementation item IDs. Do not renumber the implementation plan when an unplanned fix is inserted.

## 3. Keep pull requests bounded

A pull request should have one primary responsibility.

- Do not combine a large data migration with an unrelated UI redesign.
- State purpose, scope, exclusions, completion criteria, and checks.
- Keep changes reviewable and reversible.
- Update documentation when behavior, data contracts, routes, or operating procedures change.
- State which active closure or phase item is covered and which work remains open.

P4-18 is a bounded closure term. Do not expand P4-18C into an unlimited redesign cycle. Do not start Phase 5 implementation before the P4-18E handoff gate is complete.

## 4. Protect publication boundaries

This is a public repository. Keep non-public review material, personal information, private submission material, restricted Evidence or Media, operational access material, and unrelated internal project information out of public repository content and public artifacts.

Candidate records must never become public merely because they exist in an import, submission, or review queue.

## 5. Preserve data and verification integrity

Changes must maintain these principles:

- reviewed canonical data is separate from source Candidates and user submissions;
- user submissions never update public canonical records automatically;
- published acceptance Claims identify the asset, network, payment route, payment method, instructions, Evidence, and last confirmation date;
- commercial relationships do not determine verification status;
- public exports exclude non-public review and submission material.

Practical Place information changes must extend the complete operational path where applicable:

```text
source or submission intake
    ↓
safe review projection
    ↓
reviewer controls
    ↓
field provenance
    ↓
canonical create or correction transaction
    ↓
public projection allowlist
    ↓
runtime and leakage validation
    ↓
staging review
    ↓
public surfaces
```

A database column, schema property, fixture, or UI section alone does not complete a practical field.

Structured fields such as amenities and social links require explicit normalization, duplicate behavior, provenance, replacement and removal semantics, and safe public projection.

## 6. Keep project tracking synchronized

At the start of an implementation item:

- mark the item `In progress` in `docs/IMPLEMENTATION_PLAN.md`;
- update `docs/PROJECT_STATUS.md`;
- include the item ID in the pull request body.

Before completion:

- verify documented completion criteria;
- record the pull request number in the implementation plan;
- mark the item `Completed` only after merge or equivalent completion;
- move `docs/PROJECT_STATUS.md` to the next real item;
- check public Roadmap and Changelog impact.

Do not add a product Changelog entry for repository administration alone.

P4-18 completion is controlled by `docs/PHASE4_CLOSURE_PLAN.md`. Phase 5 implementation begins only after P4-18E completes the handoff and `docs/PROJECT_STATUS.md` moves to P5-01.

Material newly discovered Places defects must be added to active acceptance or closure tracking before they are treated as completion work. Small later visual preferences may be handled as bounded fixes without reopening the closure term.

## 7. Quality checks

Run every check available for the affected area. This normally includes:

- formatting or linting;
- type checking;
- unit tests;
- component tests;
- build validation;
- end-to-end tests where applicable;
- accessibility checks where applicable;
- schema and public-export validation for data changes;
- representative screenshot capture and image inspection for affected public UI states.

Do not claim a check passed unless it actually ran and passed.

A successful screenshot capture job proves that the requested screenshots were produced. It does not prove visual acceptance. Inspect relevant images and record material findings before completing affected UI work.

Places changes must test the user-visible contract appropriate to the item, including camera defaults, marker and cluster distinction, selected-Place completeness, sheet gestures and reduced motion, Gallery behavior, navigation links, current-location focus versus commit behavior, and selection restoration where applicable.

Practical profile work must test presence, absence, malformed input, duplicate structured values, provenance assignment, canonical persistence or correction, strict public projection, and leakage rejection where applicable.

## 8. User experience requirements

Interactive surfaces, especially Places, submission flows, and administration, must be designed as application experiences rather than static pages.

Maintain:

- responsive and touch-friendly controls;
- keyboard access and visible focus states;
- URL-backed shareable or restorable search state where specified;
- browser back behavior that restores map and list context;
- reduced-motion support;
- clear loading, empty, success, and error states;
- a list-based alternative to map-only interaction.

For Places specifically:

- the default map must read as practical Place discovery;
- single Places and clusters must be visually distinct;
- selected-Place surfaces must not hide ordinary public information behind unnecessary route changes;
- mobile peek and expanded states have different responsibilities;
- direct sheet dragging follows input movement where motion is enabled;
- approved Media and navigation handoff follow the Places contract.

P4-18C has a fixed residual scope: Mobile List compactness, Mobile Menu density, expanded-sheet information order, Filters completion flow, and only material long-page density defects. Fine-grained preference changes discovered later should be handled as bounded follow-up fixes.

## 9. Documentation language

Public repository documentation is written in clear English unless a document explicitly defines another requirement.

Use product, technical, security, data-integrity, accessibility, or maintainability reasons in public explanations. Do not expose private motivations or circumstances.
