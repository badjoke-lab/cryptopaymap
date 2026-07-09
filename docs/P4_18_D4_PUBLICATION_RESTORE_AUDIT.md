# P4-18D4 publication, restore, and Audit integration audit

**Implementation item:** P4-18D4  
**Status:** Active  
**Last updated:** 2026-07-09

## Purpose

P4-18D4 classifies the repository and operator boundaries after export release approval. It distinguishes implemented protected routes, implemented non-UI services, repository-only contracts, and environment or launch work.

This audit does not treat repository tests as live Cloudflare Access, Neon, or R2 verification.

## Result summary

| Boundary | Repository state | Operator classification | D4 result |
|---|---|---|---|
| Export candidate review and release decision | protected Admin UI and API | reachable UI operation | implemented |
| Publication activation | protected POST API | explicit non-UI protected operation | implemented repository boundary |
| Release history | protected GET API/read model | explicit non-UI protected read boundary | implemented repository boundary |
| Restore preparation | contract/service only | non-UI repository contract | not production-operational |
| Restore pointer switching and execution workflow | adapter-driven repository workflow | non-UI repository contract | not production-operational |
| Restore execution persistence | interface and in-memory/test coverage only; no repository Drizzle table/backend source | absent production persistence boundary | launch work required |
| Export release Audit history | durable Drizzle source | protected Audit UI/API | implemented |
| Export activation Audit history | durable Drizzle source | protected Audit UI/API | implemented |
| Restore execution Audit history | normalizer exists, but no durable Drizzle source because no production restore execution table exists | unavailable until persistence exists | launch work required |
| Location correction Audit history | separate Drizzle source appended by the protected Audit route | protected Audit UI/API | implemented |
| Manual versus scheduled reconfirmation expiration attribution | durable expiration rows preserve actor ID; manual protected expiration uses the Access-derived actor ID while scheduled execution uses its scheduled system actor ID | distinguishable by actor ID even though expiration semantics use system actor type | implemented repository distinction |

## 1. Release decision and publication capability separation

The release reviewer UI commits only release decisions through the export decision endpoint. It does not activate public artifacts.

Publication activation is a separate protected POST boundary and requires `export:publish`. Release review and publication remain separate authorization families and must not be collapsed.

D4 classification:

- release decision: reachable protected UI operation;
- publication activation: explicit non-UI protected operation;
- live publication activation: P4-18E or launch verification depending on configured environment availability.

## 2. Release history classification

Release history has a bounded protected GET API and durable read model. There is no dedicated release-history Admin page in the current operator navigation.

D4 classifies release history as an explicit non-UI protected read boundary. This is accurate repository capability and does not imply a production drill.

## 3. Restore implementation boundary

The repository contains:

- restore request and readiness contracts;
- pointer inventory validation;
- target-object preflight;
- conditional pointer switching adapter contracts;
- restore execution record schema and service contract;
- replay and changed-content conflict handling;
- a composed restore workflow;
- explicit `execution_record_failed_after_switch` error behavior carrying validated switch receipts;
- a restore Audit normalizer.

The repository does **not** currently contain a complete production restore execution path. In particular, D4 found no production restore execution table, no Drizzle restore execution backend, and no protected restore execution route wired to a concrete production adapter.

Therefore D4 must not describe restore as production-operational.

### Required launch work

Before launch readiness can claim that previous valid public artifacts can be restored, launch work must provide and verify:

1. concrete production restore execution persistence;
2. concrete R2 pointer inspection and conditional replacement adapter wiring;
3. a protected invocation boundary with `export:publish` authorization and idempotency identity;
4. post-switch persistence reconciliation procedure using preserved switch receipts;
5. durable restore execution Audit source registration;
6. live restore drill and replay verification;
7. operator runbook for partial/post-switch failure reconciliation.

This work may be implemented before or during launch preparation, but it is not silently treated as complete by P4-18D.

## 4. Post-switch persistence failure classification

The repository workflow explicitly distinguishes pointer-switch failure from execution-record persistence failure after successful switching.

When persistence fails after pointer switching, the workflow raises `execution_record_failed_after_switch` and retains the validated switch receipts on the error object for operator reconciliation.

D4 result:

- repository failure contract: implemented;
- production reconciliation path: not implemented and assigned to launch work;
- D4 does not weaken or hide the failure state.

## 5. Audit visibility and privacy classification

The protected Audit API aggregates durable sources and normalizes metadata-only history.

D4 confirms:

- export release decisions are sourced from durable release decision rows;
- export activation is sourced from durable activation rows;
- Location correction is appended as a dedicated Drizzle source by the protected Audit route;
- restore execution has a normalizer but no durable source registration because no production restore execution table exists;
- arbitrary internal notes and raw payloads are not part of the normalized Audit item contract.

Restore Audit visibility must remain unavailable until a real durable source exists. A synthetic or in-memory restore record must not be presented as durable Audit history.

## 6. Reconfirmation attribution classification

Manual protected expiration and scheduled expiration intentionally share system expiration semantics, but they remain distinguishable in durable history by actor identity:

- manual protected expiration authorization preserves the verified Access-derived normalized actor ID and sets expiration actor type to `system`;
- scheduled expiration uses the scheduled run context actor ID and system actor type;
- the Audit normalizer preserves both actor ID and actor type.

D4 result: repository attribution is distinguishable without changing expiration semantics. P4-18E may verify configured live actor identities only when the environment is available.

## 7. Environment-specific inventory updates

The following remain outside repository proof:

- live Cloudflare Access publication policy behavior;
- actual release and publish allowlist values;
- live Neon migration state;
- concrete production R2 publication adapter behavior;
- live R2 conditional-write behavior;
- production restore persistence and invocation wiring;
- production release and restore drills;
- configured restore reconciliation procedure after a post-switch persistence failure.

These items must be classified precisely by P4-18D5/P4-18E or later launch work. Generic deferred-verification wording is not sufficient.

## Completion basis

P4-18D4 is complete when:

- capability separation remains enforced;
- publication and release-history non-UI boundaries are explicitly classified;
- restore repository contracts are not mislabeled as production-operational;
- the restore persistence/wiring/Audit-source gap is explicitly assigned to launch work;
- Audit source coverage and exclusions are accurate;
- manual and scheduled reconfirmation attribution remains distinguishable;
- repository validation is green.

## Next

After D4 is green, execute P4-18D5 closure and environment-specific inventory reconciliation. D5 must update the parent P4-18D audit status, reconcile all D1-D4 results, and hand off to P4-18E only when repository findings are closed or explicitly assigned.
