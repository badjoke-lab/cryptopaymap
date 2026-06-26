# CryptoPayMap PWA baseline

## Purpose

CryptoPayMap is a web application with installable metadata. The Phase 1 baseline makes the shared application shell installable without turning current payment information into permanent offline data.

## Included in P1-09

- `/manifest.webmanifest`
- shared document-head metadata
- standard and maskable vector application icons
- standalone display mode
- root start URL and root application scope
- explicit theme and background colors
- artifact and unit-test validation
- short-lived manifest caching and revalidated icon caching

## Deliberately excluded

P1-09 does not add:

- a service worker;
- offline page or data caching;
- background synchronization;
- push notifications;
- saved places;
- recently viewed data;
- an install prompt controlled by application code.

These capabilities require separate product and freshness decisions. Payment acceptance data must not remain available as apparently current information after its normal revalidation boundary.

## Manifest contract

```text
id: /
start_url: /
scope: /
display: standalone
theme_color: #0f766e
background_color: #f8fafc
```

The manifest contains both a standard icon and a maskable icon. The current vector assets are repository-controlled application icons and may be replaced by finalized brand artwork in a later reviewed change.

## Validation

The repository verifies that:

- the manifest parses as JSON;
- installability fields are present;
- standard and maskable icons are declared;
- the shared layout links the manifest and application icon;
- the production artifact contains the manifest and icons;
- no service worker or cache registration is introduced.

A live browser installability inspection is performed on the Cloudflare staging deployment during the P1-12 integration audit.
