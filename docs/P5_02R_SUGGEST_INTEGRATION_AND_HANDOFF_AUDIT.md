# P5-02R Suggest integration and handoff audit

**Implementation item:** P5-02R  
**Status:** Active  
**Last updated:** 2026-07-12

## Purpose

P5-02R audits P5-02A through P5-02Q as one Suggest boundary before P5-03 begins.

The audit must distinguish:

- repository-proven contract, persistence, review, replay, privacy, and workflow behavior;
- fixed-review behavior proven by deployed evidence;
- live checks that are useful for P5-02 closure;
- protected Admin and production checks that remain Launch work;
- behavior intentionally deferred to later Phase 5 slices.

P5-02R does not add a new public Submission type and does not broaden canonical mutation authority.

## Authoritative configured-review baseline

P5-02Q configured verification completed against fixed review main commit:

```text
513dc7f543ac27fe512319a3cc24cc16c3de4302
```

The deployment receipt records:

```text
status: deployed
checks.credentials: success
checks.configuredInputs: success
checks.durableObjectWorker: success
checks.pagesSecrets: success
checks.pagesDeployment: success
checks.configuredVerification: success
```

The configured diagnostic additionally records:

```text
runtime config HTTP 200
site key match true
action match true
readiness HTTP 200
ready true
Suggest CSP present true
Turnstile script-src allowed true
Turnstile frame-src allowed true
```

This proves configured composition, Neon query reachability, Pages-to-Durable-Object reachability, fixed-review deployment, runtime client configuration, and deployed CSP. It does not by itself prove a successful public Suggest POST.

## P5-02 audit path

```text
public /suggest browser contract
↓
runtime client-safe Turnstile configuration
↓
strict browser payload builder
↓
POST /api/suggest HTTP envelope
↓
trusted Cloudflare edge identity
↓
opaque rate-limit bucket derivation
↓
Durable Object fixed-window decision
↓
Turnstile Siteverify decision
↓
strict Suggest parse and normalization
↓
status-secret and contact-protection providers
↓
private atomic Submission persistence
↓
safe public receipt
↓
protected Suggest queue/detail and overlap signals
↓
guarded reviewer transitions
↓
needs-information or time-bounded hold where selected
↓
accepted-as-Candidate transaction where explicitly authorized
↓
no automatic canonical, export, or publication mutation
```

## Audit category 1 — Contract continuity

The audit must prove that the following contracts remain compatible rather than duplicated:

1. the browser form builds the existing P5-02A Suggest schema;
2. the browser request uses the exact P5-02O HTTP envelope;
3. the route injects the existing P5-01/P5-02B private intake service;
4. the route uses the existing P5-02I through P5-02N providers;
5. the protected reviewer path parses the same normalized Suggest projection;
6. accepted-as-Candidate revalidates the normalized payload before transaction planning;
7. no browser-only or route-only alternate Suggest model exists.

## Audit category 2 — Privacy and secret handling

The audit must verify that public or diagnostic output does not expose:

```text
raw CF-Connecting-IP
opaque rate-limit bucket key
Turnstile challenge token
Turnstile secret key
DATABASE_URL
review root seed
any derived HMAC or encryption key
plaintext contact email
contact ciphertext
email hash
request fingerprint
status-token hash
internal Submission UUID
reviewer notes
private original payload
private normalized payload
```

A successful intake receipt may expose only its bounded public fields, including the one-time status secret required by the private follow-up contract.

Workflow and diagnostic logs must not print the challenge token or returned status secret.

## Audit category 3 — Repository integration evidence

Repository checks must cover at minimum:

1. valid Suggest request → one private Submission bundle;
2. exact replay → same public reference and same status secret;
3. changed content under the same idempotency UUID → conflict;
4. malformed content type, body size, UUID, and Suggest payload → bounded HTTP responses;
5. rate-limit denial and provider failure → fail closed with no intake;
6. Turnstile denial and provider failure → fail closed with no intake;
7. safe `Retry-After` behavior for rate-limit denial;
8. browser runtime-config failure → no form submission control;
9. reviewer queue/detail → strict normalized proposal and bounded event history;
10. guarded workflow transition replay/conflict behavior;
11. accepted-as-Candidate → private Source Record, Candidate, origin link, Submission resolution, and event history atomically;
12. all audited paths exclude direct canonical, export, and publication mutation.

## Audit category 4 — Fixed-review synthetic live intake

P5-02R should run one explicit synthetic Suggest journey against:

```text
https://review.cryptopaymap-staging.pages.dev
```

The synthetic record must:

- identify itself clearly as a P5-02R automated review probe;
- contain no real person, private email, receipt, transaction, or ownership information;
- use only fictional business/address content;
- use the fixed-review official Turnstile testing configuration;
- use one audit-controlled idempotency UUID;
- remain private review material;
- never be interpreted as a real CryptoPayMap listing.

The journey must verify:

```text
first valid POST
→ HTTP 202
→ bounded receipt

same UUID + identical body
→ HTTP 202 replay
→ identical public reference
→ identical status secret

same UUID + changed body
→ HTTP 409 conflict
```

The probe must not print or persist the returned status secret outside the ephemeral workflow process and bounded pass/fail comparison.

## Audit category 5 — Public and canonical non-mutation

Before and after the live synthetic intake, the audit must compare stable public review artifacts sufficient to detect accidental publication mutation.

At minimum, compare hashes or exact bytes for:

```text
/data/manifest.json
/version.json
```

Where an additional canonical public export file is already stable and inexpensive to retrieve, include it as well.

The live intake passes this category only when the compared public artifacts are unchanged.

A private Submission row is expected. A public Entity, Location, Claim, Evidence acceptance, Media publication, export release, or activation change is not expected.

## Audit category 6 — Configured environment evidence

P5-02R must retain and reference the successful P5-02Q deployment receipt for the audited main commit or a later compatible main commit.

Configured evidence must remain explicit for:

- Worker deployment;
- Pages secret synchronization;
- Pages deployment;
- Neon lightweight query;
- Durable Object health reachability;
- runtime Turnstile site key and action;
- deployed Suggest CSP.

Repository CI must not be substituted for this evidence.

## Audit category 7 — Handoff decision

P5-02 may hand off to P5-03 only when:

1. P5-02A through P5-02Q repository contracts remain green;
2. the P5-02Q configured receipt is successful;
3. the fixed-review synthetic live intake succeeds or an explicitly documented platform limitation is approved as a retained gate;
4. replay and changed-content conflict are proven at the public route boundary;
5. public artifacts remain unchanged after live intake;
6. no private or secret diagnostic leakage is found;
7. known residual work is assigned to the correct later Phase 5 or Launch item;
8. tracking documents record the actual evidence and do not overstate launch readiness.

## Explicitly retained work

The following are not silently claimed by P5-02R:

- production Turnstile widget and production Siteverify behavior;
- production-domain hostname verification;
- Cloudflare Access identity and protected Admin allowlist verification;
- a live protected reviewer journey;
- configured accepted-as-Candidate execution requiring source and capability configuration;
- configured live 429 timing under shared external runner identity;
- production log-stream inspection;
- production Neon migration-state verification;
- canonical application transactions introduced by later Phase 5 work;
- export/publication activation introduced or exercised by later Phase 5 work;
- production restore and reconciliation drills.

These items remain attached to their existing Phase 5 or Launch gates.

## Failure handling

A failed synthetic probe must report only bounded information:

```text
failed stage
HTTP status
response shape match booleans
public artifact equality booleans
replay equality booleans
```

It must not report request body content, challenge token, status secret, database details, raw edge identity, or provider credentials.

A failed audit must not advance P5-03. The failure must be corrected or explicitly reclassified through a documented decision.

## 2026-07-12 fixed-review audit finding

Repository integration checks pass for the complete Suggest path, including strict schema reuse,
private persistence, exact replay, changed-content conflict, bounded HTTP mapping, protected review
projection, guarded transitions, and accepted-as-Candidate transaction isolation.

The authoritative `staging-review` receipt records `status: deployed` for main commit
`38da5d44605d8400a70ace4ba5a02ef7499823a1`, with all configured checks successful.

The first live P5-02R probe found a configured Turnstile metadata mismatch before private intake:

```text
deployed official always-pass widget token
→ Cloudflare Siteverify success
→ hostname example.com
→ action absent

configured application expectation
→ hostname localhost
→ action test

public Suggest result
→ HTTP 400 suggest_request_invalid
```

The synthetic request itself passes the repository's strict Suggest schema. The probe used only
fictional Place content, no contact data, and an explicit P5-02R automated-review marker. No public
receipt or status secret was returned. `/data/manifest.json` and `/version.json` remained byte-stable
across each bounded attempt.

The audit did not weaken Turnstile success, hostname, or action verification. Exact replay and
changed-content live conflict therefore remain unproven, and P5-02 does not hand off to P5-03.
The configured test-key contract must be corrected without weakening production verification, then
the same fixed-review probe must prove HTTP 202, deterministic replay identity, HTTP 409 changed-body
conflict, and stable public artifacts.

Receipt and repository scanning found no Turnstile token, returned status secret, private payload,
contact data, raw edge identity, database value, or derived key in tracked diagnostics or public
artifacts. Authenticated Actions log download was unavailable to the audit identity (`HTTP 403`), so
production or privileged log-stream inspection remains retained Launch work and is not claimed here.

## Completion result

P5-02R completes when the repository and fixed-review evidence demonstrate that Suggest intake is a real private-review path with deterministic public-route replay/conflict behavior, preserved privacy boundaries, and no automatic public/canonical mutation.

Completion of P5-02R closes P5-02 for the P5-03 handoff. It does not close Phase 5 and does not claim Launch readiness.
