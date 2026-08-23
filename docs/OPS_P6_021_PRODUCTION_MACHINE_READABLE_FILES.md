# OPS-P6-021 — Production machine-readable launch files

## Purpose

This slice materializes the public machine-readable files required by the P6-08 production launch contract inside the configured-production candidate artifact.

The files are generated from the already-built public artifact. They do not read private submissions, protected Admin data, credentials, internal-only project documents, or candidate records.

## Files

The configured-production candidate contains:

- `/robots.txt`;
- `/llms.txt`;
- `/ai.txt`;
- `/sitemap.xml`;
- `/version.json`;
- `/data/manifest.json`.

`version.json` and `data/manifest.json` remain owned by the existing production candidate metadata materializer. OPS-P6-021 adds the first four files and validates them together with the candidate release.

## Production robots boundary

Production robots policy:

- allows normal public crawling;
- excludes `/admin/`;
- advertises the canonical sitemap at `https://cryptopaymap.com/sitemap.xml`; the apex is the canonical production origin and `www` is redirect-only.

This does not weaken the protected Admin boundary. Cloudflare Access and the existing Admin response/header checks remain mandatory.

## Staging separation

The production machine files are materialized only inside the OPS-P6-014 configured-production candidate build.

`staging:review:build` does not run the production materializer. Its existing final staging preparation step continues to create a global `Disallow: /` robots file and noindex headers. Production indexing policy therefore cannot silently become the staging-review policy.

## Sitemap boundary

The sitemap is derived from HTML files that actually exist in the built production artifact. It excludes:

- `/admin/` routes;
- the static 404 page.

The route set is sorted and contains no generated timestamp, so identical production artifacts produce identical sitemap bytes.

## Public AI metadata boundary

`llms.txt` and `ai.txt` contain only bounded public product metadata and links to the public data contract. They state that the public dataset contains reviewed public records only and that Candidate records, private submissions, protected Admin data, and credentials are excluded.

They do not contain internal roadmap material, private operational details, secrets, provider identifiers, or unpublished data.

## Candidate verification

OPS-P6-014 fails closed unless the configured production candidate externally returns the expected status and content type for all four files and passes bounded semantic checks for:

- production indexing policy;
- Admin exclusion;
- canonical sitemap reference;
- public data manifest references;
- canonical sitemap home URL;
- absence of Admin routes from the sitemap.

Removing any required file or changing its required public boundary fails the repository contract/self-test or configured candidate verification.

## Non-goals

This slice does not:

- attach a production custom domain;
- change DNS;
- execute production cutover;
- submit a sitemap to Search Console;
- authorize production;
- close P6-08 launch evidence.

Parent: #293. Implementation: #430.
