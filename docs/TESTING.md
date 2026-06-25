# CryptoPayMap testing and quality foundation

## Purpose

P1-07 defines deterministic repository checks for formatting, linting, type safety, runtime schemas, migration history, unit behavior, component behavior, and the static build.

## Commands

```bash
npm run format
npm run format:check
npm run lint
npm run check
npm run schema:check
npm run db:check
npm run test
npm run test:watch
npm run build
npm run quality
```

`npm run quality` runs the complete local quality sequence.

## Tool ownership

- Biome owns formatting and linting for supported JavaScript, TypeScript, JSON, and CSS files.
- Astro Check owns Astro and TypeScript diagnostics.
- Vitest owns unit and component tests.
- Testing Library owns user-oriented React component interaction tests.
- Zod runtime checks verify representative shared schemas.
- Drizzle Kit checks committed migration history.
- Astro build proves the public static output remains buildable.

## Initial tests

The first test suite covers:

- discovery URL normalization and deterministic serialization;
- exclusion of unsupported public filter values;
- per-application Zustand store isolation;
- ephemeral-state reset and bounds;
- Button activation and loading behavior;
- runtime schema acceptance and rejection;
- separation of route type and payment method.

These tests establish extension points rather than claiming complete product coverage.

## Test placement

```text
tests/
├─ setup.ts
├─ discovery-url.test.ts
├─ discovery-store.test.ts
├─ button.test.tsx
└─ runtime-schemas.test.ts
```

Future test groups may be placed alongside these by responsibility:

```text
tests/unit/
tests/components/
tests/integration/
tests/accessibility/
tests/data/
e2e/
```

## CI behavior

The foundation workflow runs on pull requests to `main` and development branches.

Checks are fail closed. A failed command fails the job even though later checks continue so that one run can report multiple independent problems.

The workflow preserves separate logs for:

- formatting;
- linting;
- Astro and TypeScript;
- runtime schemas;
- migration history;
- tests;
- static build.

A successful build does not cancel a failed lint, test, schema, or migration check.

## Test-writing rules

- Test public behavior and contracts rather than implementation trivia.
- Prefer user-visible roles and labels in component tests.
- Keep unit tests deterministic and independent from live services.
- Do not connect to production or staging databases in ordinary test runs.
- Do not place private records, contact details, credentials, or real evidence in fixtures.
- Use fictional or explicitly synthetic public fixtures.
- Keep Candidate and private workflow data out of public-output fixtures.
- Add a regression test when repairing a reproducible defect where practical.

## Environment isolation

The default Vitest environment is jsdom for React component support. Tests that require a pure Node environment may declare it explicitly.

Ordinary tests do not require:

- a live PostgreSQL database;
- Cloudflare credentials;
- R2 access;
- private submission data;
- network access.

## Later extensions

P1-10 adds automated accessibility checks and manual keyboard requirements.

Public feature phases add route and interaction coverage.

Submission and administration phases add protected workflow tests.

Playwright end-to-end coverage is added when stable multi-page flows and staging infrastructure exist.
