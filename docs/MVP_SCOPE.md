# CryptoPayMap MVP scope

## Purpose

This document separates the first operational release into two stages:

- **MVP-A:** an operator-managed verified discovery product;
- **MVP-B:** public contribution and business-claim workflows.

MVP-B completion defines the formal MVP. MVP-A is an internal operating milestone that proves the full candidate-to-publication path before public submissions are enabled.

## MVP-A — Operator-managed verified discovery

### Goal

Establish the complete internal path from candidate intake to reviewed canonical data, validated public exports, and usable public discovery.

### Included capabilities

#### Repository and application foundation

- Astro, React, and TypeScript foundation;
- responsive application shell;
- design and motion tokens;
- reusable UI primitives;
- accessibility baseline;
- PWA manifest;
- staging deployment and CI.

#### Data foundation

- asset registry;
- network registry;
- payment-method registry;
- source candidates;
- entities and physical locations;
- acceptance claims;
- claim assets and networks;
- evidence;
- verification events;
- media metadata;
- legacy identifiers;
- validated public JSON and GeoJSON exports.

#### Operator review

- protected administration area;
- candidate queue and candidate detail;
- claim editing;
- evidence review;
- confirmation, stale, reconfirmed, and ended transitions;
- reconfirmation queue;
- media review for operator-added images;
- audit history;
- controlled public export.

#### Public discovery

- Home;
- Places map and list;
- place detail pages;
- Online Services list and detail pages;
- asset, network, route, category, and status filters;
- mobile map/list interaction and bottom sheet;
- URL-backed state and browser-back restoration;
- basic Stats;
- Updates;
- public Roadmap;
- product Changelog;
- methodology, source, license, privacy, terms, disclaimer, contact, support, and partner information pages.

#### Media

- category placeholders;
- operator-managed cover and gallery images;
- private original storage and approved public derivatives;
- rights and attribution metadata.

### MVP-A data requirements

A public confirmed record must include:

- an identifiable place or service;
- accepted asset;
- network;
- payment route;
- payment method;
- usable payment instructions;
- evidence satisfying the verification policy;
- last confirmation date.

Candidate records remain private. Stale records are excluded from default discovery.

### MVP-A proof set

Before broad migration, the system is tested with a small reviewed set of physical places and online services. This proof set validates:

- import;
- review;
- confirmation;
- status transitions;
- public export;
- map and list display;
- detail pages;
- privacy and license boundaries.

The proof set is a validation mechanism, not a public growth target.

### Excluded from MVP-A

- public suggestion forms;
- public payment reports;
- public correction reports;
- public business claims;
- public photo uploads;
- public submission status links;
- public media quarantine uploads;
- business dashboards;
- paid APIs;
- saved places or user accounts;
- push notifications;
- broad offline data storage;
- indirect-spending guides.

## MVP-B — Public contribution and claims

### Goal

Allow customers and businesses to contribute evidence and corrections without permitting automatic changes to canonical public data.

### Included contribution paths

- Suggest a physical place or online service;
- I paid here / payment report;
- Report incorrect, ended, duplicate, privacy, or rights-related information;
- Claim a business or service record;
- Submit photos.

### Included workflow capabilities

- immutable original submission payload;
- normalized reviewer payload;
- proposed field changes;
- automated validation and abuse controls;
- Turnstile and rate limiting;
- private contact handling;
- secret submission status link;
- requests for additional information;
- time-bounded holds;
- field-level partial approval;
- acceptance as a private candidate;
- duplicate and no-change resolution;
- canonical changes in a database transaction;
- audit history;
- public-export validation before publication is reported as complete.

### Included media capabilities

- direct upload to private quarantine storage;
- file type, size, and content validation;
- evidence-image review;
- owner-verification proof review;
- public-gallery candidate review;
- privacy and rights review;
- metadata removal and public derivative generation;
- retention and deletion rules.

### Included owner verification methods

- official-domain email;
- temporary official-site code;
- DNS TXT record;
- contact from an official social account;
- an approved partner-assisted route.

Submitting a claim does not automatically create verified ownership.

### MVP-B completion criteria

The formal MVP is complete when:

- all contribution paths can be submitted safely;
- submissions never update public records automatically;
- reviewers can request information, hold, partially approve, approve, or reject;
- the submitter can see a safe public-facing status;
- private media and public media remain separated;
- approved changes update canonical data atomically;
- public exports validate before publication;
- privacy, rights, retention, and deletion behavior are operational;
- the full contribution flow has end-to-end coverage.

## Post-MVP

The following are outside the formal MVP unless a later public decision moves them forward:

- business dashboards and multi-location management;
- user accounts;
- favorites and saved places;
- notifications;
- advanced statistics;
- public or commercial APIs;
- change feeds;
- broader offline support;
- multilingual product support;
- regional verification partners;
- processor integrations;
- sponsorship-management tooling;
- commercial data products;
- separately labeled crypto-card, gift-card, or bill-payment guides.

## Scope-control rules

A new capability may enter the MVP only when it is required to prevent one of the following:

- an unsafe or misleading public release;
- data corruption or irreversible migration problems;
- a security or privacy failure;
- a legal or rights-management failure;
- failure of the core discovery or contribution experience;
- a foundation that would require major rework if postponed.

Convenience features, decorative enhancements, and commercial extensions normally remain post-MVP.

## Formal launch relationship

MVP completion and production cutover are related but distinct:

- MVP completion means the documented product and contribution capabilities work;
- launch requires additional data-quality, migration, accessibility, performance, security, legal, backup, redirect, and operational checks.
