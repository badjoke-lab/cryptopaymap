# CryptoPayMap submission workflow

## Purpose

This document defines how public suggestions, payment reports, problem reports, business claims, and photo submissions move from intake to review, decision, canonical change, and public publication.

The central rule is:

> A submission never changes public canonical data automatically.

Every submission is stored separately, checked, reviewed, and resolved through an explicit decision. A public change is considered published only after the canonical transaction and public-export validation both succeed.

---

## 1. Submission principles

1. **Original input is preserved.** Normalization and reviewer edits never overwrite the safely parsed original payload.
2. **Submission state is not claim state.** A resolved submission does not automatically confirm, stale, end, or publish an acceptance claim.
3. **Review is field-level where useful.** One submitted field may be approved while another is rejected or held.
4. **Candidate is a valid outcome.** Useful but insufficient information may become a private candidate rather than a public record.
5. **Holds are time-bounded.** Every hold has a reason, required action, and next review date.
6. **Private material remains private.** Contact details, transaction URLs, receipts, ownership proof, and restricted media are never exposed through public status pages or exports.
7. **Publication fails closed.** A canonical change is not reported as public until the export and publication run succeed.
8. **Urgent privacy and rights reports take priority.** Temporary hiding may occur before the underlying factual review is complete.
9. **Ownership does not bypass verification.** A verified business representative may propose authoritative corrections, but acceptance claims still follow the verification policy.
10. **No account is required for the MVP.** A public reference and secret status link provide submission follow-up.

---

## 2. Public submission routes

| Route | Submission type | Primary use |
|---|---|---|
| `/suggest` | `suggest` | Suggest a new physical place or online service. |
| `/payment-report` | `payment_report` | Report a successful or failed payment. |
| `/report` | `problem_report` | Report incorrect, ended, duplicate, privacy, rights, or other problematic information. |
| `/claim` | `claim` | Begin verification as a business or service representative. |
| `/photos` | `photos` | Submit public-gallery media for an existing record. |

`/contribute` explains which route to use, how review works, how private information is handled, and that submission does not guarantee publication.

A private follow-up route uses:

```text
/submission-status/{public-id}
```

The route reveals useful information only after separate secret-token validation. It is excluded from public navigation, indexing, and sitemaps.

---

## 3. Common intake contract

Every submission receives:

- an internal UUID;
- an opaque public reference such as `CPM-S-2026-000123`;
- a submission type;
- a workflow status;
- a safely parsed immutable original payload;
- a status-token hash;
- submitted and updated timestamps;
- an audit event.

The plaintext status secret is shown or delivered once and is never stored in plaintext.

### 3.1 Optional contact

Contact information is optional for ordinary suggestions, payment reports, problem reports, and photos.

Contact is required when:

- a claim verification method needs communication;
- a reviewer requests information and the submitter chooses email follow-up;
- another legal or operational requirement makes contact necessary.

Stored contact data is encrypted. A normalized hash may be retained for duplicate or abuse control. Public status pages never display the full email address.

### 3.2 Relationship disclosure

Suggestion and claim forms ask the submitter to identify their relationship to the business or service.

Examples:

- customer;
- employee;
- owner or authorized representative;
- payment provider;
- independent researcher;
- other.

Relationship disclosure informs review but does not automatically determine evidence strength.

### 3.3 Evidence links

Evidence URLs are validated for:

- supported URL scheme;
- plausible public or private purpose;
- duplicate submissions;
- dangerous or local-network destinations;
- prohibited embedded credentials;
- target relevance.

A URL may be stored privately even when its reviewed summary supports a public claim.

---

## 4. Suggest a place or service

### 4.1 Required information

A suggestion asks for:

- physical place or online service;
- business or service name;
- official website where available;
- physical address and map position for a place, or service URL for an online service;
- country and city or locality where applicable;
- category;
- accepted asset;
- network, when known;
- direct-wallet or processor-checkout route;
- processor, when applicable;
- payment method;
- How to pay;
- observation date;
- at least one evidence URL or an approved evidence attachment;
- submitter relationship to the target;
- required submission and rights acknowledgements.

### 4.2 Unknown network

A suggestion may be accepted for review when the network is unknown.

It cannot become a confirmed direct-payment claim until the network is identified and verified.

### 4.3 Suggestion outcomes

Possible outcomes include:

- approved and published as a confirmed record;
- partially approved;
- accepted as a private candidate;
- more information requested;
- placed on hold;
- not approved;
- duplicate;
- no change;
- withdrawn.

A useful suggestion with weak evidence normally becomes a private candidate rather than a misleading public record.

---

## 5. Payment report

### 5.1 Target

A payment report normally starts from a public place or service detail page with the target preselected.

The reviewer must verify that the report applies to the selected location, service, product, region, and date.

### 5.2 Requested information

- payment date;
- successful or failed result;
- asset;
- network;
- route;
- payment method;
- observed steps;
- terminal, QR, invoice, payment-link, or checkout context;
- optional public evidence URL;
- optional private transaction URL;
- optional evidence media;
- optional notes.

The form does not require:

- payment amount;
- submitter name;
- wallet address;
- transaction ID in plain text;
- account creation.

### 5.3 Sensitive payment evidence

Private transaction URLs, receipts, wallet information, and screenshots are restricted by default.

Reviewers use only the minimum material necessary to determine:

- target;
- date;
- route;
- asset;
- network;
- success or failure;
- relevance to the existing claim.

The public record uses a reviewed summary rather than the original private proof.

### 5.4 Positive report behavior

A positive report may:

- add accepted evidence to an existing claim;
- reconfirm an unchanged claim;
- propose a new asset, network, route, or method as a separate reviewed change;
- support a candidate.

A report of a new asset or network never silently overwrites the existing claim.

### 5.5 Negative report behavior

One ordinary failure report normally:

- creates negative evidence;
- creates a priority recheck;
- leaves the public state unchanged;
- does not automatically remove or end the claim.

Two credible independent reports within 30 days normally support:

```text
confirmed → stale
```

Strong official removal or closure evidence may support stale or ended status under the verification policy.

---

## 6. Problem report

### 6.1 Report types

```text
no_longer_accepts_crypto
business_closed
payment_failed
wrong_asset
wrong_network
wrong_instructions
wrong_address
duplicate
unauthorized_image
privacy_issue
other
```

### 6.2 Requested information

- target record;
- report type;
- observed date;
- explanation;
- proposed correction where applicable;
- optional evidence URL;
- optional restricted evidence media;
- optional contact.

### 6.3 Urgent reports

The following may trigger immediate temporary hiding before the factual review is complete:

- exposed personal information;
- unauthorized or dangerous media;
- a materially false listing that creates an immediate safety risk;
- a serious legal or rights concern.

Temporary hiding changes visibility, not verification status.

### 6.4 Duplicate and no-change outcomes

Duplicate and no-change are separate from rejection.

- **Duplicate:** the same actionable report or proposal is already under review or resolved.
- **No change:** the submission was reviewed, but the canonical record already reflects the supported information or no update is justified.

Useful new evidence from a duplicate submission may still be linked to the existing review.

---

## 7. Business or service claim

### 7.1 Claim input

A claim asks for:

- claimant role;
- business or service identity;
- official website;
- official-domain email where applicable;
- affected records, locations, branches, or service scopes;
- current payment details;
- proposed corrections;
- preferred ownership-verification method;
- optional ownership-proof media;
- optional public-gallery media;
- required authority and rights acknowledgements.

### 7.2 Verification methods

Supported MVP methods may include:

- code sent to an official-domain email;
- temporary code placed on an official website;
- DNS TXT record;
- contact from an official social account;
- approved partner-assisted verification.

### 7.3 Claim form does not verify ownership

Submitting a form creates a pending claim submission. It does not:

- create verified ownership;
- grant editing rights;
- confirm acceptance;
- bypass evidence review;
- suppress contradictory evidence;
- change public ranking or status.

### 7.4 Ownership outcome

An approved ownership verification records the relationship and its scope.

The relationship may expire or be revoked. Business-provided changes still pass canonical review and publication validation.

---

## 8. Photo submission

A photo submission asks for:

- target place or service;
- capture date;
- image role;
- description;
- rights holder or authorization basis;
- public-display permission;
- required privacy and rights acknowledgements.

Photo submissions are public-gallery candidates, not verification evidence by default. A payment sign or terminal image may also be reviewed separately as evidence when appropriate.

Media review rules are defined in `MEDIA_POLICY.md`.

---

## 9. Automated intake checks

Before human review, the system performs applicable checks.

### 9.1 Request and abuse controls

- Turnstile or equivalent bot check;
- rate limiting;
- request-size limit;
- supported content type;
- idempotency or duplicate-request protection;
- blocked URL schemes;
- safe parsing;
- HTML and script rejection where plain text is expected.

### 9.2 Field validation

- required fields;
- length limits;
- valid dates;
- valid country and registry values;
- valid coordinates;
- asset and network compatibility without inference;
- processor requirement for processor checkout;
- target record existence;
- public reference format;
- file count and size limits.

### 9.3 Duplicate detection

Potential duplicates may use:

- target and submission type;
- normalized URL;
- normalized business name and address;
- evidence URL;
- content hash;
- media hash;
- recent submission history.

Automatic duplicate detection flags a submission for review. It does not silently discard useful evidence.

### 9.4 Automated checks do not approve

Passing intake checks means only that the submission may enter review. It does not determine factual truth, ownership, rights, or publication eligibility.

---

## 10. Workflow states

### 10.1 Main path

```text
received
→ triage
→ in_review
→ resolved
```

### 10.2 Information request

```text
in_review
→ needs_information
→ in_review
```

### 10.3 Hold

```text
in_review
→ on_hold
→ in_review
```

### 10.4 Exceptional terminal paths

```text
received → rejected_spam
received → duplicate
received → withdrawn
in_review → withdrawn
```

### 10.5 Public-facing labels

| Internal status or resolution | Public-facing label |
|---|---|
| `received`, `triage` | Received |
| `in_review` | Under review |
| `needs_information` | More information needed |
| `on_hold` | On hold |
| `approved` | Approved |
| `partially_approved` | Partially approved |
| `accepted_as_candidate` | Accepted as a candidate |
| `not_approved` | Not approved |
| `duplicate`, `no_change`, `withdrawn` | Closed |

Public labels never expose internal notes, priority, reviewer identity, abuse signals, or private evidence.

---

## 11. Triage

Triage determines:

- submission type;
- new record or existing target;
- target identity;
- duplicate relationship;
- urgency;
- evidence accessibility;
- personal-information risk;
- media-rights risk;
- registry conflicts;
- whether the submission belongs in the product scope;
- the reviewer queue.

Triage may correct classification without altering the immutable original payload.

---

## 12. Reviewer workspace

A submission review presents three distinct values where applicable:

```text
Current canonical value
Submitted value
Reviewer normalized value
```

The workspace also displays:

- original payload;
- proposed changes;
- target identity;
- duplicate candidates;
- evidence classification;
- private and public evidence separation;
- media decisions;
- submission events;
- ownership-verification state;
- canonical impact preview;
- public-export impact preview.

### 12.1 Reviewer actions

- Request information;
- place on hold;
- accept as a private candidate;
- approve selected fields;
- approve all eligible fields;
- reject selected fields;
- not approve the submission;
- mark duplicate;
- close with no change;
- temporarily hide affected public material;
- withdraw at the submitter's request;
- create or link a recheck.

---

## 13. Field-level decisions

Each proposed field may receive:

```text
approve
reject
hold
```

### 13.1 Approved fields

Approved fields are included in the canonical transaction only if the resulting canonical record passes all applicable validation.

### 13.2 Rejected fields

Rejected fields record a reason. Rejection of one field does not invalidate unrelated useful fields.

### 13.3 Held fields

Held fields remain unresolved and require a hold record. A partially approved submission may publish approved fields while held fields remain private, provided the resulting canonical record remains valid and not misleading.

### 13.4 Conflicting field combinations

The reviewer cannot approve a combination that violates canonical invariants, such as:

- direct wallet with an unknown network;
- processor checkout without a processor;
- confirmed status without qualifying evidence;
- public media without rights and privacy approval;
- a location pin from platform capability alone.

---

## 14. Holds

### 14.1 Required hold fields

```text
hold_reason
placed_on_hold_at
next_review_at
required_action
```

### 14.2 Hold reasons

```text
awaiting_official_confirmation
conflicting_evidence
location_ambiguous
brand_scope_unclear
rights_review
technical_verification
asset_network_unregistered
```

### 14.3 Review cadence

A hold is reviewed at an appropriate checkpoint, normally 30, 60, or 90 days after placement depending on the required action.

At or before 90 days, the reviewer normally chooses one of these outcomes:

- return to active review;
- accept as a private candidate;
- not approve;
- close with no change;
- replace the hold with a new explicitly justified review path.

Indefinite passive holds are not permitted.

### 14.4 Public hold message

The submitter sees a concise public reason and requested action. Internal risk analysis and reviewer notes remain private.

---

## 15. Information requests

A reviewer may request:

- target clarification;
- observation date;
- asset or network clarification;
- payment steps;
- official source;
- ownership verification;
- media rights confirmation;
- privacy-safe replacement evidence.

The status link allows the submitter to:

- read the request;
- reply;
- add evidence;
- replace a rejected attachment where permitted;
- withdraw.

New responses append to submission history and never overwrite the original payload.

---

## 16. Resolutions

```text
approved
partially_approved
accepted_as_candidate
not_approved
duplicate
no_change
withdrawn
```

### 16.1 Approved

All accepted proposed changes were applied through a valid canonical transaction and any required public publication succeeded.

### 16.2 Partially approved

At least one proposed change was applied while another was rejected or held.

The public status explains only the approved and unresolved outcome needed by the submitter.

### 16.3 Accepted as a candidate

The information is useful for further investigation but does not meet public confirmation requirements.

The candidate remains private.

### 16.4 Not approved

The submission does not justify a canonical public change.

Common reasons include:

```text
out_of_scope
insufficient_evidence
unverifiable
false_or_misleading
spam_or_promotion
no_media_rights
contains_unnecessary_personal_information
repeated_duplicate
```

### 16.5 Duplicate

The actionable matter is already represented by another submission or review.

### 16.6 No change

The current canonical record already reflects the supported information or the review does not justify a change.

### 16.7 Withdrawn

The submitter withdrew the submission before final resolution. Lawful audit, abuse-control, or rights metadata may remain according to retention policy.

---

## 17. Canonical transaction

Approved changes are applied in one controlled database transaction that may include:

- entity or location changes;
- acceptance-claim changes;
- asset, network, route, or method relationships;
- evidence;
- verification events;
- approved media metadata;
- ownership-verification state;
- submission decision;
- audit event.

If any required operation fails, the transaction rolls back.

### 17.1 Publication run

After canonical commit:

```text
canonical change
→ publication pending
→ public projection generation
→ schema, privacy, provenance, and license validation
→ publication succeeds or fails
```

The submitter is not told that a change is public while the publication run is pending or failed.

### 17.2 Publication failure

When publication fails:

- the last valid public snapshot remains available;
- the submission resolution records publication pending or failed internally;
- the submitter sees a non-misleading processing state;
- an operator can retry or roll back according to operations policy.

---

## 18. Secret status link

### 18.1 Access

The status page requires:

- public submission reference;
- separate secret token or signed access mechanism;
- rate limiting;
- noindex and no-store behavior where appropriate.

The URL or token must not be included in analytics, referrer leakage, public logs, or support screenshots.

### 18.2 Displayed information

The submitter may see:

- public reference;
- submission type;
- current public-facing status;
- submitted date;
- information requests;
- public hold reason;
- final resolution;
- linked public record after publication;
- per-media public decision;
- allowed response actions.

### 18.3 Hidden information

The page never shows:

- internal priority;
- reviewer identity;
- private evidence from other people;
- abuse signals;
- internal notes;
- ownership-proof details;
- another submission's content;
- canonical candidate queues.

### 18.4 Token loss

A lost token is not recoverable through public enumeration. A secure recovery path may use the verified contact address when one exists.

---

## 19. Notifications

The MVP may notify a submitter when:

- a submission is received;
- more information is needed;
- a hold requires action;
- the submission is resolved;
- a public change is successfully published;
- submitted media is approved or rejected.

Notifications contain the minimum necessary information and do not embed sensitive evidence or full status secrets in message previews.

---

## 20. Privacy and retention

Submission retention separates:

- immutable audit facts;
- contact data;
- private evidence;
- media originals;
- status history;
- abuse-control hashes;
- canonical contributions.

Deletion schedules and media-specific retention are defined in `MEDIA_POLICY.md` and the privacy architecture.

A deletion request is reviewed for:

- personal data;
- evidence value;
- legal retention;
- rights disputes;
- public canonical facts;
- audit necessity.

Removing private source material does not automatically remove a separately verified public factual claim.

---

## 21. Administrative routes

### 21.1 Queue

`/admin/submissions`

Filters may include:

- type;
- workflow status;
- target type;
- urgency;
- evidence status;
- media status;
- ownership-verification status;
- age;
- duplicate group;
- hold review date.

### 21.2 Detail

`/admin/submissions/{id}`

Recommended order:

1. submission summary;
2. current canonical record;
3. original, submitted, and normalized values;
4. proposed field diff;
5. evidence review;
6. media review;
7. ownership verification where applicable;
8. submission and audit history;
9. decision controls;
10. publication result.

---

## 22. Audit requirements

Every material transition records:

- actor type;
- action;
- subject;
- previous and new workflow state;
- reason code;
- timestamp;
- correlation ID where applicable;
- public message where applicable;
- private note where needed.

The audit trail is private by default. Public history is generated from reviewed public verification events, not raw audit payloads.

---

## 23. Workflow checklist

Before resolving a submission, verify:

- [ ] The original payload remains preserved.
- [ ] The target and submission type are correct.
- [ ] Duplicate relationships were reviewed.
- [ ] Evidence was classified under the verification policy.
- [ ] Private and public evidence are separated.
- [ ] Media received independent rights and privacy decisions.
- [ ] Each proposed field has approve, reject, or hold state where needed.
- [ ] Holds have reasons and future review dates.
- [ ] The canonical transaction preserves all invariants.
- [ ] Ownership verification does not bypass acceptance verification.
- [ ] Public messages contain no internal notes or personal data.
- [ ] Publication validation succeeded before reporting a public result.
- [ ] Retention and deletion schedules were assigned.
