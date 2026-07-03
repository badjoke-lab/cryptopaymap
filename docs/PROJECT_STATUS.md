# CryptoPayMap project status

**Last verified:** 2026-07-04

## Current phase

Phase 3 — Administration and review

## Current implementation item

P3-11 — Export controls and release workflow

## Active work

- P3-11A — export release authorization and decision contract
- Branch: `work/p311a`
- Pull request: not opened yet

## Latest completed work

- Phase 2 completed through pull request #40
- P3-01 through P3-06 completed through pull request #47
- P3-07 completed through pull request #58
- P3-08 completed through pull request #63
- P3-09 completed through pull request #67
- P3-10 completed through pull request #74

## P3-11A in progress

- isolated `export:release` capability
- explicit actor allowlist and idempotency key
- internally prepared eligible or blocked release candidate
- exact snapshot digest, artifact count, version, schema, and generated-time guards
- approve and reject decision shapes
- validation issue capture
- deterministic request fingerprint and replay boundary
- contract, authorization, and runtime tests

## Next

1. Complete P3-11A validation and merge its pull request.
2. Add durable export release decision persistence.
3. Add the protected export queue and release workspace.

## Blocked

No repository blocker. Live Access, database, public deployment, and production verification remain deferred.

## Verification rule

The actual main branch, merged pull requests, and CI results are authoritative.
