# Export release integration audit

**Implementation item:** P3-11M  
**Status:** Repository audit in progress

## Scope

This audit verifies the repository path established by P3-11A through P3-11M:

```text
private validated export candidate
→ exact reviewer release decision
→ durable release decision receipt
→ controlled publication authorization
→ immutable release-object staging
→ conditional active-pointer activation
→ durable activation history
→ bounded release-history read model and API
→ restore preparation against active and target history
→ pointer inventory and target-object preflight
→ conditional restore pointer switching
→ durable restore execution record
→ request replay without repeated pointer mutation
```

## Release-decision boundary

- Candidate artifacts remain private before release.
- Server-side validation is repeated before decision and publication.
- `export:release` and `export:publish` remain separate capabilities.
- Approval pins the exact snapshot digest, artifact count, dataset version, schema version, and generation time.
- Blocked candidates cannot be approved.
- Release decisions use request identity and deterministic conflict handling.

## Publication boundary

- Publication loads the exact approved release receipt.
- The private candidate is revalidated before activation.
- Release objects use deterministic immutable snapshot-prefixed keys.
- Object metadata and content hashes are checked before pointer activation.
- The active pointer changes only with the expected current version token or ETag.
- Snapshot-level replay returns the existing active release instead of mutating the pointer again.

## Durable history boundary

- Successful activation is recorded with request identity, approval identity, actor, reason, snapshot metadata, previous snapshot, pointer key, release prefix, and artifact count.
- Request-level replay and conflict handling are durable.
- Release history reads are bounded and protected.
- The newest durable activation is marked as the current snapshot in the repository read model.

## Restore boundary

Restore preparation validates:

- `export:publish` authority
- target snapshot existence
- expected active snapshot
- target and active snapshot difference
- durable target pointer inventory availability

A target without pointer inventory remains blocked. A validated target with durable pointer inventory is now returned as `ready_for_execution`.

Execution then:

1. validates the restore request and inventory relationship before mutation
2. checks request replay before pointer switching
3. inspects every target object against key, ETag, SHA-256, content type, and byte size
4. conditionally switches each pointer using its expected current ETag
5. validates switch receipts
6. persists the exact completed restore execution record
7. replays an existing completed request without switching pointers again

If pointer switching succeeds but execution-record persistence fails, the workflow raises an explicit post-switch persistence error carrying the validated switch receipts for operator reconciliation.

## Automated verification

The repository validates:

- release and publication authorization separation
- candidate validation and exact approval guards
- durable release-decision persistence and migration drift
- protected release queue, detail API, decision endpoint, and reviewer UI
- immutable activation plans and deterministic object keys
- active-pointer race detection and replay
- durable activation history and request replay
- bounded release-history reads and protected API behavior
- restore authorization and active-target race guards
- restore readiness only when durable pointer inventory exists
- target-object preflight before restore mutation
- conditional pointer replacement receipt validation
- restore execution-record fingerprinting, replay, and conflict behavior
- readiness-to-execution integration and no-repeat restore replay
- formatting, lint, type checking, runtime checks, tests, build, accessibility, and staging artifact validation

## Deferred live verification

The repository implementation does not claim completion of:

- live Cloudflare Access policy verification
- production actor allowlist values
- concrete production R2 restore adapter wiring
- live R2 conditional-write behavior
- live Neon migration execution
- durable restore execution table deployment
- production release and restore drills
- public restore controls

These are deployment or later implementation tasks and do not change the repository-level P3-11 boundary.

## Handoff

After this audit is green and merged, P3-11 is repository-complete and P3-12 may begin the cross-domain audit-history and Phase 3 integration audit.

P3-12 must treat GitHub main, merged pull requests, CI, durable decision schemas, activation history, and explicit deferred live-verification items as authoritative inputs.
