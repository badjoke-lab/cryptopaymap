# CryptoPayMap development guidance

This file defines the working rules for contributors and development assistants.

## Start here

Before changing the repository:

1. Read `docs/PROJECT_STATUS.md`.
2. Find the active item in `docs/IMPLEMENTATION_PLAN.md`.
3. Read the public specification documents related to that item.
4. Confirm the expected deliverables and completion criteria.
5. Keep the pull request focused on one implementation item.

## Source of truth

When documents disagree, use this order:

1. The actual `main` branch, merged pull requests, and current CI results.
2. `docs/PROJECT_STATUS.md`.
3. `docs/IMPLEMENTATION_PLAN.md`.
4. Public specification documents in `docs/`.
5. The public product roadmap.

Fix stale status or plan documents in the next appropriate pull request.

## Implementation item IDs

Every planned pull request must reference an implementation item ID such as:

- `P0-01`
- `P1-03`
- `FIX-P1-001`
- `SEC-P2-001`
- `DATA-P2-001`

Pull request numbers are not implementation item IDs.

## Pull request rules

- Keep one primary responsibility per pull request.
- State the implementation item ID in the pull request body.
- Include completion criteria and explicit non-goals.
- Do not combine a large database migration with a large UI change.
- Update `docs/IMPLEMENTATION_PLAN.md` and `docs/PROJECT_STATUS.md` when the current item changes.
- Check whether a public changelog or public roadmap update is required.
- Merge only after required checks pass.

## Publication and privacy boundary

Never commit:

- secrets, tokens, private keys, or connection strings;
- personal information or private contact details;
- private submissions, private evidence, or private media;
- unreviewed candidate records in public data;
- internal-only planning, financial, operational-capacity, or strategy documents;
- non-public partnership, sponsorship, or commercial discussions.

Public outputs must contain only reviewed, publishable information.

## Data integrity rules

- Candidate records must not appear in public exports.
- User submissions must never modify canonical records automatically.
- Asset, network, route, and payment method values must use their registries.
- A confirmed claim must meet the published verification policy.
- Public exports must pass schema and privacy validation.

## Documentation language

Public repository documentation is written in clear English unless a file explicitly requires another language.
