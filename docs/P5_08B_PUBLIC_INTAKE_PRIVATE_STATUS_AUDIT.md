# P5-08B — Public intake and private-status integration audit

## Purpose

P5-08B verifies the repository boundary from public Submission intake through bounded private-status reads for Suggest, Payment Report, Problem Report, Business Claim, and Photos.

It proves repository wiring and contracts only. It does not deploy configured Cloudflare, Neon, R2, or production scheduler bindings.

## Family coverage

| Family | Public route | Type-specific intake evidence | Private-status evidence |
|---|---|---|---|
| Suggest | `/suggest` | Suggest contract, private intake, public route/form, abuse-control and configured-deployment checks | Common private status plus Suggest workflow projection |
| Payment Report | `/payment-report` | Report contract, report private intake, public intake, public form | Common private status plus report decision/status projection |
| Problem Report | `/report` | Report contract, report private intake, public intake, public form | Common private status plus correction/terminal status projection |
| Business Claim | `/claim` | Business Claim contract and private intake | Common private status plus claim verification/review projection |
| Photos | `/photos` | Photo/Media contract and public form/upload boundary | Common private status with bounded Media decision projection |

## Required invariants

1. Every family enters the common private Submission persistence boundary.
2. Public intake never directly mutates Candidate, Entity, Location, Claim, Claim Asset, Evidence decision, Media decision, export, release, publication, or public state.
3. Original and normalized payloads, encrypted contact values, upload identities, reviewer notes, and backend errors remain private.
4. Deterministic replay returns the stored receipt; changed-content reuse conflicts.
5. Abuse control is evaluated before private intake where the route contract requires it.
6. Private-status reads require both the opaque public reference and a valid follow-up secret.
7. Missing references and incorrect secrets use the same bounded public failure.
8. Type-specific status projections expose only approved public fields and suppress stale private messages.
9. Photos exposes only bounded Media decision state and no private storage identity.
10. No repository check in this slice claims configured-environment or production evidence.

## Executable evidence

Run:

```sh
node scripts/check-p5-08b-public-intake-private-status-audit.js
```

The audit verifies that the normal schema chain retains the common foundation checks and every family-specific public-intake/private-status owner required by this slice. It also verifies the P5-08A handoff and current project status.

A dedicated GitHub Actions workflow runs the same command whenever the audited files change.

## Configured evidence retained for Phase 6

The following are not satisfied by this repository audit:

- live Turnstile verification;
- deployed Durable Object rate limiting;
- trusted Cloudflare edge identity in the configured environment;
- live secret and encryption-key bindings;
- live Neon private persistence and status reads;
- representative browser journeys against deployed routes;
- live private upload/object-store behavior.

## Completion boundary

P5-08B is complete when the five public intake families, common private persistence/status ownership, abuse-control owners, bounded leakage rules, replay/conflict checks, and dedicated audit workflow are green in normal CI.

P5-08C remains the next owner for protected review and final-decision integration.

## Explicit exclusions

No protected review mutation, final decision, canonical application, export/release activation, retention execution, migration, production deployment, live database/object-store mutation, DNS cutover, or launch-readiness claim is included.