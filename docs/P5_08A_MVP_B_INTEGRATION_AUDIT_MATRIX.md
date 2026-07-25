# P5-08A — MVP-B integration audit matrix

## Purpose

P5-08 closes Phase 5 by proving that every public Submission family can move through the intended private review and canonical/public ownership boundaries without bypassing privacy, replay, conflict, or retention controls.

P5-08A defines the audit matrix and the bounded implementation sequence. It does not deploy or mutate a configured environment.

## Submission families

| Family | Public intake | Private status | Protected review | Final decision | Canonical application owner | Publication owner | Retention owner |
|---|---|---|---|---|---|---|---|
| Suggest | `/suggest` | Common Submission status boundary | Suggest queue/detail and common follow-up controls | Candidate acceptance or terminal resolution | Candidate promotion or existing-target link receipt binding | Existing export/release lifecycle | P5-07G private retention |
| Payment Report | `/payment-report` | Common Submission status boundary | Report review workspace | Evidence-backed report decision or terminal resolution | Positive payment Evidence and application registration | Existing export/release lifecycle | P5-07G private retention |
| Problem Report | `/report` | Common Submission status boundary | Report review workspace | Correction handoff, negative recheck, duplicate/no-change, or terminal resolution | P5-07D guarded correction/application owners | Existing export/release lifecycle | P5-07G private retention |
| Business Claim | `/claim` | Common Submission status boundary | Business Claim review workspace | Relationship, field, payment, and terminal decisions | P5-07E payment application and field-provenance owners | Existing export/release lifecycle | P5-07G private retention |
| Photos | `/photos` | Common Submission status boundary with bounded Media projection | Photos parent and Media review workspaces | Child Media decisions plus parent aggregate resolution | P5-07F exact Media decision receipt binding | Existing Media/export/release lifecycle | P5-05F and P5-07G cleanup owners |

## Cross-cutting audit dimensions

Every family must be checked against the same dimensions.

1. Public requests cannot mutate Candidate, canonical, export, release, or public state directly.
2. Original and normalized private payloads remain bounded and non-public.
3. Status reads require the opaque public reference and valid follow-up secret.
4. Protected review requires the exact capability and subject boundary.
5. Final decisions are exact-state guarded and replay-safe.
6. Canonical application uses one explicit type-specific owner and durable receipt.
7. Application completion and publication completion remain separate.
8. Export and release activation remain controlled by the existing publication lifecycle.
9. Private retention cannot mutate canonical facts, review decisions, relationships, hashes, receipts, export, release, publication, or public state.
10. Changed-content request reuse, stale state, incomplete prerequisites, and partial failures fail closed.

## Evidence classes

### Repository-executable evidence

- runtime schema and contract checks;
- focused service and API tests;
- browser/component tests;
- migration drift checks;
- static source-owner audits;
- build, accessibility, and staging artifact checks;
- P5-07G/P5-07H retention invariants.

### Configured-environment evidence

The following remain Phase 6 launch gates and are not satisfied by P5-08 repository checks:

- live Cloudflare Access identity and allowlist verification;
- deployed Functions environment and secret binding verification;
- live Neon migration and transaction execution;
- representative protected Admin journeys;
- private upload to Media review and release handoff;
- canonical correction to export, release, and activation;
- R2 conditional writes and publication behavior;
- production scheduler binding for retention;
- production restore persistence, invocation, reconciliation, and replay drills.

## P5-08 sequence

| ID | Responsibility | Completion boundary |
|---|---|---|
| P5-08A | Audit matrix, ownership inventory, and project-status reconciliation | Every family and audit dimension has one explicit owner; repository and configured checks are separated |
| P5-08B | Public intake and private-status integration audit | All five public intake families, abuse controls, private persistence, secret status reads, and leakage boundaries are executable and green |
| P5-08C | Protected review and decision integration audit | Queue/detail reachability, capabilities, follow-up controls, final decisions, replay, and conflict behavior are executable and green |
| P5-08D | Canonical application and publication-handoff integration audit | Every approved outcome resolves to one exact application receipt and preserves separate publication ownership |
| P5-08E | Privacy, retention, replay, conflict, and partial-failure audit | Restricted data lifecycle and failure behavior are proven across all families without canonical/public mutation |
| P5-08F | Final MVP-B audit receipt and Phase 6 handoff | One final executable receipt records repository completion and the unresolved configured launch gates |

## P5-08A completion checks

- P5-07H is recorded as merged and P5-07 is repository-complete.
- P5-08A is the active implementation item.
- The five Submission families are present in the matrix.
- Application and publication ownership are explicitly separate.
- Repository-executable and configured-environment evidence are explicitly separate.
- P5-08B through P5-08F have one bounded responsibility each.
- No launch-readiness, production deployment, or live mutation claim is made.

## Explicit exclusions

No public or protected runtime mutation is added by P5-08A. No migration, production deployment, live database/object-store execution, Cron binding, DNS cutover, or launch-readiness claim is included.
