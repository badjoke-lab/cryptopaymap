# CryptoPayMap administration access contract

## Purpose

P3-02 establishes a protected administration route and a responsive administration shell without exposing private data.

```text
request to /admin or /admin/*
  -> Cloudflare Access application policy
  -> Pages Function middleware
  -> JWT signature, issuer, and audience validation
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

## Cloudflare Access validation

The middleware uses the official Cloudflare Access Pages Plugin.

The Plugin validates the application JWT against:

- the configured Cloudflare Access team domain;
- the configured application audience tag;
- Cloudflare Access signing keys.

Requests that fail Plugin validation receive `403` from the Plugin. The application does not trust the presence of `Cf-Access-Jwt-Assertion` or identity headers without cryptographic validation.

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
Cache-Control: no-store
Referrer-Policy: no-referrer
```

The response does not reveal the missing variable, team name, audience tag, or internal configuration details.

There is no production or local request-header bypass. Local verification uses injected test middleware and synthetic verified payloads rather than disabling the route boundary.

## Verified identity

After the Plugin validates a request, its verified payload may be converted into an administration identity.

```text
actor_id
  cloudflare-access:<verified sub>

actor_type
  human when a verified email claim exists
  system when the verified token has no email claim
```

The actor ID is derived from the verified subject, not a caller-supplied header. Email is optional because service authorizations may not have identity-provider fields.

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

Administration HTML responses use:

```text
Cache-Control: private, no-store
X-Robots-Tag: noindex, nofollow, noarchive
Referrer-Policy: no-referrer
```

The HTML also contains equivalent `robots` and `referrer` metadata.

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
- incomplete payload rejection;
- no Plugin invocation when configuration is unavailable;
- delegation to the Plugin when configuration is valid;
- static administration routes in the built artifact;
- noindex and no-store markers;
- absence of private and server-only markers in generated administration HTML.

Live Cloudflare Access validation remains deferred until the deployment configuration is available. The first live check must verify an authorized browser request, a denied request, an expired or wrong-audience token, direct administration subroutes, and logout behavior.

## Later Phase 3 use

Later administration items must:

- obtain identity only from Plugin-verified payload data;
- map identity to explicit capabilities;
- keep every private API under an equivalent Access boundary;
- return no private data before authorization;
- never use the static shell as proof of permission;
- preserve no-store and noindex behavior.
