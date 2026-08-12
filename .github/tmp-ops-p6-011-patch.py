from pathlib import Path

MAIN = "5875b2d8cef9f01015434888beb487cd448bc266"

status_path = Path("docs/PROJECT_STATUS.md")
status = status_path.read_text()
marker = "## Retained executable-audit snapshot"
assert marker in status
retained = status[status.index(marker):]
current_refs = "## Current references"
assert current_refs in retained
retained_prefix = retained[:retained.index(current_refs)]

new_top = f'''# CryptoPayMap project status

**Last verified:** 2026-08-12

## Current phase

Phase 6 — Launch and cutover evidence

## Current execution item

OPS-P6-001 — Configured launch authorization, bounded go-live execution, external verification, observation, and launch close (Issue #293)

## Current operational state

P6-07 configured-staging operations and recovery evidence is complete. Issue #349 is closed as completed.

## Authoritative current state

- Exact current `main`: `{MAIN}` from PR #408.
- Configured staging deployment and fixed-review live audit are current on the exact main.
- P6-01 through P6-07 are current on one matched release/data/configuration/environment binding.
- Q1 prerequisite diagnostic run `31588045213` completed with decision `ready`, blockers 0, and exceptions 0.
- Q2 monitoring and alert run `31588257978` was accepted with alert evidence derived from the fresh Q1 binding.
- Q3 backup-integrity run `31588417455` was accepted after encrypted backup generation, integrity verification, and artifact retention.
- Q4 isolated-restore run `31588668939` was accepted. Restore, reconciliation, RPO, RTO, and disposal passed; the isolated target ended with `remainingUserObjectCount: 0`.
- Q5 incident-exercise/final-receipt run `31589176974` was accepted. External reverification, objectives, evidence preservation, and follow-up checks passed without live-service degradation.
- The configured-staging authorization inventory lists P6-01 through P6-07 as current with `predecessorBinding: matched`.
- Authorization remains inventory-only: `state: not_authorized`, with the remaining blocker `explicit_dispatch:required`.
- Temporary dispatcher PR #409 was closed without merge after the exact-main evidence chain completed.
- No production authorization, production DNS change, production cutover, or production canonical mutation has been executed.

Configured state remains:

```text
Configured staging evidence: P6-01 through P6-07 current / accepted
Configured launch authorization: not authorized
Configured production authorization: not authorized
Go-live execution: not executed
Post-cutover verification: not proven
Launch-close evidence: not proven
```

Repository CI, documentation, configured-staging evidence, or an operator assertion alone cannot authorize production. Production requires the separate bounded authorization defined by the P6-08 / OPS-P6-001 contract.

## Next

Continue Issue #293 from the explicit authorization boundary:

1. verify the current P6-01 through P6-07 inventory remains unexpired and bound to exact main `{MAIN}`;
2. perform the separate bounded authorization decision required by `explicit_dispatch:required`;
3. if and only if that authorization is explicitly issued, execute the P6-08 production go-live contract with named launch, observer, and rollback ownership;
4. require external post-cutover verification, observation-window completion, rollback readiness, and immutable launch-close evidence before Phase 6 can close;
5. begin Phase 7 stabilization only after production launch close is proven.

## Blocked

No configured-staging P6-07 implementation or evidence blocker remains.

Production go-live is intentionally blocked by:

- `explicit_dispatch:required`;
- no separate production authorization having been issued;
- no production cutover, post-cutover verification, observation-window completion, or launch-close receipt having been executed.

Protected credentials, database URLs, encryption material, raw account or zone identifiers, private database rows, private Submission data, unrestricted logs, raw Media bytes, and raw object keys must not be placed in public repository or Issue content.


'''

new_refs = '''## Current references

- Issue #293 — OPS-P6-001 configured launch execution and explicit authorization boundary
- Issue #349 — completed configured-staging P6-07 operations and recovery evidence
- Issue #410 — this status reconciliation
- PR #408 — Q5 P6-05 candidate-release marker authority fix
- PR #409 — temporary exact-main dispatcher, closed without merge
- `config/staging-review/deployment-receipt.json` on the `staging-review` branch
- `config/staging-review/p5-02r-live-audit-receipt.json` on the `staging-review` branch
- `config/staging-authorization/authorization-receipt.json` on the `staging-review` branch
- `config/staging-authorization/p6-01-data-qa-receipt.json` through `p6-07-operations-recovery-receipt.json` on the `staging-review` branch
- `docs/P6_08_FINAL_LAUNCH_AUTHORIZATION_GO_LIVE_CLOSE_EVIDENCE.md`
- `docs/OPS_P6_002B_CONFIGURED_STAGING_P6_07_INCIDENT_EXERCISE_FINAL_RECEIPT.md`
- `docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md`
- `docs/LAUNCH_CRITERIA.md`
- `docs/MIGRATION_AND_CUTOVER.md`
- `docs/SECURITY_AND_PRIVACY.md`
'''

status_path.write_text(new_top + retained_prefix + new_refs)

plan_path = Path("docs/IMPLEMENTATION_PLAN.md")
plan = plan_path.read_text()
plan = plan.replace("**Last updated:** 2026-07-29", "**Last updated:** 2026-08-12", 1)
plan = plan.replace(
    "**Status:** Repository definition complete; configured execution active",
    "**Status:** Repository definition complete; configured staging P6-01 through P6-07 accepted; explicit production authorization pending",
    1,
)
plan = plan.replace(
    "| OPS-P6-001 | Execute configured staging and production launch evidence | Active | Issue #293 |",
    "| OPS-P6-001 | Execute configured staging and production launch evidence | Active — staging P6-01 through P6-07 accepted; production authorization pending | Issue #293 |",
    1,
)
needle = "P6-08 merged at `46b89747797e06d62e94f8d974fd1ab0d72dfaff`. The associated repository workflows passed. That result proves the evidence contract is present; it does not prove configured staging or production authorization, execution, verification, or launch close.\n"
assert needle in plan
addition = needle + f'''\n### Current configured execution checkpoint — 2026-08-12\n\nConfigured-staging P6-01 through P6-07 are now current and accepted on exact main `{MAIN}` with one matched binding. Q1 through Q5 completed in runs `31588045213`, `31588257978`, `31588417455`, `31588668939`, and `31589176974`. Q4 proved isolated restore, reconciliation, RPO/RTO, and zero-object disposal; Q5 retained an accepted final receipt after external reverification. Issue #349 is completed.\n\nThe resulting authorization inventory remains `mode: inventory`, `state: not_authorized`, with blocker `explicit_dispatch:required`. This is the intended boundary: configured-staging evidence is complete, while production authorization, cutover, post-cutover verification, observation, and launch close remain unexecuted under Issue #293.\n'''
plan = plan.replace(needle, addition, 1)
plan_path.write_text(plan)
