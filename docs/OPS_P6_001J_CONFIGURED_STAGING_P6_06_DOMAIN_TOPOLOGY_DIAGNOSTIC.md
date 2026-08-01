# OPS-P6-001J — Configured staging P6-06 domain topology diagnostic

## Purpose

Read and classify the configured Cloudflare Pages, zone, DNS, custom-domain, and rollback topology required for P6-06 before any mutation is permitted.

This diagnostic is not P6-06 acceptance evidence. It determines the exact next execution boundary and fails closed when the topology is missing, ambiguous, inaccessible, or inconsistent.

## Exact-main boundary

Execution requires:

- exact current `main` commit;
- current accepted P6-01 through P6-05 receipts on the same commit;
- one matching release/data/configuration/environment binding;
- the exact confirmation `DIAGNOSE_CONFIGURED_STAGING_P6_06`;
- a bounded domain owner identity;
- successful repository and execution-contract checks;
- one protected `P6_06_STAGING_ZONE_ID` secret identifying the isolated staging zone.

A changed main commit, stale predecessor, mismatched binding, missing credential, or unexpected Pages project stops the diagnostic.

## Read-only provider boundary

The diagnostic may only:

- verify the Cloudflare API token;
- read the configured account's Pages project;
- read project domain and successful deployment inventory;
- list active zones visible to the token;
- select exactly one zone matching the protected `P6_06_STAGING_ZONE_ID`;
- list DNS records only for that selected zone;
- compare project domains with DNS record names and targets;
- produce bounded redacted evidence.

It must not create, update, delete, bind, activate, purge, roll back, or otherwise mutate a DNS record, zone, Pages project, custom domain, deployment, certificate, cache rule, redirect rule, Worker route, or production resource.

## Classification

The diagnostic returns one decision:

- `existing_candidate_requires_approval`: exactly one project custom domain has exactly one corresponding DNS record candidate;
- `no_candidate`: no project custom domain or DNS record targets the isolated staging project;
- `ambiguous`: multiple custom domains, multiple matching records, or inconsistent project and DNS inventories exist;
- `permission_blocked`: the token cannot read the required zone or DNS inventory;
- `unsafe_topology`: the Pages project, production branch, platform domain, account boundary, or protected expected-zone identity does not match the configured staging contract.

No decision authorizes a cutover. Even an existing candidate requires a separately bounded mutation plan and explicit approval.

## Redaction

The retained diagnostic may include only:

- exact source commit, timestamps, and expiry;
- bounded owner hash;
- predecessor states and shared binding;
- token, Pages, zone-list, and DNS-list permission outcomes;
- Pages production branch and platform-domain presence booleans;
- counts of custom domains, visible active zones, selected zones, DNS records, successful production deployments, and matching candidates;
- hashes of candidate hostnames, zone names, record targets, and deployment identifiers;
- DNS record type, proxy-state class, and TTL class;
- one bounded decision and bounded exception classes.

It must not retain account IDs, zone IDs, record IDs, raw hostnames, raw zone names, registrar credentials, DNS tokens, deployment credentials, private keys, unrestricted provider responses, or private canonical data.

## Receipt

The workflow publishes:

`config/staging-authorization/p6-06-domain-topology-diagnostic.json`

The receipt state is `diagnosed` only when exact-main and predecessor checks pass and the Pages project is read successfully. A diagnostic decision may still be `no_candidate`, `ambiguous`, or `permission_blocked`.

The diagnostic receipt is never accepted as `p6-06-domain-cutover-rollback-receipt.json` and cannot satisfy configured launch authorization.

## Next step

After the diagnostic:

- an existing single candidate may be used only after its raw hostname, zone, prior state, target, and rollback target are approved in a protected execution input;
- no candidate requires a new explicitly approved isolated staging hostname and DNS plan;
- ambiguous topology must be reconciled without mutation before retry;
- permission failure requires minimum `Zone / DNS / Read` access only for the protected expected zone before the diagnostic is retried; later mutation permissions remain a separate approval.

## Boundary

No production CryptoPayMap hostname, production deployment, DNS record, custom-domain binding, canonical data, private Submission/Evidence/Media, credential, or launch authorization is changed by this slice.
