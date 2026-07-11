# P5-02P public Suggest form and Turnstile browser wiring

**Implementation item:** P5-02P  
**Status:** In progress  
**Last updated:** 2026-07-11

## Purpose

P5-02P adds the public `/suggest` browser experience on top of the completed P5-02O HTTP route.

The slice provides:

- a public contribution entry page;
- a React Suggest form;
- a browser payload builder that reuses the existing Suggest intake schema;
- explicit Cloudflare Turnstile rendering;
- browser POST orchestration to `/api/suggest`;
- bounded public error presentation;
- private receipt presentation;
- `/suggest`-scoped Turnstile Content Security Policy;
- focused browser-contract and component tests;
- built-artifact leakage and CSP checks.

The slice does not claim configured live intake readiness. Live Worker, Pages binding, Turnstile dashboard, secrets, database, and end-to-end verification remain separate work.

## Public entry pages

```text
/contribute
/suggest
```

`/contribute` provides the public contribution entry surface. In this slice:

- Suggest is available;
- payment/problem reports are shown as planned;
- claims and photos are shown as planned.

`/suggest` contains the real Suggest browser form.

## Browser form scope

The form supports:

- physical Place or Online Service selection;
- name;
- official HTTPS website;
- country code;
- physical address fields;
- one optional category proposal;
- one primary payment proposal;
- Asset;
- Network;
- route type;
- payment method;
- Processor details for Processor Checkout;
- How to pay;
- restrictions;
- observation date;
- one public Evidence URL and summary;
- relationship disclosure;
- optional contact email and contact permission;
- Privacy and Terms acknowledgements;
- Turnstile verification.

The existing domain schema remains authoritative. The browser payload builder ends by parsing the assembled payload through `suggestSubmissionIntakeSchema`.

Unknown payment details may remain null when the domain contract permits incomplete but useful Candidate material. The browser form never infers Network from Asset.

## Browser submission contract

The browser sends:

```text
POST /api/suggest
Content-Type: application/json
Idempotency-Key: <browser UUID>
```

Body:

```json
{
  "challengeToken": "<Turnstile token>",
  "submission": {
    "...": "strict submission-common-v1 + suggest-v1 intake"
  }
}
```

The request UUID is retained across retries of the same browser attempt. A `409` response clears the browser request UUID so a later explicit retry can use a new request identity.

Turnstile is reset after unsuccessful HTTP responses or transport failure. A successful receipt replaces the form.

## Turnstile browser contract

The form loads:

```text
https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit
```

The widget is rendered explicitly with:

- configured public site key;
- configured action;
- light theme;
- flexible size;
- success callback;
- error callback;
- expiration callback.

The submit button remains disabled until a challenge token exists. Missing site key or action fails closed and leaves submission disabled.

The secret key is never present in browser configuration.

## CSP boundary

The Turnstile policy is scoped to `/suggest`.

The page permits the Cloudflare challenge origin for:

```text
script-src
frame-src
```

The policy also keeps:

```text
connect-src 'self'
form-action 'self'
frame-ancestors 'none'
```

The browser submits only to the same-origin `/api/suggest` route.

## Success receipt

A `202` response replaces the form with:

- Submission reference;
- private status secret;
- explicit instruction to save both values.

The status secret is displayed because it is required for private follow-up. It is not written to local storage by this slice.

## Error presentation

The form presents bounded messages for:

- invalid request;
- idempotency conflict;
- body too large;
- unsupported request format;
- rate limit, including approximate Retry-After seconds when supplied;
- generic service unavailable;
- browser transport failure.

Internal provider detail and server exception text are not rendered.

## Privacy and security invariants

P5-02P preserves these boundaries:

- no raw IP handling exists in browser code;
- Turnstile secret remains server-only;
- challenge tokens are held only in component state for request submission;
- status secret is shown only in the success receipt and is not persisted to browser storage;
- private environment names and server secret values are checked for absence from built Suggest HTML;
- submissions remain private review material;
- no Candidate, canonical, export, or publication mutation is performed by browser code.

## Validation

P5-02P adds:

- payload-builder tests for physical and online Suggests;
- schema rejection tests;
- Turnstile explicit-rendering component tests;
- browser POST envelope and private-receipt component tests;
- missing-configuration fail-closed component test;
- built `/suggest` and `/contribute` artifact checks;
- private-marker leakage checks;
- Turnstile CSP artifact checks.

## Out of scope

P5-02P does not perform:

- live Durable Object deployment;
- live Pages Durable Object binding verification;
- live Neon database verification;
- live Turnstile dashboard hostname verification;
- live secret configuration;
- configured end-to-end Suggest submission;
- public status-page UI extension;
- multiple payment proposal UI;
- multiple Evidence-link UI;
- image upload;
- canonical mutation;
- export or publication;
- P5-03 work.

## Completion criteria

P5-02P is complete when:

1. `/contribute` exposes the available Suggest path without claiming later forms are available;
2. `/suggest` renders a real React form;
3. browser values assemble into the existing strict Suggest intake schema;
4. Turnstile uses explicit rendering with configured site key and action;
5. missing browser configuration fails closed;
6. browser POST uses the P5-02O HTTP route and UUID idempotency key;
7. failed attempts reset the Turnstile token;
8. successful `202` response shows the private receipt;
9. `/suggest` CSP permits the required Turnstile script/frame origins and keeps same-origin submission;
10. private server markers are absent from built Suggest HTML;
11. focused tests, build artifact checks, and full GitHub CI pass;
12. configured live intake readiness is not claimed.
