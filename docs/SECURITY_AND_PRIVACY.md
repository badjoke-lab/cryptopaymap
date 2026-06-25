# CryptoPayMap security and privacy architecture

## Purpose

This document defines the security and privacy controls for CryptoPayMap's public site, administration, submissions, private status access, operational database, public exports, media storage, analytics, logging, deployment, and incident response.

Security requirements are guided by applicable OWASP Application Security Verification Standard categories and by the documented behavior of the selected infrastructure. Implementation details may evolve, but the trust boundaries and privacy invariants in this document remain mandatory.

---

## 1. Security principles

1. **Public by projection, not by default.** Operational tables and object stores are private unless an explicit reviewed public projection or derivative exists.
2. **Least privilege.** Every Worker, workflow, token, upload authorization, administrator, and storage binding receives only the permissions it needs.
3. **Server-side authorization.** Client-side route hiding and UI state are never trusted as access control.
4. **Validate at every trust boundary.** Browser, API, database, object storage, import, and public export boundaries each enforce their own validation.
5. **Fail closed.** Missing authorization, invalid evidence, failed export, failed media processing, or unclear visibility prevents publication.
6. **Minimize sensitive data.** Do not collect information that is unnecessary for verification, contribution, security, or lawful operation.
7. **Separate secrets from identifiers.** Public IDs, internal UUIDs, status secrets, credentials, and signed URLs are distinct values.
8. **Private proof supports conclusions without becoming public.** Evidence, contacts, receipts, ownership proof, and originals remain restricted.
9. **Preserve the last valid public state.** Operational failure does not replace valid public artifacts with partial or invalid output.
10. **Audit material decisions.** Authentication, authorization failure, canonical changes, verification changes, publication, and media decisions create safe audit events.

---

## 2. Data classification

### 2.1 Public

Examples:

- confirmed, stale, or ended public acceptance claims;
- approved public place and service details;
- public evidence summaries and source links;
- public verification history;
- approved public media derivatives;
- public registries, statistics, updates, roadmap, and changelog;
- required attribution and license metadata.

### 2.2 Internal

Examples:

- source candidates;
- review queues;
- normalized proposals;
- reviewer decisions not intended for publication;
- audit history;
- publication failure summaries;
- operational metrics;
- duplicate groups;
- internal identifiers.

### 2.3 Restricted

Examples:

- submission contacts;
- private transaction URLs;
- receipts;
- wallet addresses supplied as evidence;
- ownership-verification material;
- private correspondence;
- private evidence images;
- quarantine originals;
- private signed URLs;
- status-token hashes;
- abuse-control signals;
- database credentials and infrastructure secrets.

### 2.4 Secret

Examples:

- database connection strings;
- API tokens;
- Cloudflare Access service credentials;
- Turnstile secret keys;
- R2 credentials;
- encryption keys;
- signing keys;
- deployment credentials;
- plaintext submission-status secrets before delivery.

Secret values are never stored in the repository, public artifacts, browser bundles, analytics, ordinary logs, or support documentation.

---

## 3. Threat model

The architecture considers at least these threats:

- unauthorized access to administration;
- privilege escalation;
- submission spam and automated abuse;
- forged Turnstile responses;
- status-link enumeration or token leakage;
- cross-site scripting;
- cross-site request forgery;
- SQL injection;
- server-side request forgery through evidence URLs;
- unsafe redirects;
- malicious or disguised media uploads;
- decompression bombs and resource exhaustion;
- private object exposure;
- public-export leakage;
- log leakage;
- secret leakage through commits or builds;
- denial of service;
- duplicate or replayed mutations;
- poisoned imports;
- dependency compromise;
- incorrect ownership claims;
- unauthorized media publication;
- cache or CDN persistence after takedown;
- accidental exposure through preview environments;
- stale offline payment information presented as current.

Security review is repeated when a new trust boundary, data class, external provider, or public mutation path is added.

---

## 4. Trust boundaries

```text
Untrusted browser input
→ public edge and API validation
→ application authorization and domain validation
→ operational database or private object storage
→ reviewed canonical transaction
→ public projection validation
→ public artifact or derivative
```

### 4.1 Browser

The browser is untrusted. Client validation, hidden controls, and application state can be modified by the user.

### 4.2 Public edge

Cloudflare provides TLS termination, request controls, rate limiting where configured, Turnstile integration, and route separation. Application validation remains required.

### 4.3 Worker or server code

Workers and Functions enforce:

- authentication and authorization;
- request validation;
- domain invariants;
- object-key scope;
- rate limits and idempotency;
- safe database and storage access;
- minimal responses.

### 4.4 Database

The database is the operational source of truth, not a public API. Access is limited to approved server-side environments and workflows.

### 4.5 Object storage

Private and public objects use separate buckets or clearly separated access policies. Private originals cannot become public by changing only a URL.

### 4.6 Public build and exports

Build and export processes receive only the data required for public projection. They do not serialize operational tables directly.

---

## 5. Administration security

### 5.1 Cloudflare Access

Administration routes and APIs are protected by a Cloudflare Access application or an equivalent identity-aware control.

Requirements:

- default deny;
- explicit allow policy;
- server-side validation of Access assertions;
- issuer and audience validation;
- token expiration validation;
- trusted identity extraction only after signature verification;
- no reliance on an unverified email header;
- protected API routes as well as protected pages.

### 5.2 Authorization

Initial administration may use one broad operator role, but route and action checks remain explicit so later roles can be introduced.

Potential future scopes:

- candidate review;
- evidence review;
- media review;
- ownership verification;
- publication;
- audit read;
- security administration.

High-impact actions such as publication, mass changes, or rights removal may require a separate confirmation step.

### 5.3 Session handling

- use Secure, HttpOnly, and appropriate SameSite cookie settings where application cookies are needed;
- do not place administrator tokens in local storage;
- set bounded session lifetime;
- require reauthentication or equivalent confirmation for sensitive configuration changes where appropriate;
- clear session state on logout;
- prevent sensitive pages from being cached publicly.

### 5.4 Administration responses

Administration endpoints return only fields required by the current view. They do not expose complete private tables through generic query endpoints.

---

## 6. Public submission protection

### 6.1 Turnstile

Turnstile is a bot-abuse signal, not authorization or factual verification.

Requirements:

- validate every token on the server through Siteverify;
- reject missing, expired, failed, or replayed tokens;
- validate expected hostname and action values where configured;
- keep the secret key server-side;
- handle challenge failure accessibly;
- do not treat a successful token as evidence that content is trustworthy.

### 6.2 Rate limits

Rate limits may consider:

- route;
- submission type;
- public target;
- recent duplicate hashes;
- validated client and edge signals;
- upload authorization count;
- failed status-token attempts.

Rate-limit responses reveal no private record existence.

### 6.3 Idempotency

Mutating endpoints use an idempotency key or equivalent replay control when repeated requests could create duplicate submissions, events, publication runs, or media objects.

An idempotency key is scoped to the authenticated or public operation and expires after a bounded period.

### 6.4 Input limits

Every request defines:

- maximum body size;
- maximum field length;
- maximum collection size;
- supported content type;
- supported URL scheme;
- accepted registry values;
- date and coordinate bounds;
- file count and size limits.

Unexpected fields are rejected or ignored according to an explicit schema, never merged blindly into canonical objects.

---

## 7. Submission status security

### 7.1 Public reference and secret

A submission status record uses:

- an opaque public reference;
- a high-entropy secret;
- a stored one-way token hash;
- constant-time comparison where applicable;
- rate limiting;
- token rotation or revocation support.

The public reference alone reveals no useful private status.

### 7.2 Token transport

Sensitive status secrets are not placed in analytics events, logs, support screenshots, referrer-bearing third-party links, or page titles.

Where a secret is transported in a URL for initial usability:

- the page immediately establishes an appropriate short-lived session or otherwise minimizes continued URL exposure;
- Referrer-Policy prevents leakage;
- the page uses no-store behavior;
- third-party resources are minimized or excluded;
- the secret is removed from the visible URL where practical.

### 7.3 Status projection

The status API returns a purpose-built safe projection containing only:

- public reference;
- public-facing workflow state;
- requested action;
- public hold or resolution reason;
- linked public record after successful publication;
- media decisions belonging to the same submission;
- permitted response actions.

It never returns internal notes, priority, reviewer identity, abuse signals, other submissions, raw ownership proof, or private evidence.

### 7.4 Recovery

Token recovery requires a verified contact path where one exists. The system does not provide a public lookup by email, business name, or reference alone.

---

## 8. Request validation and output encoding

### 8.1 Shared schemas

Zod or an equivalent schema layer validates:

- request shape;
- field types;
- controlled values;
- normalized URLs;
- dates;
- coordinates;
- identifiers;
- file metadata;
- public response projections.

Server validation is authoritative.

### 8.2 Canonicalization

Normalize before duplicate and policy comparison:

- Unicode and whitespace where appropriate;
- asset and network aliases;
- country codes;
- URLs and hostnames;
- business names for matching only;
- coordinates within documented precision;
- media MIME type after file inspection.

Canonicalization does not silently change user meaning. Original input remains available for review.

### 8.3 HTML and rich text

User-submitted fields are plain text unless a field explicitly supports a reviewed markup subset.

- never render untrusted HTML directly;
- escape output according to context;
- sanitize allowed markup on the server;
- disallow scriptable URL schemes;
- validate externally supplied links;
- use safe link attributes where new browsing context is opened.

### 8.4 Redirects and navigation

Redirect destinations and programmatic navigation use allowlisted internal routes or validated absolute URLs. User input is never passed directly to a redirect or Astro `navigate()` call.

---

## 9. Database security

### 9.1 Query safety

- use parameterized queries;
- avoid string-built SQL from user input;
- review raw SQL;
- use transactions for canonical changes;
- enforce foreign keys and constraints;
- use least-privilege database roles when supported;
- separate migration and runtime permissions where practical.

### 9.2 Connection secrets

Database credentials are runtime secrets or bindings. They do not appear in:

- `.env` files committed to Git;
- static builds;
- client-side environment variables;
- error pages;
- public CI logs;
- documentation examples using real values.

### 9.3 Sensitive columns

Sensitive values use appropriate protection:

- email encrypted at rest in the application data model;
- normalized email hash for duplicate or abuse control;
- status secrets hashed;
- internal notes excluded from public projections;
- storage keys restricted;
- private payload access limited to required operations.

### 9.4 Transactions

A canonical review transaction includes all required domain changes and audit events. Partial failure rolls back.

Publication is a separate validated state. A committed canonical change does not falsely imply public release.

### 9.5 Backup security

Backups are encrypted and access-controlled. Restore testing uses restricted environments and does not copy production personal data into public previews.

---

## 10. URL and server-side request forgery protection

Evidence URLs and official-site URLs are untrusted input.

### 10.1 Accepted schemes

Initial public links allow `https` and, only where explicitly justified, `http` for legacy public sources.

The system rejects:

- `file:`;
- `javascript:`;
- `data:` where not explicitly required;
- `ftp:`;
- local application schemes;
- embedded credentials;
- malformed hostnames.

### 10.2 Server fetching

If the system fetches a submitted URL:

- resolve DNS safely;
- block loopback, link-local, private, multicast, and metadata-service address ranges;
- repeat checks after redirects and DNS resolution;
- limit redirects;
- set connect and response timeouts;
- limit response size;
- restrict content types;
- avoid sending internal credentials or cookies;
- use a dedicated outbound fetch path;
- record a safe error rather than response bodies containing secrets.

### 10.3 Archive services

Private and restricted URLs are never sent to public archive services.

---

## 11. Media upload security

### 11.1 Presigned upload authorization

Presigned R2 URLs or equivalent upload grants are bearer credentials.

Requirements:

- generate them on the server;
- grant one operation on one randomized object path;
- use short expiration;
- limit expected size and type through application controls;
- associate the object with one submission and purpose;
- never expose R2 API credentials;
- validate the resulting object before review;
- do not treat successful upload as approval.

### 11.2 File validation

- verify magic bytes;
- decode with a supported image library;
- reject disguised or active content;
- bound pixel count and decompression;
- compute cryptographic hash;
- use duplicate and known-rejection controls;
- normalize orientation;
- re-encode public derivatives;
- remove metadata and GPS;
- scan or inspect according to the implemented media threat model.

### 11.3 Storage separation

- originals and evidence remain in private quarantine;
- public derivatives use a separate public path or bucket;
- public code never falls back to a private original;
- private signed GET URLs are short-lived and no-store;
- public object keys do not expose private identifiers or filenames.

### 11.4 Deletion

Deletion jobs are idempotent, audited, and verify object removal. Public cache invalidation is part of takedown handling.

---

## 12. Public export security

### 12.1 Explicit projections

Public data is generated from named public projections. Operational tables are never serialized directly.

### 12.2 Leakage validation

Exports fail when they contain or resemble prohibited fields, including:

- email or contact fields;
- IP addresses;
- status-token hashes or secrets;
- private transaction URLs;
- wallet addresses supplied privately;
- receipt data;
- ownership proof;
- internal notes;
- private storage keys;
- audit payloads;
- source-candidate priority;
- private queue state.

Validation uses both schema allowlists and targeted deny checks.

### 12.3 Eligibility validation

Exports include only records that satisfy:

- eligible canonical state;
- public visibility;
- publishable identity and scope;
- required asset, network, route, method, instructions, evidence, and date;
- provenance and license requirements;
- public media approval where media is included.

### 12.4 Atomic publication

Artifacts are generated to a temporary versioned location, validated, hashed, and only then promoted as current.

A failed run leaves the previous public version unchanged.

---

## 13. Cross-site request forgery and browser security

### 13.1 CSRF

State-changing authenticated requests use appropriate protections:

- SameSite cookies;
- anti-CSRF token where cookie-based authentication requires it;
- Origin and Referer checks where appropriate;
- no state changes through GET;
- explicit content types;
- reauthentication or confirmation for high-impact actions.

### 13.2 CORS

CORS is deny-by-default.

- public read files may allow documented cross-origin GET access;
- mutation APIs allow only approved origins;
- credentials are never combined with wildcard origin;
- presigned upload CORS allows only required methods, headers, and origins.

### 13.3 Security headers

Public and private responses apply an appropriate baseline:

- Content-Security-Policy;
- Referrer-Policy;
- X-Content-Type-Options;
- frame-ancestors through CSP;
- Permissions-Policy;
- Strict-Transport-Security on production HTTPS;
- restrictive cache headers for private routes.

The exact CSP is tested with MapLibre workers, media, analytics, Turnstile, and application assets. Broad `unsafe-inline` or wildcard sources are avoided where practical.

### 13.4 Clickjacking

Administration, status pages, and sensitive contribution responses deny framing. Public pages allow framing only if an explicit product need is approved.

---

## 14. Secrets management

### 14.1 Storage

Secrets are stored in approved Cloudflare, GitHub, and database secret facilities.

### 14.2 Scope

Separate secrets by:

- environment;
- service;
- purpose;
- read or write capability.

Preview environments do not receive production mutation or private-data credentials unless explicitly approved.

### 14.3 Rotation

Secrets have an owner, purpose, creation date, and rotation or revocation procedure.

Rotate immediately after suspected exposure, collaborator removal, provider compromise, or accidental logging.

### 14.4 Repository controls

- `.env*` files are ignored except safe examples;
- examples contain placeholders;
- CI scans for common secret formats after the code foundation exists;
- commit history is treated as exposed if a secret is committed, even after file deletion;
- response is rotate first, then remove and investigate.

---

## 15. Logging and audit

### 15.1 Security events

Log safe structured events for:

- successful and failed administrator authentication where available;
- authorization failures;
- input validation failures by error code;
- rate-limit and Turnstile failures;
- status-token failures without logging the token;
- canonical state changes;
- ownership decisions;
- media approvals, rejections, and deletions;
- publication success and failure;
- secret or configuration changes;
- backup and restore operations.

### 15.2 Prohibited log content

Do not log:

- passwords or private keys;
- access tokens;
- status secrets;
- signed URLs;
- full email addresses where not necessary;
- raw submission bodies;
- receipts;
- transaction URLs;
- wallet addresses supplied privately;
- ownership proof;
- database credentials;
- unredacted private storage keys.

### 15.3 Log integrity

- restrict log access;
- use timestamps and correlation IDs;
- protect logs against casual modification;
- define retention;
- avoid exposing detailed internal errors to users;
- keep public error messages safe and actionable.

---

## 16. Privacy data inventory

### 16.1 Data collected by public browsing

Minimize to ordinary delivery and aggregate analytics data required to serve and protect the site.

CryptoPayMap does not create a persistent user profile for ordinary public browsing in the MVP.

### 16.2 Browser geolocation

Geolocation is requested only after a user action.

- used in the browser to center or assist local discovery where practical;
- not required for manual search;
- not stored as a precise location history;
- not included in analytics;
- not attached to submissions unless the user intentionally selects a public business location.

### 16.3 Search analytics

Approved structured search-demand data may include:

- canonical country;
- canonical city;
- asset;
- network;
- category;
- result-count bucket;
- date.

Do not retain for analytics:

- raw coordinates;
- exact current location;
- full free-text query;
- persistent device ID;
- private submission reference;
- status token.

### 16.4 Submission data

Submission data may include:

- factual business and payment details;
- evidence URLs;
- optional contact;
- private payment evidence;
- media;
- relationship disclosure;
- ownership-verification material.

Each category has a purpose, visibility, retention, and deletion path.

---

## 17. Privacy minimization

### 17.1 Do not request

Ordinary payment reports do not request:

- legal name;
- payment amount;
- wallet address;
- private key or seed phrase;
- full transaction history;
- government identity document;
- unrelated account credentials.

### 17.2 Evidence redaction

Forms and help text instruct submitters to remove unnecessary:

- names;
- addresses;
- wallet identifiers;
- balances;
- transaction history;
- order details;
- device information.

Review tools support redacted public summaries and derivatives.

### 17.3 Purpose limitation

Data collected for verification, abuse prevention, rights review, or contact is not repurposed for advertising profiles or sold as personal data.

---

## 18. Retention and deletion

### 18.1 Default principles

- retain only while needed for the documented purpose;
- assign deletion dates to temporary restricted data;
- separate object deletion from limited audit metadata;
- review retention extensions;
- make deletion jobs idempotent and auditable.

### 18.2 Media

Media retention follows `MEDIA_POLICY.md`.

### 18.3 Contacts

Submission contacts are deleted or anonymized after the follow-up and dispute period unless a documented continuing purpose applies.

The exact period is configured and disclosed before public submission launch.

### 18.4 Status secrets

Expired or closed status access may be revoked after the disclosed follow-up period. The hash may be deleted when no longer required.

### 18.5 Analytics

Structured internal search-demand events are retained for a limited period, initially no more than 90 days, after which only aggregate rollups remain.

### 18.6 Deletion requests

A deletion request evaluates:

- identity and authority;
- requested data category;
- public factual record versus personal source material;
- legal or audit retention;
- active dispute;
- public caches and derivatives;
- downstream processors under project control.

Removing personal evidence does not automatically remove a separately verified public fact.

---

## 19. Analytics and third parties

### 19.1 Cloudflare Web Analytics

Use privacy-conscious aggregate analytics without building cross-site user profiles.

### 19.2 Third-party scripts

Third-party scripts require review for:

- necessity;
- data collected;
- cookies or identifiers;
- Content Security Policy impact;
- privacy disclosure;
- failure behavior;
- availability and performance.

Avoid third-party scripts on secret status and administration pages unless strictly required and explicitly reviewed.

### 19.3 Advertising and sponsorship

Future sponsorship or advertising integrations cannot receive private submissions, precise location history, ownership proof, or administrator data.

Commercial relationships do not affect verification.

---

## 20. Preview and development environments

- use synthetic or sanitized data;
- do not copy production restricted records by default;
- protect non-public previews;
- use separate secrets and buckets;
- prevent search indexing;
- expire preview deployments where practical;
- avoid placing status secrets in test fixtures;
- ensure test analytics do not contaminate production data.

---

## 21. Dependency and supply-chain security

- use a lockfile;
- review dependency ownership and maintenance;
- enable dependency vulnerability reporting after foundation setup;
- pin GitHub Actions to reviewed versions or commit SHAs according to repository policy;
- minimize workflow permissions;
- use read-only permissions by default;
- separate build from production publication credentials;
- review install scripts and native dependencies;
- generate or retain a software bill of materials when the project reaches release readiness;
- remove abandoned or unused packages.

A compromised dependency is treated as a security incident even when no direct exploit is confirmed.

---

## 22. CI and deployment security

### 22.1 Pull requests

Untrusted pull-request code does not receive production secrets.

### 22.2 Workflow permissions

Workflows declare minimal permissions. Write access is enabled only for the step or workflow that requires it.

### 22.3 Publication

Production publication requires:

- reviewed main commit;
- successful checks;
- valid artifact or export;
- environment-scoped credentials;
- auditable publication event.

### 22.4 Build output

The build is scanned or inspected to ensure it contains no:

- server secrets;
- private environment files;
- restricted data fixtures;
- source maps containing secrets;
- private media;
- operational database dumps.

---

## 23. Availability and abuse resilience

- bounded request and upload sizes;
- timeouts;
- rate limits;
- cacheable public data;
- previous valid public snapshot;
- background or queued heavy work;
- circuit breaking where external services fail;
- no unlimited retry loops;
- controlled batch sizes;
- database indexes for public and review queries;
- separate public browsing from administration and publication load.

The public site should continue serving the last valid public data during temporary database or review-system failure.

---

## 24. Backup and recovery

Backups cover:

- canonical database;
- migrations;
- public artifacts;
- media metadata;
- required private objects while within retention;
- configuration needed for recovery without exposing secrets in documentation.

Recovery procedures verify:

- backup integrity;
- restoration into a restricted environment;
- publication from restored canonical data;
- no accidental resurrection of deleted private objects;
- correct secret rotation after recovery where needed.

---

## 25. Incident response

### 25.1 Incident categories

- secret exposure;
- unauthorized administration access;
- public private-data leak;
- malicious media exposure;
- compromised dependency;
- database corruption;
- false publication;
- rights or privacy takedown failure;
- denial of service;
- lost or exposed status-token set.

### 25.2 Immediate actions

Depending on incident:

- revoke or rotate secrets;
- disable affected route or workflow;
- temporarily hide affected public records or media;
- preserve safe audit evidence;
- stop publication;
- restore previous public snapshot;
- isolate compromised credentials or environment;
- invalidate signed URLs and caches;
- assess affected data and users.

### 25.3 Recovery

- fix root cause;
- validate corrected controls;
- restore safe service;
- review related records;
- document technical timeline and actions;
- determine notification and disclosure obligations;
- add regression tests or monitoring.

Public incident communication contains verified facts and avoids exposing secrets, attack details that create immediate risk, or private user information.

---

## 26. Security testing

Security checks expand with implementation.

### 26.1 Automated

- dependency scanning;
- secret scanning;
- lint and type checks;
- unit tests for authorization and state transitions;
- schema and public-leakage tests;
- upload validation fixtures;
- redirect and URL validation tests;
- security-header checks;
- public build inspection.

### 26.2 Manual

- administrator access bypass attempts;
- IDOR review;
- status-token enumeration and leakage review;
- CSRF review;
- XSS and unsafe URL review;
- SSRF review;
- upload polyglot and decompression review;
- public-export privacy review;
- browser back and cache behavior on private pages;
- takedown and cache invalidation;
- backup restoration.

### 26.3 Release gate

High-severity unresolved security or privacy defects block production launch.

---

## 27. Security and privacy checklist

Before production launch, verify:

- [ ] Administration pages and APIs require validated Access authorization.
- [ ] Turnstile is validated server-side.
- [ ] Rate limits and idempotency cover public mutations.
- [ ] Status references cannot be enumerated into useful private data.
- [ ] Status secrets are not stored in plaintext or leaked through logs and analytics.
- [ ] Input schemas, URL validation, output encoding, and redirect allowlists are implemented.
- [ ] Database queries are parameterized and credentials are server-side only.
- [ ] Evidence fetching blocks private and metadata address ranges.
- [ ] Upload URLs are short-lived and single-object scoped.
- [ ] Private originals and approved public derivatives are separated.
- [ ] Public exports pass schema, privacy, provenance, and license checks.
- [ ] Security headers and CORS are tested.
- [ ] Logs omit restricted content and record security-relevant events safely.
- [ ] Browser geolocation is optional and not stored as precise history.
- [ ] Retention and deletion jobs are operational.
- [ ] Preview environments use isolated secrets and sanitized data.
- [ ] CI workflows use least privilege and untrusted code receives no production secrets.
- [ ] Backups can be restored without resurrecting deleted restricted data.
- [ ] Incident rollback and previous-public-snapshot recovery are tested.
