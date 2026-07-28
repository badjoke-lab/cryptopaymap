# P6-05 — Configured public export and release evidence

## Decision

Repository-complete publication code is not configured-environment proof. P6-05 is a launch-blocking evidence gate for public projection generation, validation, immutable release creation, activation, rollback, cache propagation, and externally observable publication.

Configured staging evidence: `unproven`.

Configured production evidence: `unproven`.

Neither environment may be marked `passed` without executed procedures and retained redacted artifacts.

## Required state separation

The configured flow keeps these states distinct:

1. canonical application complete;
2. public projection generated;
3. projection validated;
4. immutable release created;
5. release selected for activation;
6. activation completed;
7. caches propagated or purged;
8. externally observable publication verified.

Canonical commit, export generation, release creation, and activation are not interchangeable proof states.

## Projection generation

Evidence must bind the export to:

- source revision;
- migration revision;
- canonical snapshot or transaction boundary;
- generator revision;
- projection schema revision;
- deterministic record ordering;
- manifest digest;
- per-file or per-object digests;
- record counts by public entity class;
- excluded private and candidate records.

Re-running against the same snapshot and generator must produce the same manifest and object digests, except for explicitly declared non-semantic metadata.

## Validation gate

A release cannot be created or activated unless validation proves:

- schema conformance;
- referential integrity;
- required provenance and evidence references;
- license and attribution completeness;
- privacy-field exclusion;
- candidate and unreviewed-record exclusion;
- record-count reconciliation;
- route and link validity;
- required assets and approved media availability;
- version, manifest, llms.txt, ai.txt, robots, sitemap, API, and error-route presence;
- no high-severity validation exception.

Failed validation leaves the current active release unchanged.

## Immutable release creation

A created release must have:

- one immutable release identity;
- manifest digest;
- projection-object digests;
- source and generator revisions;
- validation receipt digest;
- creation timestamp;
- creator identity;
- activation state initially inactive.

Mutating an existing release in place is forbidden. Changed content requires a new release identity.

## Activation

Activation must change only the bounded active-release pointer or equivalent selected-release state. Evidence proves:

- the selected release passed validation;
- the expected prior active release matches;
- stale activation requests fail closed;
- concurrent activation attempts produce one final selected release;
- duplicate activation is idempotent;
- partial activation does not expose a mixed release;
- rollback remains available.

## Failure and conflict matrix

| Case | Required result |
| --- | --- |
| Invalid schema or broken reference | release creation or activation denied |
| Private field present | validation failure; no activation |
| Unreviewed candidate included | validation failure; no activation |
| Partial object upload | release incomplete and inactive |
| Source snapshot changes during generation | stale export rejected or restarted |
| Duplicate release creation | deterministic prior result or distinct immutable identity without overwrite |
| Concurrent activation | one winner; no mixed active state |
| Stale expected active release | conflict; no activation |
| Cache propagation failure | activation not marked externally verified |
| External version mismatch | publication evidence fails closed |

## Rollback

A configured rollback proves:

1. prior immutable release still exists and remains digest-verifiable;
2. rollback changes the active-release pointer only;
3. no canonical data is mutated;
4. cache purge or version propagation executes;
5. external checks observe the prior release again;
6. rollback receipt links the failed and restored release identities;
7. rollback failure does not claim recovery.

## External verification

After activation or rollback, evidence checks from outside the deployment control plane:

- `/version.json`;
- `/data/manifest.json`;
- representative list and detail pages;
- representative API or machine-readable endpoints;
- approved public media;
- `llms.txt`;
- `ai.txt`;
- `robots.txt` and sitemap where applicable;
- canonical and alternate links;
- expected 404 and error behavior;
- release identity and manifest digest consistency;
- cache headers and propagation window.

A control-plane success response alone is not externally observable publication proof.

## Evidence receipt metadata

Each environment receipt records:

- evidence id and environment;
- source, migration, generator, and schema revisions;
- canonical snapshot identity or digest;
- release identity;
- manifest and object digests;
- public record counts;
- validation result classes and receipt digest;
- prior and selected active release identities;
- activation or rollback receipt digest;
- cache purge or version receipt safe identifier;
- external check locations, timestamps, and result digests;
- exceptions, operator, expiry, and artifact digest.

No credential, service token, private canonical payload, unrestricted export, private contact value, or secret deployment header may appear in retained artifacts.

## Pass rule

An environment may be marked `passed` only when deterministic generation, complete validation, immutable release creation, bounded activation, failure cases, rollback, cache propagation, and external verification all pass with retained digest-verified artifacts.

Repository audit passing means only that this evidence contract is present and internally consistent.

## Recheck rule

Repeat evidence after changes to canonical/public schemas, generators, manifests, release storage, activation pointer logic, validation rules, routing, media publication, cache policy, deployment provider, or public domain. Otherwise recheck before launch and at least every 90 days while operational.

## Boundary

This slice does not prove DNS cutover, custom-domain ownership, backup restore, privacy deletion across all records, operational monitoring, incident response, or launch readiness.

## Next owner

P6-06 owns configured domain cutover, DNS verification, cache and certificate propagation, rollback, and externally observable custom-domain evidence.