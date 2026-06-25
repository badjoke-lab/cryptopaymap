# CryptoPayMap development rules

These instructions apply to the entire repository.

## 1. Start every task by establishing the current state

Before changing files:

1. Read `docs/PROJECT_STATUS.md`.
2. Find the active implementation item in `docs/IMPLEMENTATION_PLAN.md`.
3. Read the public specification documents relevant to the change.
4. Compare the documents with the actual `main` branch, merged pull requests, and available CI results.

When repository reality and a status document disagree, repository reality is authoritative. Correct the status document in the same pull request or the next dedicated correction pull request.

## 2. Use implementation item IDs

Every planned change must reference an implementation item ID, such as:

- `P0-01`
- `P1-03`
- `FIX-P1-001`
- `SEC-P2-001`
- `DATA-P2-001`

Pull request numbers are not implementation item IDs. Do not renumber the implementation plan when an unplanned fix is inserted.

## 3. Keep pull requests bounded

A pull request should have one primary responsibility.

- Do not combine a large database migration with an unrelated UI redesign.
- State the purpose, scope, exclusions, completion criteria, and checks.
- Keep changes reviewable and reversible.
- Update documentation when behavior, data contracts, routes, or operating procedures change.

## 4. Protect publication boundaries

This is a public repository. Do not add:

- private planning documents;
- non-public candidate records;
- submission contact details;
- private evidence or unreviewed media;
- secrets, credentials, tokens, connection strings, or wallet secrets;
- internal commercial targets, private partnership discussions, or unpublished operational limits;
- personal information or unrelated project information.

Candidate records must never become public merely because they exist in an import, submission, or review queue.

## 5. Preserve data and verification integrity

Changes must maintain these principles:

- reviewed canonical data is separate from source candidates and user submissions;
- user submissions never update public canonical records automatically;
- published acceptance claims identify the asset, network, payment route, payment method, instructions, evidence, and last confirmation date;
- sponsorship, advertising, or payment never determines verification status;
- public exports exclude private fields and internal review data.

## 6. Keep project tracking synchronized

At the start of an implementation item:

- mark the item `In progress` in `docs/IMPLEMENTATION_PLAN.md`;
- update `docs/PROJECT_STATUS.md`;
- include the item ID in the pull request body.

Before completion:

- verify the documented completion criteria;
- record the pull request number in the implementation plan;
- mark the item `Completed` only after the change is merged or otherwise completed;
- move `docs/PROJECT_STATUS.md` to the next real item;
- check whether the public roadmap or product changelog is affected.

Do not add a product changelog entry for repository administration alone.

## 7. Quality checks

Run every check available for the affected area. As the repository gains tooling, this normally includes:

- formatting or linting;
- type checking;
- unit tests;
- component tests;
- build validation;
- end-to-end tests where applicable;
- accessibility checks where applicable;
- schema and public-export validation for data changes.

Do not claim a check passed unless it was actually run and passed.

## 8. User experience requirements

Interactive surfaces, especially Places, contribution flows, and administration, must be designed as application experiences rather than static pages.

Maintain:

- responsive and touch-friendly controls;
- keyboard access and visible focus states;
- URL-backed shareable or restorable search state where specified;
- browser back behavior that restores map and list context;
- reduced-motion support;
- clear loading, empty, success, and error states;
- a list-based alternative to map-only interaction.

## 9. Documentation language

Public repository documentation is written in clear English unless a document explicitly defines another requirement.

Use product, technical, security, data-integrity, accessibility, or maintainability reasons in public explanations. Do not expose private motivations or circumstances.
