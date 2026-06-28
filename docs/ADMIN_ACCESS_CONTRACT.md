# CryptoPayMap administration access contract

## Purpose

P3-02 establishes a protected administration route and a responsive administration shell without exposing private data.

```text
request to /admin or /admin/*
  -> Cloudflare Access application policy
  -> Pages Function middleware
  -> JWT signature, issuer, audience, and time validation
  -> verified administration identity
  -> static administration shell
```

The shell is not an authentication system and does not contain an administration account database.

## Route boundary

The administration interface is mounted under:

```text
/admin
/admin/candidates
/admin/claims
/admin/evidence
/admin/rechecks
/admin/submissions
/admin/media
/admin/exports
/admin/audit
```

A nested Pages Function middleware at `functions/admin/_middleware.ts` applies to the administration path and its descendants. Public pages and public static assets do not use this middleware.

## Cloudflare Access assertion validation

The middleware validates the `Cf-Access-Jwt-Assertion` on the server before serving an administration response.

The verifier:

- requires a three-part JWT;
- accepts only an `RS256` header with a non-empty signing-key ID;
- fetches signing keys from the configured Cloudflare Access team origin;
- selects the matching RSA signing key;
- verifies the JWT signature through Web Crypto;
- requires the configured issuer and application audience;
- rejects expired and not-yet-valid assertions;
- derives administration identity only from the verified payload.

The application does not trust the presence of the assertion header, an email header, or any caller-supplied identity value without cryptographic verification.

## Runtime configuration

Required Pages Function environment variables:

```text
CF_ACCESS_TEAM_DOMAIN
CF_ACCESS_AUD
```

`CF_ACCESS_TEAM_DOMAIN` must be the HTTPS team origin under `cloudflareaccess.com` with no path, query, fragment, credentials, or custom port.

`CF_ACCESS_AUD` must be the 64-character application audience tag copied from the Access application configuration.

Values are deployment configuration and are not committed to the repository or embedded in the static site.

## Fail-closed behavior

Missing or malformed Access configuration returns:

```text
HTTP 503
Cache-Control: private, no-store
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow, noarchive
```

A missing, malformed, expired, wrong-issuer, wrong-audience, unknown-key, or invalid-signature assertion returns the same private response headers with HTTP 403.

Failure responses do not reveal the missing variable, team name, audience tag, key identifier, assertion content, or internal verification details.

There is no production or local request-header bypass. Local verification uses injected fetch, Web Crypto, clock, and verifier test doubles rather than disabling the route boundary.

## Verified identity

After successful assertion verification, the payload is converted into an administration identity.

```text
actor_id
  cloudflare-access:<verified sub>

actor_type
  human when a verified email claim exists
  system when the verified token has no email claim
```

The actor ID is derived from the verified subject, not a caller-supplied header. Email is optional because service authorizations may not have identity-provider fields.

The verified identity is placed in the Pages Function request context for later protected services. It is not embedded in generated HTML or browser storage.

P3-02 does not grant write capabilities based on email or domain. Later services must explicitly map the verified identity to required administration capabilities.

## Static shell boundary

The generated administration HTML contains:

- navigation;
- responsive layout;
- protected-workspace explanation;
- placeholders for later review areas;
- noindex metadata.

It does not contain:

- Candidate records or counts;
- source records or raw payloads;
- Evidence payloads;
- contacts or submissions;
- verified user email;
- Access team domain or audience tag;
- database credentials;
- canonical write controls;
- public export controls.

Static JavaScript and CSS may remain ordinary public assets because they contain application presentation code only. Private data must be fetched later through protected administration services.

## Caching and indexing

Administration responses use:

```text
Cache-Control: private, no-store
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: no-referrer
```

The middleware applies these headers to successful and failed administration responses. The static `_headers` file provides a defense-in-depth rule for `/admin/*`, and the HTML contains equivalent robots and referrer metadata.

## Shell behavior

The shell provides:

- a separate administration layout rather than the public site navigation;
- horizontal mobile navigation and persistent desktop navigation;
- visible protected-workspace state;
- keyboard skip navigation;
- active-route indication;
- placeholders for Phase 3 review areas;
- a route back to the public site.

The shell does not imply that data services or review actions are available.

## Testing

Repository tests cover:

- valid configuration normalization;
- missing, insecure, non-Cloudflare, path-bearing, and malformed configuration rejection;
- fail-closed response behavior;
- human and service identity normalization from verified payloads;
- malformed and missing assertion rejection;
- signing-key retrieval and key selection;
- signature verification failure;
- issuer, audience, expiration, and not-before boundaries;
- no verifier invocation when configuration is unavailable;
- verified identity propagation only after successful verification;
- no shell response after verification failure;
- static administration routes in the built artifact;
- noindex and no-store markers;
- absence of private and server-only markers in generated administration HTML.

Live Cloudflare Access validation remains deferred until deployment configuration is available. The first live check must verify an authorized browser request, a denied request, an expired or wrong-audience token, direct administration subroutes, and logout behavior.

## Later Phase 3 use

Later administration items must:

- obtain identity only from the verified request context;
- map identity to explicit capabilities;
- keep every private API under an equivalent Access boundary;
- return no private data before authorization;
- never use the static shell as proof of permission;
- preserve no-store and noindex behavior.
