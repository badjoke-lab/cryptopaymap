# OPS-P6-002B configured staging P6-07 incident exercise and final receipt

## Purpose

This slice implements Q5 incident exercise and final P6-07 receipt for Issue #349 after an accepted exact-main Q4 isolated-restore receipt. It converts the previously defined incident-response contract into a bounded configured-staging executor and a redacted final evidence receipt.

Repository validation proves only that this executor and its failure matrix are present and internally consistent. Configured evidence exists only after a protected workflow dispatch completes on exact current `main` with current accepted predecessors.

## Required predecessors

The executor fails closed unless all of the following are current, unexpired, accepted where applicable, and bound to the same exact commit, release, data snapshot, configuration, and environment identities:

- configured staging deployment and fixed-review live audit;
- P6-01 through P6-06;
- Q1 prerequisite diagnostic with decision `ready` and no blockers;
- Q2 monitoring and alert evidence;
- Q3 encrypted backup-integrity evidence;
- Q4 isolated restore, reconciliation, measured RPO/RTO, private-data exclusion, and disposal evidence.

Q4 must prove that the restore target was distinct, every private Submission table remained at zero restored rows, the recovery objectives passed, and disposal left zero user objects.

## Exercise boundary

The exercise uses no intentional live-service degradation. It does not mutate production, DNS, Pages topology, R2, canonical data, any database, a backup artifact, a restore target, or an active release.

The selected scenario is simulated as a command-and-decision exercise while the actual configured staging service is checked read-only. Supported scenarios are:

- `stale_monitoring`;
- `failed_release_verification`;
- `canonical_database_degradation`;
- `media_delivery_degradation`;
- `domain_or_certificate_failure`.

Each run requires one immutable incident identity, one command owner, one independent observer, and one follow-up owner. GitHub Actions concurrency serializes command ownership, and an incident identity already retained in the final receipt cannot be reused.

## Timeline and objectives

The retained ordered timeline covers:

1. declaration;
2. detection;
3. acknowledgement;
4. containment;
5. rollback-or-restore decision;
6. mitigation start;
7. recovery verification;
8. external reverification;
9. closure;
10. follow-up assignment.

The dispatch must set objectives within these hard ceilings:

- acknowledgement within 15 minutes;
- mitigation decision within 30 minutes;
- recovery within 45 minutes;
- status-update cadence no slower than 30 minutes.

An objective breach rejects the receipt. A successful workflow cannot silently override a missed objective.

## Communication and external reverification

The accepted Q2 monitoring and alert receipt is the bounded communication-channel predecessor. The Q5 workflow also writes idempotent declaration and closure markers to Issue #349.

Before closure, configured staging is externally reverified through:

- the home route;
- representative Location and Business routes;
- `/version.json`;
- `/data/manifest.json`;
- protected Admin denial;
- `/p6-05-release.json` matching the intended active-release identity, not HTTP status alone.

Service and release identity must be externally reverified before closure.

## Final receipt

The workflow writes only the redacted file:

`config/staging-authorization/p6-07-operations-recovery-receipt.json`

The final receipt has `evidenceId: P6-07`, `exerciseId: P6-07-Q5`, and can be `accepted` only when:

- every predecessor is current on one binding;
- the incident identity is unique;
- the command owner is serialized;
- the scenario and objectives are valid;
- the timeline is complete and ordered;
- containment and the rollback-or-restore decision are recorded;
- all objectives pass;
- external reverification passes;
- evidence preservation is redacted and digest-bound;
- follow-up ownership and due time are retained;
- no high-severity exception remains.

No credential, GitHub token, database URL, encryption key, private Submission content, raw provider identifier, raw object key, or unrestricted log may enter the receipt.

## Authorization inventory

After writing the final receipt, the workflow reruns the existing configured-staging authorization evaluator in inventory mode. Inventory mode cannot authorize launch. It can only report whether P6-01 through P6-07 are current and identify remaining blockers.

An explicit separate authorization dispatch is still required. P6-08 remains the separate final launch gate for production authorization, go-live execution, post-cutover verification, observation, rollback, and launch close.

## Failure matrix

The executor rejects the receipt on any of the following:

- wrong confirmation or non-current `main`;
- missing, stale, rejected, wrong-commit, or wrong-binding predecessor;
- Q1 not ready;
- Q2, Q3, or Q4 not accepted;
- reused incident identity or concurrent command claim;
- invalid owner, scenario, severity, cadence, or objective;
- missing or out-of-order timeline stage;
- acknowledgement, decision, recovery, or cadence breach;
- wrong active release despite HTTP 200;
- failed public route, machine-readable file, or protected Admin check;
- unresolved exception, failed evidence preservation, or missing follow-up ownership;
- sensitive-data leakage;
- any production or configured-service mutation outside this read-only exercise boundary.

Parent: #349 and #293. Implementation Issue: #370.
