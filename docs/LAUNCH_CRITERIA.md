# CryptoPayMap launch criteria

## Purpose

This document defines the quality, capability, safety, migration, and operational conditions required before the new CryptoPayMap replaces the legacy public service.

Launch is not determined by repository activity, imported candidate volume, or a private numeric target. It requires a coherent product with useful reviewed public data and tested operating controls.

---

## 1. Launch principles

1. **Quality before volume.** Imported or unreviewed records do not satisfy launch readiness.
2. **Every public claim meets the same contract.** No special migration exception creates confirmed status.
3. **Mobile discovery is a primary launch path.** The product must work as an application-quality mobile web experience, not only on desktop.
4. **Public contribution is part of the formal MVP.** The product may reach an internal MVP-A milestone earlier, but formal MVP completion includes reviewed public submissions.
5. **Privacy and security defects can block launch.** A feature is not complete if its trust boundary is incomplete.
6. **The old service remains recoverable through cutover.** Migration and rollback are launch requirements.
7. **Public documentation is part of the product.** Methodology, sources, licenses, privacy, terms, disclaimer, Roadmap, and Changelog must match actual behavior.
8. **No false publication state.** A canonical change is not called public until export validation and release succeed.
9. **Accessibility and performance are release gates.** They are not deferred as cosmetic improvements.
10. **Known limitations are stated honestly.** Launch does not imply complete worldwide coverage or guaranteed payment success.

---

## 2. Product scope readiness

### 2.1 MVP-A capabilities

The operator-managed verified discovery system is ready when it supports:

- source candidates;
- canonical entities and locations;
- acceptance claims;
- asset, network, route, and payment method registries;
- evidence and verification events;
- review and reconfirmation;
- validated public exports;
- physical Places discovery;
- place details;
- Online Services discovery;
- service details;
- basic Stats;
- Updates;
- public Roadmap;
- product Changelog;
- trust, data, legal, support, and partner pages;
- operator-managed approved media;
- PWA manifest and responsive application shell.

### 2.2 MVP-B capabilities

The formal MVP is ready when it additionally supports:

- Suggest;
- Payment report;
- Problem report;
- Claim;
- Photos;
- server-side abuse validation;
- private submission status;
- requests for information;
- time-bounded holds;
- field-level partial approval;
- private candidate outcome;
- ownership verification;
- media quarantine and independent media decisions;
- canonical transactions;
- validated publication after approval;
- privacy retention and deletion jobs;
- end-to-end submission coverage.

---

## 3. Public record readiness

Every confirmed public acceptance claim has:

- identifiable merchant, physical place, or online service;
- correct claim scope;
- accepted asset;
- explicit network;
- direct-wallet or processor-checkout route;
- payment method;
- identified processor when applicable;
- actionable How to pay;
- public restrictions where applicable;
- evidence meeting the verification threshold;
- last confirmation date;
- next review date;
- public status;
- provenance and license metadata;
- no newer unresolved contradiction that should prevent confirmation.

### 3.1 Physical place requirements

Every active public map pin has:

- a public canonical location;
- valid coordinates;
- country;
- branch-specific or explicitly reviewed coverage;
- a confirmed location-specific claim or approved location expansion rule;
- no unresolved closure or duplicate issue.

Platform capability and unreviewed brand-wide statements do not create pins.

### 3.2 Online-service requirements

Every public online-service claim identifies:

- official service identity;
- checkout or invoice route;
- accepted asset and network combinations;
- applicable products or plans;
- new-purchase, renewal, regional, or temporary restrictions;
- current evidence.

### 3.3 Stale and ended behavior

- stale is excluded from default discovery;
- ended is excluded from normal active discovery;
- stale and ended details are clearly labeled before payment instructions;
- historical records do not visually imply current acceptance.

### 3.4 Candidate exclusion

Candidate records do not appear in:

- map pins;
- public search;
- public generated pages;
- public Stats;
- public Updates;
- public data exports.

---

## 4. Data readiness

### 4.1 Canonical integrity

- no orphan public entities, locations, claims, assets, networks, evidence, or media;
- claim and submission states are separate;
- route and payment method are separate;
- public visibility is separate from status;
- current status agrees with verification history;
- public slugs are unique and stable;
- registries contain no silently repurposed values.

### 4.2 Public projection integrity

- public files are generated from explicit allowlisted projections;
- private fields fail validation;
- failed publication preserves the last valid snapshot;
- artifacts are versioned and hashed;
- manifest, version, generated date, and public counts agree;
- Stats agree with public files;
- Updates agree with public verification events.

### 4.3 Provenance and license integrity

- OSM-derived fields remain identifiable;
- required OSM attribution is visible;
- CryptoPayMap acceptance data uses the documented license layer;
- explanatory text uses the documented text layer;
- combined exports preserve component notices;
- every public image has an item-level rights basis and attribution where required;
- no unclear-rights image is public.

### 4.4 Migration integrity

- imported legacy records retain source identities;
- legacy verification labels do not grant new confirmation;
- duplicate and identity decisions are auditable;
- old public identifiers have tested mappings or migration-specific outcomes;
- unresolved migrated candidates remain private.

---

## 5. Discovery experience readiness

### 5.1 Home

Home provides:

- clear product definition;
- Places and Online Services entry points;
- public dataset summaries;
- recent verified changes;
- browse-by-asset, network, and region entry;
- methodology summary;
- contribution entry;
- Roadmap and Changelog entry;
- support entry without implying verification benefit.

### 5.2 Places desktop

- coordinated map and list;
- search and filters;
- confirmed default;
- stale optional and off by default;
- selected marker and list result synchronization;
- Search this area behavior;
- selected-place preview;
- no candidate fallback in zero-result states.

### 5.3 Places mobile

- usable safe-area application shell;
- Map / List control;
- bottom sheet with closed, peek, and expanded states;
- touch-friendly controls;
- selection and URL synchronization;
- browser-back restoration;
- preserved list and map context;
- visible non-gesture alternatives.

### 5.4 Detail pages

Place and service details show:

- status prominently;
- asset and network;
- route and method;
- How to pay;
- restrictions;
- confirmation date;
- evidence and history;
- report and contribution actions;
- media or a neutral placeholder;
- nearby discovery where applicable.

### 5.5 Empty and error states

- no-results state does not reveal candidates;
- retry does not discard safe state unnecessarily;
- missing legacy mappings show migration guidance;
- normal 404 offers useful discovery paths;
- failed dynamic features degrade without exposing private details.

---

## 6. Contribution readiness

### 6.1 Intake

- server-side Turnstile validation;
- rate limits;
- request-size limits;
- schema validation;
- URL safety;
- duplicate controls;
- immutable original payload;
- opaque public reference;
- high-entropy status secret stored only as a hash;
- private contact encryption;
- safe confirmation response.

### 6.2 Review

- triage;
- current/submitted/normalized comparison;
- evidence classification;
- field-level approve/reject/hold;
- time-bounded holds;
- information request;
- duplicate and no-change outcomes;
- private candidate outcome;
- canonical impact preview;
- audit events.

### 6.3 Status access

- no public enumeration;
- noindex and private caching behavior;
- no token leakage to logs, analytics, or referrers;
- public-safe state and messages;
- submitter can respond, add evidence, or withdraw;
- recovery only through a verified contact path where available.

### 6.4 Publication

- canonical transaction is atomic;
- publication is a separate validated run;
- submitter is not told a change is public before successful release;
- failed release preserves the last valid public version.

---

## 7. Media readiness

- private quarantine;
- scoped short-lived upload authorization;
- file-size and count limits;
- signature and decode validation;
- dimension and decompression limits;
- exact and duplicate hashes;
- rights basis;
- privacy review;
- QR, wallet, receipt, face, and plate review;
- metadata and GPS removal;
- safe re-encoding;
- separate public derivatives;
- alt text;
- attribution;
- independent submission and media decisions;
- deletion schedules;
- takedown and cache invalidation;
- neutral placeholder when no image is approved.

Private originals can never become public fallbacks.

---

## 8. Security readiness

- administration pages and APIs require validated identity-aware access;
- authorization is enforced server-side;
- secrets exist only in approved environment stores;
- database queries are parameterized;
- mutating requests use CSRF and origin controls where applicable;
- CORS is deny-by-default;
- unsafe URL schemes and open redirects are blocked;
- server-side URL fetching blocks private and metadata ranges;
- status secrets and signed URLs are excluded from logs;
- Content Security Policy and other security headers are tested;
- untrusted pull requests receive no production secrets;
- workflows use least privilege;
- dependency and secret scanning is enabled;
- public build output is inspected for secrets and private fixtures;
- incident rollback and credential rotation are documented and tested.

High-severity unresolved security defects block launch.

---

## 9. Privacy readiness

- privacy page matches actual collection and retention;
- ordinary browsing does not create a persistent user profile;
- browser geolocation is user-initiated and not stored as precise history;
- raw coordinates and full free-text search are excluded from analytics;
- payment reports do not require name, amount, wallet address, or transaction history;
- contact is optional except where verification requires it;
- restricted data has purpose and deletion schedule;
- evidence and public summaries are separated;
- deletion and takedown requests can be processed;
- preview environments use synthetic or sanitized data;
- private data is not sold to advertisers or exposed to partners.

---

## 10. Accessibility readiness

The supported public and administration flows target WCAG 2.2 AA.

Release checks include:

- semantic headings and landmarks;
- keyboard navigation;
- visible focus;
- focus management for dialogs and sheets;
- labels and descriptions;
- error association;
- status not communicated by color alone;
- sufficient contrast;
- touch-friendly controls;
- reduced motion;
- image alternatives;
- map results available through an operable list;
- representative screen-reader review;
- accessible form steps and recovery from validation errors.

A critical flow that requires pointer-only map interaction blocks launch.

---

## 11. Performance readiness

Representative targets:

```text
LCP  ≤ 2.5 seconds
INP  ≤ 200 milliseconds
CLS  ≤ 0.1
```

Readiness includes:

- MapLibre loaded only where needed;
- compact initial pin payload;
- responsive image derivatives;
- stable layout placeholders;
- no excessive hydration on content pages;
- bounded map rerenders;
- cached public artifacts;
- loading states that preserve context;
- tested representative mobile device and network conditions;
- no critical route blocked by a nonessential third party.

A measured exception requires documentation and a bounded follow-up plan; severe interaction failure blocks launch.

---

## 12. Testing readiness

### 12.1 Required automated checks

As applicable to implemented areas:

- formatting or linting;
- type checking;
- unit tests;
- component tests;
- production build;
- end-to-end tests;
- accessibility checks;
- migration validation;
- public schema validation;
- privacy leakage validation;
- dependency and secret scanning.

### 12.2 Required end-to-end flows

- map and list discovery;
- filters and URL restoration;
- detail and browser back;
- mobile bottom sheet;
- Online Services discovery;
- Suggest;
- Payment report;
- Problem report;
- Claim;
- Photos;
- private status response;
- administrative review;
- partial approval and hold;
- canonical transaction;
- publication run;
- media review;
- redirect and legacy mapping.

### 12.3 Manual release review

- mobile device testing;
- desktop browser testing;
- keyboard-only testing;
- screen-reader sampling;
- map attribution;
- legal and trust pages;
- rights and privacy takedown;
- rollback and backup restore;
- cache invalidation;
- staging noindex behavior.

---

## 13. Legal and trust readiness

Public pages exist and match implementation:

- About;
- Methodology;
- Sources and Licenses;
- Data;
- Privacy;
- Terms;
- Disclaimer;
- Contact;
- Support;
- Partners.

The service clearly states:

- confirmation is time-bound and not a guarantee;
- the dataset is not a measure of all global adoption;
- investment advice is not provided;
- support and sponsorship do not affect verification;
- public data and text licenses do not automatically license images or trademarks;
- user submissions are reviewed and may not be published.

---

## 14. Roadmap, Updates, and Changelog readiness

- Stats describes current public data;
- Updates describes public record changes;
- Roadmap describes future product capabilities;
- Changelog describes released product and policy changes;
- routine record additions do not become product versions;
- completed Roadmap milestones link to released Changelog entries;
- Exploring is clearly noncommittal;
- no private targets, deadlines, or queue metrics appear publicly.

---

## 15. Migration and SEO readiness

- final source and infrastructure inventory;
- restorable legacy export;
- candidate import audit;
- legacy identifier mapping;
- tested redirects;
- tested fragment handoff;
- canonical URLs;
- sitemap;
- robots rules;
- staging excluded from indexing;
- public data URLs stable;
- Search Console update prepared;
- domain, TLS, APIs, and media origins ready;
- old deployment available for rollback during stabilization.

---

## 16. Operational readiness

- administration access works;
- review queues work;
- reconfirmation works;
- publication can be retried safely;
- prior public snapshot can be restored;
- backups exist and restore testing passed;
- monitoring and safe logs work;
- public contact and report paths work;
- privacy and rights hiding works;
- deletion jobs work;
- dependency outage behavior is understood;
- incident response contacts and procedures exist;
- legacy retirement is deferred until stabilization succeeds.

---

## 17. Launch blockers

Launch is blocked by any unresolved issue that materially causes:

- private-data exposure;
- unauthorized administration access;
- candidate publication;
- invalid or misleading confirmed records at scale;
- missing asset, network, route, method, instructions, evidence, or date in public confirmed claims;
- broken mobile discovery;
- no list alternative to the map;
- inaccessible core contribution path;
- public media without rights or privacy approval;
- failed public-export validation;
- no rollback or restorable public snapshot;
- critical redirect or domain failure;
- missing required attribution;
- legal or privacy pages that contradict implementation;
- high-severity security defect;
- inability to receive urgent corrections or takedowns.

---

## 18. Launch decision record

The production launch decision records:

- reviewed main commit;
- application version;
- public dataset version;
- migration audit reference;
- test and accessibility summary;
- security and privacy review summary;
- backup and rollback confirmation;
- known public limitations;
- launch time;
- responsible release actor;
- stabilization monitoring start.

The public Changelog receives the applicable release entry.

---

## 19. Post-launch stabilization exit

Stabilization is complete when:

- no unresolved critical incident remains;
- redirects and indexing are functioning;
- public artifact generation is reliable;
- submissions and status access are reliable;
- mobile and desktop discovery remain usable;
- migration mapping is sufficiently reconciled;
- backup and rollback are no longer dependent on an actively writable legacy system;
- legacy repository and deployment retirement conditions are met.

---

## 20. Final launch checklist

### Product and data

- [ ] MVP-A and MVP-B capabilities are operational.
- [ ] Every public confirmed claim meets the verification contract.
- [ ] Candidates are excluded from every public surface.
- [ ] Stats, Updates, Roadmap, and Changelog are distinct and accurate.

### Experience

- [ ] Places works on representative mobile and desktop environments.
- [ ] Online Services works.
- [ ] Browser back, URL restoration, bottom sheet, empty, and error states work.
- [ ] Detail pages show payment instructions, evidence, and freshness clearly.

### Contributions and media

- [ ] Every submission path works end to end.
- [ ] Status access is private and recoverable where allowed.
- [ ] Holds and partial approvals work.
- [ ] Media quarantine, rights, privacy, derivatives, and deletion work.

### Security and privacy

- [ ] Administration and mutation APIs are protected.
- [ ] Public export leakage tests pass.
- [ ] Secrets and signed URLs are absent from logs and builds.
- [ ] Retention, deletion, and incident paths work.

### Quality

- [ ] Applicable CI and end-to-end checks pass.
- [ ] Accessibility review passes for critical flows.
- [ ] Performance is acceptable on representative conditions.
- [ ] Attribution and legal pages match actual behavior.

### Migration and operations

- [ ] Redirects, sitemap, robots, canonical tags, domain, and TLS are ready.
- [ ] Backup and rollback are tested.
- [ ] Monitoring and contact routes are active.
- [ ] Legacy deployment remains recoverable during stabilization.
