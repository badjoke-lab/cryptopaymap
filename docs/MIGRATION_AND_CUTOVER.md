# CryptoPayMap migration and cutover

## Purpose

This document defines how CryptoPayMap moves from legacy implementations and source datasets to the new canonical model without presenting unreviewed legacy records as confirmed public acceptance.

Migration has two separate goals:

1. preserve useful identity, location, source, and historical information;
2. rebuild current acceptance claims under the new verification contract.

Legacy volume is not treated as verified coverage.

---

## 1. Migration principles

1. **Legacy data is an input, not authority.** Previous publication or verification labels do not automatically satisfy the new policy.
2. **Import as candidates.** Physical-place and online-service records enter the source and candidate layers unless separately reviewed.
3. **Preserve provenance.** Source system, source record ID, license, and observation dates remain traceable.
4. **Do not inflate public metrics.** Imported candidates do not count as confirmed records.
5. **Preserve working public links.** Legacy identifiers and slugs resolve to new canonical routes where a verified mapping exists.
6. **Run old and new systems in parallel until cutover.** The existing public service remains available while the new service is built and tested.
7. **Test rollback before switching.** Domain, redirects, public artifacts, database migration, and deployment have recovery paths.
8. **Archive only after stabilization.** Legacy repositories and systems remain available long enough to support migration review and rollback.
9. **Do not carry forward unsafe fields.** Private, ambiguous, unlicensed, or structurally incompatible data is excluded or quarantined.
10. **Cutover is a release, not a DNS-only action.** Data, routes, analytics, legal pages, monitoring, backups, and rollback all participate.

---

## 2. Migration sources

### 2.1 Legacy CryptoPayMap website and repository

Used for:

- old public URLs;
- legacy place identifiers;
- existing search-engine links;
- public page inventory;
- redirect mapping;
- historical release context;
- rollback reference during transition.

The legacy application is not the new source of truth.

### 2.2 `cryptopaymap-v2`

Used as a source for physical-place candidates and related location metadata.

Potentially reusable fields include:

- OpenStreetMap type and ID;
- name;
- address;
- coordinates;
- category;
- website;
- payment tags;
- source metadata.

Not carried forward as confirmed truth:

- old verification labels;
- old publication status;
- old aggregate counts;
- assumptions derived only from OSM tags;
- old interface-specific fields without canonical meaning.

### 2.3 Online acceptance source data

Existing online-service, processor, route, evidence, and scope records may be imported as candidates.

Indirect spending routes such as crypto cards, gift cards, and bill-payment intermediaries are not migrated into the main Online Services directory as merchant acceptance.

### 2.4 OpenStreetMap

OSM-derived fields retain:

- OSM object identity;
- observation or source dates where known;
- ODbL provenance;
- attribution requirements;
- separation from CryptoPayMap-authored verification fields.

---

## 3. Migration inventory

Before import, create an inventory of:

- repositories;
- deployments;
- databases;
- object storage;
- public data files;
- domains and subdomains;
- DNS records;
- Cloudflare projects and routes;
- environment variables and secrets by purpose;
- scheduled workflows;
- webhooks;
- analytics properties;
- sitemaps;
- Search Console properties;
- public legal and trust pages;
- legacy redirects;
- open issues and pull requests;
- external links pointing to legacy repository or site routes.

The inventory records ownership and migration state without placing secrets in the document.

---

## 4. Export and preservation

### 4.1 Database export

Create a complete legacy database export before transformation.

Record:

- export date;
- source environment;
- schema version where known;
- row counts;
- checksum;
- storage location;
- restore verification result.

### 4.2 Public artifact snapshot

Preserve a snapshot of:

- public JSON or GeoJSON;
- sitemap;
- robots rules;
- representative public pages;
- redirect behavior;
- version information;
- attribution notices.

### 4.3 Repository reference

Record the final legacy main commit used for migration review. A tag or equivalent immutable reference is created before final archival.

### 4.4 Secrets

Secrets are not included in exports stored as ordinary project files. Required credentials are migrated through approved secret-management systems and rotated when appropriate.

---

## 5. Import staging

### 5.1 Import batches

Each source import creates an auditable batch containing:

- source;
- schema version;
- start and completion times;
- input checksum;
- candidate count;
- rejected input count;
- duplicate count;
- error summary;
- importer version.

### 5.2 Idempotency

Running the same import again must not create uncontrolled duplicate candidates.

Use stable source identity, content hashes, and batch metadata to recognize replayed input.

### 5.3 Raw and normalized values

Preserve source values separately from normalized review values.

Normalization may standardize:

- country codes;
- coordinates;
- URLs;
- asset aliases;
- network aliases;
- category candidates;
- source identifiers.

Normalization does not promote a candidate or invent missing facts.

### 5.4 Quarantine

Records enter quarantine or candidate state when they contain:

- invalid coordinates;
- unparseable identifiers;
- unknown licensing;
- private information;
- suspicious HTML or URLs;
- conflicting targets;
- unsupported route types;
- ambiguous network;
- media without rights basis.

---

## 6. Identity and duplicate migration

### 6.1 Entity matching

Match candidates using multiple signals such as:

- official domain;
- normalized business name;
- address;
- coordinates;
- OSM identity;
- service URL;
- processor identity;
- legacy identifiers.

No single fuzzy name match automatically merges records.

### 6.2 Location matching

Physical locations are matched separately from brands.

A chain or brand record does not automatically merge all branches into one place.

### 6.3 Online-service matching

Online services use canonical official domains and service identity. Regional or product-specific acceptance remains a claim scope, not a duplicate service identity.

### 6.4 Duplicate decision

A merge decision preserves:

- all source-record links;
- legacy identifiers;
- field-level provenance;
- conflicting evidence;
- reviewer decision;
- redirect aliases where applicable.

---

## 7. Acceptance migration

### 7.1 Candidate claim creation

A legacy payment tag or acceptance record may create a candidate claim containing:

- target;
- source;
- proposed route;
- proposed asset;
- proposed network if explicitly present;
- proposed payment method;
- observation date;
- source notes.

### 7.2 No network inference

The importer does not infer network solely from asset symbol.

Examples:

- `USDT` without a network remains incomplete;
- `BTC` does not automatically mean on-chain rather than Lightning;
- processor capability does not identify the merchant's active asset set.

### 7.3 Legacy verification labels

Legacy labels become source metadata or migration notes. They do not map directly to confirmed status.

### 7.4 Promotion

Promotion follows the current verification policy and requires:

- correct identity and scope;
- asset and network;
- route and method;
- How to pay;
- evidence threshold;
- confirmation date;
- no newer material contradiction.

---

## 8. Media migration

### 8.1 Inventory

For every legacy media object, determine:

- source;
- target;
- purpose;
- rights basis;
- attribution;
- privacy risk;
- original and derivative locations;
- content hash;
- current public use.

### 8.2 Unclear rights

Media without a documented rights basis is not moved into the new public gallery.

It may be retained privately only when there is a lawful operational reason and a defined retention period.

### 8.3 Reprocessing

Approved legacy public media is reprocessed through the new pipeline:

- decode and validate;
- remove metadata;
- review privacy;
- generate new derivatives;
- record rights and attribution;
- publish to the new public path.

### 8.4 Missing media

A migrated listing may use a neutral category placeholder. Missing media never blocks migration of an otherwise valid factual record.

---

## 9. Legacy URL mapping

Permanent redirects are used when a stable canonical replacement exists.

| Legacy route | New route |
|---|---|
| `/map` | `/places` |
| `/discover` | `/updates` |
| `/donate` | `/support` |
| `/submit` | `/contribute` |
| `/submit/owner` | `/claim` |
| `/submit/community` | `/suggest` |
| `/submit/report` | `/report` |
| legacy asset route | canonical `/assets/{asset}` |
| legacy city route | canonical `/cities/{iso2}/{city-slug}` |

### 9.1 Legacy place IDs

Legacy place identifiers resolve through `legacy_place_ids`.

- verified mapping: permanent redirect to `/place/{slug}`;
- known but unresolved migration item: noindex migration explanation and Places search;
- invalid or unrelated ID: normal 404.

### 9.2 Old slugs

Old public slugs are stored as aliases and redirect to the canonical current slug.

### 9.3 Fragments

Legacy fragments such as `/about#privacy` cannot be handled through a normal server redirect because fragments are not sent with the HTTP request.

The new About page preserves compatible anchors or performs a small client-side handoff to the canonical `/privacy` or `/disclaimer` page.

### 9.4 Redirect validation

Redirect tests cover:

- status code;
- destination;
- query preservation where appropriate;
- no loops;
- no chains where one redirect is sufficient;
- canonical tag;
- legacy sitemap samples;
- case and encoding behavior;
- unresolved identifiers.

---

## 10. Staging migration

The new application is deployed to a staging hostname before production cutover.

Staging uses:

- separate environment secrets;
- non-indexable robots behavior;
- protected administration;
- synthetic or migrated candidate data as appropriate;
- approved public test projections;
- no accidental production analytics contamination.

### 10.1 Staging validation

Validate:

- Home and discovery routes;
- physical and online details;
- map/list synchronization;
- public data artifacts;
- attribution;
- status presentation;
- submissions and private status;
- administration;
- media;
- Stats, Updates, Roadmap, and Changelog;
- redirects;
- accessibility;
- performance;
- security headers;
- error and empty states.

---

## 11. Pre-cutover freeze

Before production switch:

1. announce or record a migration window where appropriate;
2. freeze nonessential legacy changes;
3. export final legacy deltas;
4. import and review applicable changes;
5. produce final new public artifacts;
6. verify backups and rollback;
7. confirm redirect and DNS plans;
8. verify monitoring and contact paths.

Urgent legacy corrections continue through a controlled exception path and are reconciled before or immediately after cutover.

---

## 12. Production cutover

### 12.1 Cutover sequence

```text
final legacy export
→ final candidate and canonical reconciliation
→ new publication run
→ staging smoke test
→ production deployment
→ domain and route switch
→ cache and redirect validation
→ monitoring
```

### 12.2 Domain switch

The production switch verifies:

- DNS records;
- TLS;
- canonical origin;
- Cloudflare routes;
- redirects;
- robots and sitemap;
- analytics;
- administration protection;
- media domains;
- API origins;
- public data URLs.

### 12.3 Search migration

- submit the new sitemap;
- retain valid permanent redirects;
- update canonical tags;
- verify robots rules;
- monitor crawl errors;
- update public repository and project links;
- avoid indexing staging and private status routes.

### 12.4 Public communication

Cutover communication may explain:

- new verification contract;
- changed routes;
- confirmed versus stale behavior;
- contribution options;
- data and license changes;
- known public limitations.

It does not present imported candidate volume as verified coverage.

---

## 13. Rollback

### 13.1 Rollback triggers

Possible triggers include:

- private-data exposure;
- invalid public export;
- widespread broken routes;
- failed authentication boundary;
- unusable discovery flow;
- serious migration corruption;
- critical media or attribution failure;
- inability to publish a valid snapshot.

### 13.2 Rollback actions

Depending on incident:

- restore previous public artifact version;
- switch domain routing to the prior deployment;
- disable contribution or administration mutations;
- restore database backup or reverse migration;
- temporarily hide affected data;
- revoke compromised credentials;
- invalidate cache;
- preserve audit evidence.

### 13.3 Rollback does not erase new submissions

Submissions received during the transition are preserved safely or explicitly paused. A rollback plan includes reconciliation before later retry.

### 13.4 Roll-forward

When rollback would increase risk, a controlled roll-forward may be used if:

- the defect is understood;
- the fix is bounded;
- the prior public snapshot remains available;
- checks can validate the correction;
- private data is not exposed during repair.

---

## 14. Stabilization

After cutover, monitor:

- errors;
- redirects;
- search indexing;
- public artifact integrity;
- map and list behavior;
- submission delivery;
- private status access;
- administration;
- media processing;
- cache invalidation;
- analytics;
- database and storage operations;
- old and new record mapping.

The legacy deployment remains available for rollback or investigation during stabilization but is no longer the public source of truth.

---

## 15. Legacy retirement

Legacy retirement occurs only after:

- production stabilization;
- no active rollback need;
- final main commit and tag recorded;
- data exports verified;
- open issues and pull requests handled;
- workflow, webhook, deployment, and external-link dependencies reviewed;
- archive README and repository description prepared;
- public links updated.

The legacy repository may then be renamed to clearly identify it as an archive and set read-only through repository archival.

Archived code remains historical reference, not active product documentation.

---

## 16. Migration audit

A migration audit records:

- source inventory;
- export checksums;
- importer versions;
- candidate and canonical outcomes;
- duplicate decisions;
- rejected or quarantined categories;
- provenance and license checks;
- media decisions;
- legacy redirect coverage;
- unresolved mappings;
- final publication version;
- cutover time;
- rollback readiness;
- stabilization result.

Public summaries contain only publishable aggregate or procedural information.

---

## 17. Migration completion checklist

Before cutover, verify:

- [ ] Complete source and infrastructure inventory exists.
- [ ] Legacy database export is restorable and checksummed.
- [ ] Importers are repeatable and auditable.
- [ ] Legacy records enter as candidates unless newly verified.
- [ ] Candidate and confirmed counts are not conflated.
- [ ] OSM provenance and attribution are preserved.
- [ ] Assets and networks are not inferred incorrectly.
- [ ] Legacy identifiers and slugs have tested outcomes.
- [ ] Unclear-rights media is excluded from public migration.
- [ ] New public artifacts pass schema, privacy, provenance, and license validation.
- [ ] Staging is non-indexable and uses separate secrets.
- [ ] Redirects, canonical tags, sitemap, and robots rules are tested.
- [ ] Production domain, TLS, Access, APIs, media, and analytics are ready.
- [ ] Previous public artifacts and legacy deployment can be restored.
- [ ] Monitoring and incident contacts are active.
- [ ] Legacy retirement waits until stabilization succeeds.
