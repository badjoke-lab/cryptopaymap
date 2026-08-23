# OPS-P6-016 — Configured production go-live

## Purpose

OPS-P6-016 performs the separately authorized production cutover only after the protected production environment, production candidate, readiness receipt, and configured-production authorization are current on the exact `main` commit.

The canonical production origin is `https://cryptopaymap.com`. `https://www.cryptopaymap.com` is a redirect host and must return a permanent 308 redirect to the same apex path and query after cutover.

## Exact pre-state

The executor fails closed unless the observed legacy topology is exact:

- apex `cryptopaymap.com` has the retained Vercel A record `216.198.79.1` plus the retained Google verification TXT;
- `www.cryptopaymap.com` has the exact retained Vercel CNAME `02eeaa61ea1e3365.vercel-dns-017.com`;
- the dedicated `cryptopaymap-production` Pages project has no custom domains;
- the configured staging Pages project remains unchanged.

Unknown records, unknown custom domains, wrong provider targets, changed evidence, or a changed credential generation fail closed before mutation.

## Candidate cutover topology

The bounded cutover deliberately mutates the apex because the apex is the canonical production host. It:

1. removes only the exact legacy apex A and exact legacy WWW CNAME;
2. preserves the Google verification TXT;
3. creates a proxied apex CNAME to `cryptopaymap-production.pages.dev`;
4. creates a proxied WWW CNAME to the same Pages project;
5. attaches both `cryptopaymap.com` and `www.cryptopaymap.com` to the dedicated Pages project;
6. waits for both Pages custom domains to become active;
7. externally verifies the apex release and the WWW-to-apex redirect.

The Pages middleware owns the WWW redirect, preserving the same path and query. No unrelated DNS record may be changed.

## External verification

The candidate phase requires:

- public DNS convergence for both hostnames;
- apex no longer resolving through the retained legacy Vercel A target;
- `www` no longer resolving through the retained legacy Vercel CNAME;
- apex public pages, machine-readable files, and immutable candidate artifact identity;
- unauthenticated Admin remains fail-closed with HTTP 403 and the required private/no-store, noindex, and nosniff headers;
- `www` returns HTTP 308 to `https://cryptopaymap.com` with the same path/query;
- the staging project remains unchanged.

## Mandatory rollback drill

The first successful candidate cutover is rolled back before the final cutover. Rollback:

- detaches only the two expected production Pages custom domains;
- removes only the exact candidate apex/WWW records;
- restores the exact retained Vercel apex A and WWW CNAME;
- preserves the Google verification TXT;
- externally verifies the restored legacy 307 apex-to-WWW behavior and Vercel WWW service.

Any unexpected DNS or custom-domain state fails closed rather than being deleted.

After rollback proof, the executor performs the same candidate cutover again and externally verifies it as the final serving topology.

## Evidence and boundaries

The receipt binds the authorization, candidate artifact, release authority, dataset/schema identity, public-tree digest, credential-generation digest, launch owner, rollback owner, provider-state digests, rollback proof, and final external proof.

`apexMutation` is true for an accepted go-live because apex cutover is intentional. `unrelatedDnsMutation` and `stagingMutation` remain false. This workflow does not close launch; OPS-P6-017 owns the observation window and launch-close receipt.

Raw credentials, provider tokens, unrestricted responses, private canonical payloads, and protected Admin session material are never retained.

Parent: #293.
