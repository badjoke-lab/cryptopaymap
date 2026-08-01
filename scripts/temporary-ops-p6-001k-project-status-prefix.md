# CryptoPayMap project status

**Last verified:** 2026-08-01

## Current phase

Phase 6 — Launch and cutover evidence

## Current execution item

OPS-P6-001 — Configured launch authorization, bounded go-live execution, external verification, observation, and launch close (Issue #293)

## Current operational slice

OPS-P6-001K — Repair minimum Cloudflare DNS read permission and rerun the configured staging P6-06 topology diagnostic (Issue #335)

## Authoritative current state

- P6-08 repository definition work is complete. Repository contracts alone do not authorize configured staging or production launch.
- Configured staging P6-01 through P6-05 were last refreshed and accepted together on exact main `46da212281bfbf80d0318747129217026a788328` with one shared release/data/configuration/environment binding.
- The accepted P6-04 receipt proved the configured R2 Media lifecycle, replay behavior, public delivery, takedown, and complete fixture cleanup.
- The accepted P6-05 receipt proved deterministic public generation, safe Pages topology, authenticated historical releases, candidate activation, representative external checks, baseline rollback, and candidate restoration.
- The read-only P6-06 topology diagnostic completed on `46da212281bfbf80d0318747129217026a788328` with state `diagnosed` and decision `permission_blocked`.
- The diagnostic verified the Cloudflare token, Pages project, production branch, expected Pages platform hostname, active-zone listing, exact-main predecessors, and shared binding. DNS record listing failed with HTTP 403 because the token lacked the required DNS read permission.
- PR #336 merged the scoped-zone remediation. Current main is `9e83dade38ec01ec451ad8591daac3d519d024df`.
- The P6-06 diagnostic now requires protected `P6_06_STAGING_ZONE_ID`, selects exactly one matching active zone, reads DNS records only for that selected zone, and fails closed on a missing or ambiguous zone match.
- No DNS record, custom-domain binding, production hostname, certificate, redirect, cache, canonical data, or production deployment was changed.
- Because main changed after the last configured evidence refresh, deployment, live audit, and P6-01 through P6-05 must be refreshed on `9e83dade38ec01ec451ad8591daac3d519d024df` after the protected configuration is repaired.

Configured state remains:

```text
Configured staging authorization: not authorized
Configured production authorization: not authorized
Go-live execution: not executed
Post-cutover verification: not proven
Launch-close evidence: not proven
```

Repository CI, documentation, provider control-plane success, or an operator assertion alone cannot change those configured states.

## Next

Complete OPS-P6-001K in Issue #335:

1. update the protected Cloudflare API token used by configured staging workflows so it preserves required Pages access and has only `Zone / DNS / Read` for the intended isolated staging zone;
2. set the GitHub Actions secret `P6_06_STAGING_ZONE_ID` to the intended zone's Cloudflare zone identifier without placing the value in the repository, an Issue, a PR, or logs;
3. refresh the exact-main configured staging deployment and fixed-review live audit on `9e83dade38ec01ec451ad8591daac3d519d024df`;
4. refresh P6-01 through P6-05 on the same exact-main binding;
5. rerun the read-only P6-06 topology diagnostic and require `dnsList: success` plus exactly one safe zone match;
6. use the resulting `existing_candidate_requires_approval`, `no_candidate`, `ambiguous`, or `unsafe_topology` decision to define the next bounded P6-06 plan;
7. do not perform a DNS or custom-domain mutation until that separate plan is reviewed and explicitly authorized.

## Blocked

No repository implementation or CI blocker remains for the read-only P6-06 topology diagnostic.

Configured P6-06 execution is blocked by two protected settings outside the public repository:

- minimum zone-scoped Cloudflare `DNS Read` permission on the configured token;
- GitHub Actions secret `P6_06_STAGING_ZONE_ID` for the intended isolated staging zone.

P6-06 acceptance, P6-07, configured staging authorization, and all production work remain blocked until the read-only diagnostic succeeds and the later evidence procedures are executed. Production remains untouched.

Protected operational credentials, raw account or zone identifiers, private database material, private Submission data, unrestricted database rows, raw Media fixture bytes, and raw object keys must not be placed in the public repository or public Issue content.

