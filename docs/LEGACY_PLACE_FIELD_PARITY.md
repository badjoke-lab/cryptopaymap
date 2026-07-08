# Legacy Place field parity baseline

**Status:** Internal implementation reference  
**Recorded:** 2026-07-08

This document records the practical Place fields exposed by the previous CryptoPayMap v2 map/public model and maps them to the current v3 public contract. It prevents practical merchant information from disappearing during schema or UI work.

## Legacy v2 record surface

The previous repository defined the following Place fields in `types/places.ts`:

- identity and classification: `id`, `name`, `category`, `verification`;
- coordinates and locality: `lat`, `lng`, `country`, `city`, `address_full`;
- payment summary: `supported_crypto` and legacy `accepted`;
- practical contact fields: `website`, `phone`, `twitter`, `instagram`, `facebook`;
- public descriptive fields: `description`, `about`, `about_short`, `amenities`, `paymentNote`;
- media fields: `photos`, `images`, `coverImage`;
- compatibility and operational fields: `address`, `social_website`, `social_twitter`, `social_instagram`, `submitterName`, `updatedAt`.

The previous map DTO `PlaceSummaryPlus` explicitly projected:

- `address_full`;
- `about_short`;
- `paymentNote`;
- `amenities`;
- `phone`;
- `website`;
- `twitter`;
- `instagram`;
- `facebook`;
- `coverImage`.

The old v2 database projection also read contact values from the `socials` table, including `website`, `phone`, `twitter`/`x`, `instagram`, and `facebook`, and fell back to legacy JSON fields when the DB projection did not provide them.

## Current v3 public equivalents

The current `publicPlaceSchema` supports:

- identity and classification: `placeSlug`, `entitySlug`, `name`, `categorySlug`, entity/location status;
- full location structure: `addressLine`, `locality`, `region`, `postalCode`, `countryCode`, latitude and longitude;
- practical contact fields: `websiteUrl`, optional `phone`, and structured `socialLinks`;
- public profile fields: optional `description`, `openingHours`, and `amenities`;
- structured payment information: `claims`, `paymentAssets`, `paymentMethod`, route type, processor, merchant receipt state, instructions, restrictions, freshness, and Evidence;
- public media: `media` with role, URL, dimensions, alt text, attribution, and license metadata;
- field provenance: `provenance`.

## Required parity rule

A field does not count as recovered merely because the schema allows it. Representative review data and selected-Place surfaces must exercise practical information that a real user needs.

At least one staging review Place must therefore include and visibly exercise:

1. full street address and postal code;
2. phone number;
3. website;
4. at least one social link;
5. description/about text;
6. opening hours;
7. amenities;
8. public Gallery media;
9. payment assets and networks;
10. payment method and route;
11. merchant receipt state;
12. How to pay instructions;
13. restrictions when applicable;
14. freshness status;
15. Google Maps and Apple Maps navigation.

Flat legacy fields such as `accepted`, `supported_crypto`, and individual social-network columns must not be reintroduced merely for shape parity. Their current structured v3 equivalents are the canonical representation.

`submitterName` is also not a public parity requirement. Submission identity and review provenance are governed by the v3 candidate, Evidence, administration, privacy, and public-projection boundaries.

## Visual review requirement

The representative screenshot workflow must capture the practical Place surface in these states:

- desktop selected Place panel;
- mobile sheet peek;
- mobile sheet expanded;
- Gallery lightbox.

The screenshot set must also include mobile Menu open, mobile Places Filters open, Places List mode, and representative static public pages so layout and navigation regressions can be reviewed from one artifact set.
