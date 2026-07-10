# P5-02N Turnstile environment binding

**Implementation item:** P5-02N  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02N binds the existing P5-01D Cloudflare Turnstile Siteverify adapter to explicit server and browser configuration while preserving exact hostname and action verification.

This slice does not expose the public Suggest route. It establishes the configuration boundary required by the later public route and form composition slices.

## Environment contract

The required bindings are:

```text
CPM_TURNSTILE_SECRET_KEY
PUBLIC_TURNSTILE_SITE_KEY
CPM_TURNSTILE_EXPECTED_HOSTNAME
CPM_TURNSTILE_EXPECTED_ACTION
```

Responsibilities are separated:

```text
CPM_TURNSTILE_SECRET_KEY
server-only Siteverify credential

PUBLIC_TURNSTILE_SITE_KEY
client-safe site key used to render the widget

CPM_TURNSTILE_EXPECTED_HOSTNAME
exact lowercase hostname expected in successful Siteverify responses

CPM_TURNSTILE_EXPECTED_ACTION
one action identifier shared by widget rendering and server-side response validation
```

The configuration constructor returns only:

- the server-side `SubmissionChallengeVerifier`;
- client-safe site key and action values;
- the expected hostname needed by later configured-environment verification.

The Turnstile secret is never included in the client configuration object.

## Hostname contract

`CPM_TURNSTILE_EXPECTED_HOSTNAME` must be a lowercase hostname only.

It must not include:

- a URL scheme;
- a port;
- a path;
- a query;
- a fragment;
- uppercase labels;
- a trailing dot.

The existing Siteverify adapter compares the returned `hostname` to this configured value exactly. A mismatch is a deny decision.

## Action contract

`CPM_TURNSTILE_EXPECTED_ACTION` must contain 1 through 32 ASCII characters from:

```text
A-Z
a-z
0-9
_
-
```

The same configured action is returned in the client-safe widget configuration and passed to the existing server-side verifier as the expected action.

This prevents browser and server configuration drift inside the application boundary. A successful provider response with a different action is denied by the existing Siteverify adapter.

## Failure behavior

Configuration failures use one bounded error type:

```text
SubmissionTurnstileConfigurationError
```

The public message is generic:

```text
Submission Turnstile configuration is unavailable.
```

Validation detail, secret values, site keys, hostnames, and action values are not copied into configuration error messages.

Challenge verification behavior remains owned by the P5-01D Siteverify adapter:

- valid response with exact hostname and action → allow;
- failed challenge → deny;
- hostname mismatch → deny;
- action mismatch → deny;
- provider internal error, timeout, network failure, invalid JSON, or invalid response shape → unavailable.

## Security and privacy invariants

P5-02N preserves these boundaries:

- the Turnstile secret remains server-only;
- the site key is explicitly client-safe;
- widget action and server expected action derive from one configured value;
- hostname and action validation remain exact;
- no challenge token is logged;
- no configured value is echoed through configuration errors;
- no public route is exposed;
- no intake, Candidate, canonical, export, or publication mutation is added.

## Out of scope

P5-02N does not implement:

- public Suggest API route composition;
- rate-limit policy values;
- HTTP safe error mapping;
- `Retry-After` response headers;
- browser widget component rendering;
- Suggest form UI;
- Content Security Policy changes;
- live Turnstile dashboard hostname configuration;
- live Worker or Pages binding deployment;
- configured-environment end-to-end verification;
- P5-03 work.

Public Suggest intake remains unavailable.

## Completion criteria

P5-02N is complete when:

1. all four Turnstile environment values are parsed through one strict boundary;
2. the existing Siteverify verifier is composed from server configuration;
3. only site key and action are returned as client-safe widget configuration;
4. hostname and action mismatch behavior remains deny;
5. action shape and length are bounded;
6. malformed or missing environment values produce one generic configuration error;
7. configured values are absent from error messages;
8. focused tests and runtime checks pass;
9. full GitHub CI passes;
10. no public route or form is introduced.
