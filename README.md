# CryptoPayMap

CryptoPayMap is a verified discovery service for physical places and online services where customers can pay from a cryptocurrency wallet.

The project is in active development. Public listings are designed to identify the payment asset, network, route, method, instructions, evidence, status, and last confirmation date.

## Core principles

- Unreviewed candidates are not public listings.
- Assets and networks are recorded explicitly.
- Direct-wallet and processor-checkout routes remain distinguishable.
- User submissions cannot update canonical public data automatically.
- Evidence, freshness, source provenance, and licensing remain traceable.
- Sponsorship, support, and partnerships do not determine verification status.
- Public discovery must work on mobile and desktop and must not depend on map-only interaction.

## Local development

Requirements:

- Node.js 24
- npm 11

Commands:

```bash
npm ci
npm run dev
npm run check
npm run build
```

Copy `.env.example` to `.env` only when local configuration is required. Never commit credentials or production secrets.

## Project status

See:

- [Project status](docs/PROJECT_STATUS.md)
- [Repository implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Public product roadmap](docs/ROADMAP.md)

The repository implementation plan is for development tracking. The public product roadmap describes user-facing capabilities. They are intentionally separate.

## Public specifications

### Product and scope

- [Product specification](docs/PRODUCT_SPEC.md)
- [MVP scope](docs/MVP_SCOPE.md)
- [Information architecture](docs/INFORMATION_ARCHITECTURE.md)

### Data and verification

- [Data model](docs/DATA_MODEL.md)
- [Verification policy](docs/VERIFICATION_POLICY.md)
- [Source and license policy](docs/SOURCE_AND_LICENSE_POLICY.md)

### Contributions and media

- [Submission workflow](docs/SUBMISSION_WORKFLOW.md)
- [Media policy](docs/MEDIA_POLICY.md)

### Technical, design, and security

- [Technical architecture](docs/TECH_ARCHITECTURE.md)
- [Design system foundation](docs/DESIGN_SYSTEM.md)
- [Shared UI primitives](docs/UI_PRIMITIVES.md)
- [Motion system](docs/MOTION_SYSTEM.md)
- [State management](docs/STATE_MANAGEMENT.md)
- [Database foundation](docs/DATABASE_FOUNDATION.md)
- [Security and privacy architecture](docs/SECURITY_AND_PRIVACY.md)

### Operations and release

- [Operations](docs/OPERATIONS.md)
- [Migration and cutover](docs/MIGRATION_AND_CUTOVER.md)
- [Launch criteria](docs/LAUNCH_CRITERIA.md)
- [Public product roadmap](docs/ROADMAP.md)

## Development guidance

Repository-wide working rules are defined in [AGENTS.md](AGENTS.md). Pull requests use stable implementation item IDs that are independent from pull request numbers.

## Current phase

Phase 0 public specifications are complete. Phase 1 establishes the application foundation, development tooling, design system base, state-management boundaries, staging path, and quality checks.
