# OPS-P6-017 — Post-cutover observation and launch-close evaluator

## Purpose

This slice implements the read-only P6-08 observation window and launch-close evaluator. A successful cutover cannot close immediately after the first externally verified candidate response.

The observer performs no live routing, DNS, Pages-domain, database, R2, deployment, or canonical-data mutation. Its only write is bounded evidence on the retained status branch.

## Explicit close boundary

The exact confirmation is:

`OBSERVE_AND_CLOSE_CONFIGURED_PRODUCTION_LAUNCH`

The observer requires:

- exact current `main`;
- an accepted `P6-08-GO-LIVE` receipt on that commit;
- the exact release/candidate/data binding retained by that receipt;
- current P6-04 media evidence;
- current P6-07 Q2 monitoring/alert evidence;
- current P6-07 Q3 backup-integrity evidence;
- current P6-07 Q4 usable isolated-restore evidence;
- current P6-07 Q5 incident/operations/recovery evidence;
- a bounded close owner;
- an observation window of 15–120 minutes and sample interval of 1–15 minutes;
- a next operational review date;
- explicit open-risk, deferred-item, and incident registers.

Any missing, stale, changed, or failed evidence prevents close.

## Observation window

Launch cannot close immediately. The workflow samples the externally serving production state repeatedly from the beginning through the end of the requested observation interval. At least three samples are required, and the configured window/interval normally yields more.

Every sample must pass. Every successful sample must retain the same immutable release/candidate/data identity. Any failed sample, mixed identity, legacy split target, or partial propagation produces `verification_failed`.

## DNS, TLS, and canonical-host checks

Each sample independently checks both provider and public observations:

- Cloudflare active-zone uniqueness;
- exact retained apex A and Google verification TXT state;
- exact proxied `www.cryptopaymap.com` CNAME to `cryptopaymap-production.pages.dev`;
- active Pages custom-domain attachment for canonical `www`;
- absence of the legacy Vercel `www` CNAME from recursive public DNS;
- public apex still resolving through the retained Vercel redirect target;
- TLS authorization, hostname coverage, protocol TLS 1.2/1.3, and more than seven days of certificate lifetime;
- apex 307 redirect to canonical `www` with exact path/query preservation and no redirect loop.

The observer never repairs a mismatch.

## Release, data, and public surface

Every sample verifies the exact go-live binding rather than HTTP status alone:

- `p6-05-release.json` release authority;
- candidate artifact ID;
- candidate public-tree digest;
- `version.json` dataset/schema identity and `canonicalOnly: true`;
- `data/manifest.json` dataset/schema identity and `canonicalOnly: true`;
- every manifest data file digest and record count;
- canonical-data `generatedAt` freshness no older than 30 days;
- public `/`, `/places/`, and `/online/` HTML routes.

The required P6-08 machine-readable/indexing surface is also checked on every sample:

- `llms.txt`;
- `ai.txt`;
- `robots.txt`;
- `sitemap.xml`.

`robots.txt` must allow public indexing and point to `https://www.cryptopaymap.com/sitemap.xml`. The sitemap must use the canonical host and must not expose `/admin/`.

## Protected Admin and media

Unauthenticated Admin `/admin/` must return exactly 403 with:

- `Cache-Control: private, no-store`;
- `X-Robots-Tag: noindex, nofollow, noarchive`;
- `X-Content-Type-Options: nosniff`.

A 503 configuration-unavailable result is not close-ready.

Media lifecycle readiness is bound through current P6-04 evidence, including authenticated upload authorization, byte inspection, private original handling, approval/replay, public delivery, takedown, and cleanup.

## Monitoring, alert, backup, restore, and incident evidence

Close-time evidence must remain current:

- Q2: live monitoring, healthy heartbeat, alert exercise, incident reporting, and external reverification;
- Q3: backup execution, inventory, encryption, retention, and integrity;
- Q4: restore, semantic reconciliation, RPO, RTO, and zero-object disposal;
- Q5: incident scenario, incident lifecycle, external reverification, and accepted final receipt.

The observation window's own repeated external samples supplement these retained operational proofs; they do not replace them.

## Risks, deferred items, and incident links

The workflow accepts JSON arrays for the open-risk register and deferred items. Each retained item must have:

- bounded `id`;
- owner;
- UTC deadline;
- `launchBlocking: false`.

Any launch-blocking item prevents close.

Known launch-linked GitHub issue numbers are supplied explicitly. The workflow reads them through the GitHub API and close requires every supplied issue to be closed. The retained receipt stores bounded issue number/state information, not unrestricted discussion content.

## Launch-close receipt

The close attempt is retained as:

`config/production-authorization/launch-close-attempt-receipt.json`

A successful close is additionally retained immutably as:

`config/production-authorization/launch-close-receipt.json`

A different later close attempt cannot overwrite an existing successful close receipt. A mismatch is `immutable_launch_close_conflict`.

The successful receipt contains:

- immutable close ID;
- exact commit and go-live release/candidate/data binding;
- observation start/end/duration, sample count, and sample digest;
- evidence index and bounded receipt digests;
- open-risk register;
- deferred items;
- incident links;
- rollback/final-restore status inherited from go-live;
- next operational review date.

Secrets, raw provider credentials/IDs, private payloads, Admin sessions, private submissions, and unrestricted logs are not retained.

## Terminal state

`closed` requires every mandatory check and every observation sample to pass with one stable immutable identity and no launch-blocking risk or open incident.

`verification_failed` means close was not proven. The evaluator does not alter serving state to make the result pass.

A successful `closed` receipt is immutable historical evidence. Later failures belong to Phase 7 operational evidence and incidents; they do not rewrite launch close.

Parent: #293. Implementation: #421.
