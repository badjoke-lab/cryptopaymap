# P5-01F private follow-up status read boundary

**Implementation item:** P5-01F  
**Status:** Active  
**Last updated:** 2026-07-09

## Purpose

P5-01F closes one remaining P5-01 completion-gate requirement discovered after P5-01E merged: the repository had status-secret issuance, verification helpers, safe status projection schemas, and durable Submission persistence, but no service that actually retrieves a private Submission status through the follow-up credential boundary.

The Phase 5 sequence requires a synthetic Submission to be retrievable through its private follow-up boundary before P5-01 is complete.

P5-01F adds that missing repository service before P5-02 begins.

## 1. Status read input

The private follow-up read service accepts exactly:

```text
public Submission reference
+ status secret
```

The public reference uses:

```text
CPM-S-YYYY-NNNNNN
```

The status secret uses the P5-01A secret format and is verified against the durable one-way token hash.

The service does not accept or expose:

- internal Submission UUID;
- intake request UUID;
- request fingerprint;
- plaintext contact email;
- protected contact ciphertext;
- email hash;
- private payload;
- reviewer internal note;
- rate-limit key;
- remote IP;
- challenge token.

## 2. Persistence read boundary

P5-01F adds a minimal persistence lookup by public Submission reference.

The Drizzle projection selects only:

```text
public_id
workflow_status
resolution
status_token_hash
```

No payload, contact, actor, internal-note, fingerprint, or abuse-control field is selected for status projection.

## 3. Credential verification

The service validates the public reference and secret shapes before lookup.

For a durable record:

```text
status secret
↓
SHA-256 verification
↓
match durable status_token_hash
↓
safe projection
```

A wrong secret fails closed.

## 4. Enumeration-resistant failure boundary

Missing public references and incorrect secrets return the same service-level error:

```text
status_not_available
```

with the same public-safe message.

For valid-shaped credentials on a missing reference, the service still performs one dummy status-secret verification against a fixed-format dummy hash before returning the generic error. This reduces an obvious code-path distinction without claiming complete timing indistinguishability.

The eventual HTTP route must preserve one bounded response class for missing and incorrect credentials and must add route-level rate limiting.

## 5. Safe projection

Successful reads return only the existing strict `submissionPublicStatusProjectionSchema` shape:

```text
publicId
statusLabel
requestedAction
publicMessage
linkedPublicRecord
mediaDecisions
permittedActions
```

P5-01F currently populates:

- public reference;
- bounded public-facing status label;
- permitted response actions.

The following remain intentionally empty until later workflow features exist:

```text
requestedAction: null
publicMessage: null
linkedPublicRecord: null
mediaDecisions: []
```

P5-01F does not fabricate information-request text, publication links, or Media decisions from internal operational fields.

## 6. Permitted action mapping

Current repository mapping:

```text
received
triage
in_review
on_hold
→ withdraw
→ rotate_status_secret

needs_information
→ provide_information
→ withdraw
→ rotate_status_secret

resolved
duplicate
rejected_spam
withdrawn
→ no response actions
```

Actual response endpoints for providing information, withdrawal, and rotation remain later work. The projection only advertises bounded actions that the workflow model permits.

## 7. Public status mapping

The service reuses the P5-01A bounded mapping.

Examples:

```text
received / triage
→ received

in_review
→ under_review

needs_information
→ more_information_needed

on_hold
→ on_hold

resolved + not_approved
→ not_approved
```

Private reason codes and reviewer notes are not projected automatically.

## 8. Test coverage

P5-01F verifies:

1. valid credentials return only the strict safe projection;
2. internal UUID, request UUID, token hash, fingerprint, payload, and contact values are absent;
3. wrong secret and missing reference return the same service error code and message;
4. `needs_information` exposes only the bounded public status and permitted action list;
5. private reviewer notes are not projected;
6. terminal resolution maps to the bounded public status and no response actions;
7. the repository `schema:check` includes one private status-read contract check.

## 9. P5-01E correction

P5-01E correctly closed Audit integration and the A-D cross-slice audit, but its P5-02 gate decision was premature because the Phase 5 sequence also required private follow-up status retrieval.

P5-01F records and closes that gap explicitly. The correction is not treated as a hidden rewrite of the P5-01E result.

P5-01 is complete only after P5-01F merges green.

## 10. Out of scope

P5-01F does not implement:

- public HTTP status route;
- status-page UI;
- status-session cookie;
- follow-up response endpoint;
- withdrawal endpoint;
- secret rotation persistence;
- public information-request text persistence;
- linked-public-record persistence;
- Media decision projection storage;
- route-level rate limiting;
- production environment wiring.

These remain later Phase 5 work.

## 11. Completion criteria

P5-01F is complete when:

1. private status can be read by public reference plus valid status secret;
2. wrong secret and missing reference share one bounded service error;
3. persistence reads only the minimum status fields;
4. successful output passes the strict safe status projection schema;
5. private/internal fields are absent from output;
6. workflow state maps to bounded public labels and actions;
7. focused tests and schema checks are green;
8. full repository validation is green;
9. P5-01E and Phase 5 tracking are corrected transparently;
10. no public status HTTP route or UI is introduced.

## Next

After P5-01F merges green, P5-01 is repository-complete and work may proceed to:

```text
P5-02 — Suggest Place and Online Service
```

P5-02 must compose the shared P5-01 foundation rather than duplicating intake, persistence, secret, abuse-control, or status-projection logic.
