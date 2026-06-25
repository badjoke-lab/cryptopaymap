# CryptoPayMap operations

## Purpose

This document defines the public operational contract for candidate intake, review, reconfirmation, submissions, media, publication, public updates, product releases, incident handling, backups, corrections, support, and partnerships.

It explains how the service protects verification quality and publication integrity without exposing private review queues, personal data, security details, or internal planning information.

---

## 1. Operating principles

1. **Review before publication.** Imports, external observations, and public submissions never update public canonical data automatically.
2. **Current public data is a validated projection.** The operational database is not published directly.
3. **Verification and commercial relationships are independent.** Support, sponsorship, advertising, or partnership cannot purchase confirmation, ranking, or favorable review.
4. **Reconfirmation is part of the product.** Previously confirmed records are reviewed again and may become stale or ended.
5. **History is preserved.** Corrections and status changes create auditable events rather than silently rewriting the past.
6. **Privacy and rights can override ordinary publication timing.** Sensitive or unauthorized material may be hidden while review continues.
7. **Publication fails closed.** A failed validator or incomplete artifact does not replace the previous valid public version.
8. **Public communication uses verified facts.** Operational explanations do not expose private submitters, internal notes, security-sensitive details, or unsupported claims.
9. **The service may slow intake to protect quality.** New collection does not take priority over unresolved corrections, privacy issues, or stale public records.
10. **Operational procedures are testable and reversible.** Important actions have checks, audit events, and rollback paths.

---

## 2. Operational record flow

```text
source or submission
→ candidate or review item
→ identity and scope check
→ evidence review
→ normalized proposed change
→ canonical transaction
→ publication run
→ validated public artifact
→ public page, Stats, and Updates
```

A record is not public merely because it exists in an import, candidate queue, submission, or canonical table.

---

## 3. Candidate intake

Candidate sources may include:

- official merchant or service pages;
- current checkout observations;
- official social statements;
- payment-processor sources;
- OpenStreetMap;
- community directories;
- legacy CryptoPayMap data;
- public suggestions;
- payment reports;
- problem reports;
- verified business representatives.

### 3.1 Intake output

Intake creates or links:

- source record;
- source candidate;
- provenance;
- suspected duplicate group;
- initial target identity;
- applicable private review item.

### 3.2 Intake does not confirm

Automated collection may:

- normalize identifiers;
- detect duplicates;
- validate URLs and coordinates;
- check registries;
- assign a review category;
- compare source changes.

It may not:

- create a public map pin;
- mark a claim confirmed;
- publish a new asset or network combination;
- accept image rights;
- verify a business owner;
- overwrite canonical payment instructions.

### 3.3 Intake prioritization

Operational prioritization may consider:

- privacy or rights risk;
- closure or ended-payment reports;
- serious public inaccuracy;
- current confirmed records approaching review;
- evidence strength;
- duplicate resolution;
- public usefulness;
- geographic or category coverage.

Private priority values and queue positions are not public promises.

---

## 4. Identity and duplicate review

Before reviewing payment acceptance, the operator determines:

- business or service identity;
- brand versus branch;
- physical location versus online scope;
- official website;
- duplicate records;
- legacy identifiers;
- applicable category;
- location status;
- source and license provenance.

Duplicate candidates may be merged into one review group while preserving all useful source links and evidence.

A brand-level statement does not automatically create branch records.

---

## 5. Verification review

Verification follows `VERIFICATION_POLICY.md`.

A reviewer confirms:

- exact target and scope;
- asset;
- network;
- payment route;
- payment method;
- processor where applicable;
- How to pay;
- restrictions;
- evidence class and independence;
- last confirmation date;
- next review date;
- public evidence summary;
- absence of newer material contradiction.

### 5.1 Reviewer result

A review may result in:

- confirmed;
- stale;
- ended;
- rejected;
- private candidate retained;
- more information required;
- temporary hiding for privacy, rights, or safety review.

### 5.2 Canonical transaction

Approved changes are applied in a controlled transaction that includes the required audit and verification events.

No public change is announced until publication succeeds.

---

## 6. Reconfirmation

Every confirmed claim has a future review date derived from its evidence basis and policy.

### 6.1 Recheck process

```text
review becomes due
→ inspect current official and direct sources
→ compare payment details
→ record accepted and contradictory evidence
→ reconfirm, mark stale, or mark ended
→ set next review date where applicable
→ publish validated update
```

### 6.2 Stale behavior

Stale records:

- remain available where useful as clearly labeled history;
- are excluded from default active discovery;
- do not count as currently confirmed;
- may return to confirmed after sufficient reconfirmation.

### 6.3 Ended behavior

Ended records:

- are removed from normal active discovery;
- retain public status and evidence history when appropriate;
- may retain legacy redirects;
- are not silently deleted merely to improve public metrics.

### 6.4 Conflicting evidence

A material contradiction creates a review item. Newer directly applicable evidence receives priority according to the verification policy.

One ordinary failure report does not automatically end a claim.

---

## 7. Submission operations

Submission handling follows `SUBMISSION_WORKFLOW.md`.

### 7.1 Intake

- validate Turnstile on the server;
- apply request and upload limits;
- preserve the original payload;
- generate an opaque reference and secret status access;
- classify the submission;
- detect possible duplicates;
- store private evidence and contact data separately.

### 7.2 Review

Reviewers compare:

```text
current canonical value
submitted value
reviewer normalized value
```

Each proposed field may be approved, rejected, or held.

### 7.3 Holds

A hold requires:

- reason;
- required action;
- date placed on hold;
- next review date;
- public-safe message.

Indefinite passive holds are not allowed.

### 7.4 Submitter communication

The private status page may show:

- Received;
- Under review;
- More information needed;
- On hold;
- Approved;
- Partially approved;
- Accepted as a candidate;
- Not approved;
- Closed.

It never shows internal priority, reviewer notes, another person's evidence, or abuse signals.

---

## 8. Media operations

Media handling follows `MEDIA_POLICY.md`.

### 8.1 Intake and quarantine

- upload enters private quarantine;
- validate file signature, size, dimensions, and decode safety;
- compute hashes;
- record purpose and rights claim;
- keep original private;
- create no public URL before approval.

### 8.2 Review

Media review covers:

- target accuracy;
- evidence, ownership, or gallery purpose;
- rights basis;
- privacy and sensitive information;
- misleading or outdated content;
- public derivative processing;
- attribution;
- retention.

### 8.3 Public media

Only approved derivatives are public. Public listings continue with another approved image or a neutral placeholder when media is removed or rejected.

### 8.4 Takedown

A credible privacy, rights, or safety report may immediately restrict public access while review continues.

Media takedown does not automatically change the acceptance claim.

---

## 9. Publication operations

### 9.1 Publication trigger

Publication may be triggered by:

- approved canonical change;
- reconfirmation;
- stale or ended transition;
- approved media change;
- policy or schema release;
- planned full rebuild.

### 9.2 Publication stages

```text
pending
→ validating
→ published | failed
```

The publication job:

1. reads eligible canonical projections;
2. generates versioned artifacts;
3. validates schema;
4. validates public eligibility;
5. checks private-field leakage;
6. checks provenance and license metadata;
7. checks referential and geographic integrity;
8. computes hashes and counts;
9. promotes the validated version;
10. invalidates affected cache entries;
11. records a publication event.

### 9.3 Failed publication

A failed run:

- preserves the prior public artifacts;
- records a safe internal error;
- does not report a change as published;
- may be retried after correction;
- may trigger rollback of the canonical change if the problem cannot be resolved safely.

### 9.4 Public dataset version

Every published dataset has:

- schema version;
- dataset version or build identifier;
- generated time;
- artifact hashes;
- public record counts;
- source and license manifest.

---

## 10. Stats operations

Stats describe the current public dataset.

Stats are generated only from public-eligible canonical projections.

They exclude:

- source candidates;
- private submissions;
- internal review queues;
- rejected records;
- duplicate observations;
- private media;
- temporarily hidden data where counting would disclose restricted information.

Stats may cover:

- confirmed physical places;
- confirmed online services;
- countries and cities;
- stale and ended public records;
- direct-wallet and processor routes;
- public asset and network distribution;
- How-to-pay coverage;
- network-specified rate;
- evidence-backed rate;
- recent reconfirmation;
- stale rate;
- public change trends.

Stats describe CryptoPayMap's published dataset, not the entire global market.

---

## 11. Updates operations

`/updates` records changes to public acceptance records.

Examples:

- newly confirmed;
- reconfirmed;
- payment method changed;
- asset or network changed;
- marked stale;
- ended;
- newly published online service.

### 11.1 Update source

Updates are generated from reviewed public verification events and public summaries.

Raw audit events and private submission details are not published.

### 11.2 Corrections

A mistaken update is corrected through a new reviewed event or explicit correction. Public history is not silently rewritten when the correction itself is relevant.

---

## 12. Changelog operations

The product Changelog records released product changes, not routine record activity.

### 12.1 Included

- new user-facing capability;
- significant UI or navigation change;
- map or search change;
- public schema change;
- verification-policy change;
- privacy, terms, or source-policy change;
- API change;
- significant bug fix;
- security fix suitable for public disclosure;
- redirect or migration behavior;
- meaningful performance or accessibility improvement.

### 12.2 Excluded

- one new place;
- routine reconfirmation;
- candidate intake;
- private research;
- unpublished pull requests;
- repository administration without product impact.

### 12.3 Release format

```text
Version 0.x.y
Release date

Added
Changed
Fixed
Data and verification
Security
Deprecated
Removed
```

Version guidance:

- `0.x.0` for a recognizable capability or contract change;
- `0.x.y` for fixes and small public changes;
- `1.0.0` for the completed formal MVP.

Pull requests do not automatically create Changelog versions. Several pull requests may form one public release.

---

## 13. Public Roadmap operations

The user-facing Roadmap shows capabilities, not private execution metrics.

Sections:

```text
Now
Next
Later
Exploring
```

Allowed status labels:

```text
In progress
Planned
Completed
Under consideration
Revised
```

The public Roadmap does not publish:

- private candidate totals;
- internal queue size;
- pull-request targets;
- revenue or sponsorship targets;
- private deadlines;
- personal circumstances;
- private launch thresholds;
- percentages that imply false precision.

### 13.1 Changes to plans

Roadmap items are not silently removed after public commitment.

Use:

- Revised;
- Merged into another milestone;
- Moved to Exploring;
- No longer planned.

Public reasons use product, data-quality, security, accessibility, maintenance, or dependency explanations.

### 13.2 Completion

A completed Roadmap capability links to the applicable Changelog release. Completed items do not remain indefinitely in the active plan.

---

## 14. Support and partnership integrity

### 14.1 Support

Support is voluntary and does not provide:

- confirmed status;
- faster favorable review;
- ranking advantage;
- suppression of negative evidence;
- special treatment in Stats;
- exemption from source, rights, or privacy policy.

### 14.2 Partnerships

Public partnership categories may include:

- data collaboration;
- processor integration;
- sponsorship;
- regional verification;
- research or tooling collaboration.

Partnerships are disclosed where relevant. Partner-provided data remains subject to provenance, scope, verification, and conflict review.

### 14.3 Sponsored presentation

Sponsored content, if introduced, is visibly labeled and separated from confirmed acceptance status and organic ranking.

---

## 15. Public corrections and appeals

A public record may be challenged through:

- payment report;
- problem report;
- business claim;
- contact or rights channel.

A reviewer records:

- target;
- issue type;
- evidence;
- status and visibility impact;
- public correction where needed;
- notification outcome where applicable.

A business relationship does not grant the right to remove accurate public history, but valid privacy, rights, legal, or factual correction requests are handled under the applicable policy.

---

## 16. Incident operations

Security and privacy incidents follow `SECURITY_AND_PRIVACY.md`.

Operational incidents may include:

- invalid public export;
- broken map or discovery route;
- publication pipeline failure;
- migration error;
- widespread stale information;
- private media exposure;
- attribution failure;
- redirect failure;
- database corruption;
- external dependency outage.

### 16.1 Immediate controls

Depending on incident:

- stop publication;
- restore previous public artifacts;
- disable affected route;
- temporarily hide affected records or media;
- revoke credentials;
- isolate an environment;
- invalidate cache;
- begin audit review.

### 16.2 Public communication

Public incident communication states verified impact, mitigation, and restoration information without exposing private evidence, secrets, or attack details that increase current risk.

---

## 17. Backup operations

Backups cover:

- database schema and migrations;
- canonical and required review data;
- public artifacts;
- media metadata;
- private objects still within retention;
- configuration inventory;
- redirect and legacy mapping data.

### 17.1 Backup principles

- encrypt and restrict access;
- keep production credentials out of backup documentation;
- test restoration;
- record backup and restore events;
- prevent deleted restricted data from being unintentionally republished;
- preserve prior valid public artifacts separately from operational backups.

### 17.2 Restore validation

A restore test verifies:

- database integrity;
- migration compatibility;
- public projection generation;
- private/public separation;
- object relationships;
- deleted-data handling;
- secret rotation requirements.

---

## 18. Dependency and source outages

When a source, map provider, archive, processor page, or infrastructure dependency is unavailable:

- do not invent missing facts;
- preserve the last valid public record with its date;
- record the failed check privately;
- retry according to bounded operations;
- mark stale when freshness policy requires it;
- switch to an approved compatible provider when the architecture allows;
- communicate only verified user impact.

---

## 19. Quality review

Periodic quality review checks:

- expired confirmations;
- records missing How to pay;
- records missing network or payment method;
- broken evidence URLs;
- orphan records;
- duplicate public records;
- invalid coordinates;
- provenance and license gaps;
- public/private leakage;
- unauthorized media;
- stale redirects;
- mismatched Stats and public artifacts;
- roadmap and changelog drift.

Quality failures create review or correction work and may block publication.

---

## 20. Operational documentation

The following public documents must remain consistent:

- `PRODUCT_SPEC.md`;
- `MVP_SCOPE.md`;
- `INFORMATION_ARCHITECTURE.md`;
- `DATA_MODEL.md`;
- `VERIFICATION_POLICY.md`;
- `SOURCE_AND_LICENSE_POLICY.md`;
- `SUBMISSION_WORKFLOW.md`;
- `MEDIA_POLICY.md`;
- `TECH_ARCHITECTURE.md`;
- `SECURITY_AND_PRIVACY.md`;
- this document;
- `MIGRATION_AND_CUTOVER.md`;
- `LAUNCH_CRITERIA.md`;
- `ROADMAP.md`.

Material changes require:

- reviewed pull request;
- impact assessment;
- migration or compatibility review where applicable;
- Changelog review after public release;
- updated validators or tests.

---

## 21. Operational readiness checklist

Before enabling public contribution or production publication, verify:

- [ ] Candidate intake cannot publish automatically.
- [ ] Reviewers can compare submitted, normalized, and canonical values.
- [ ] Verification events and public summaries are auditable.
- [ ] Reconfirmation and stale handling are operational.
- [ ] Submission holds have future review dates.
- [ ] Private status access exposes only a safe projection.
- [ ] Media quarantine, review, derivative, and deletion paths work.
- [ ] Public export validation fails closed.
- [ ] Previous valid artifacts can be restored.
- [ ] Stats use only public-eligible canonical data.
- [ ] Updates and Changelog use separate event sources.
- [ ] Roadmap changes preserve public history.
- [ ] Support and partnership cannot affect verification.
- [ ] Backup restoration has been tested.
- [ ] Incident, rights, and privacy hiding procedures work.
