# CryptoPayMap source and license policy

## Purpose

This document defines how CryptoPayMap records source provenance, uses external material, attributes OpenStreetMap, licenses project-originated public data and explanatory text, handles contributed media, and labels combined public exports.

This policy is an operational publication rule, not legal advice. The full license texts control if this summary conflicts with them.

---

## 1. Core principles

1. **A source is not automatically proof.** Source usefulness and verification strength are separate decisions.
2. **Provenance remains traceable.** Public and private records retain source, observation date, license, and attribution metadata where applicable.
3. **External content is not republished by default.** CryptoPayMap stores factual metadata, reviewed summaries, links, and limited evidence needed for verification rather than copying whole third-party pages.
4. **OpenStreetMap-derived location data remains identifiable.** OSM-origin fields are not relabeled as solely CryptoPayMap data.
5. **Project-originated acceptance data has its own license layer.** CryptoPayMap verification claims do not change the license of OSM location data.
6. **Combined exports preserve component licenses.** A convenience file does not erase or replace the license applying to each component.
7. **Images are separate.** Public data and text licenses do not automatically apply to images, logos, screenshots, or trademarks.
8. **Private evidence stays private.** Submission or review access does not imply public republication rights.
9. **Attribution is a product requirement.** Attribution is included in pages, data manifests, files, and interfaces where the applicable license requires it.
10. **The system fails closed.** Unclear rights or provenance prevent public reuse until resolved.

---

## 2. Source categories

### 2.1 Official merchant or service pages

Examples:

- payment pages;
- help centers;
- checkout documentation;
- terms;
- official FAQs;
- branch pages;
- service-plan pages.

Permitted recordkeeping normally includes:

- source URL;
- page title;
- observation and publication dates where known;
- a short factual summary;
- content hash or change indicator;
- an archive URL where lawful and appropriate.

CryptoPayMap does not assume a right to republish the full page, page design, photographs, logos, or long quotations.

### 2.2 Official social accounts

Official social posts may support verification when the account and applicable scope are identifiable.

CryptoPayMap records the URL, date, account identity, and reviewed factual summary. Embedded media or full post copies are not republished unless the platform terms and rights basis permit it.

### 2.3 Payment-processor sources

Processor merchant directories, case studies, documentation, and checkout observations may identify a route or integration.

Processor capability does not prove that every merchant enabled the feature. Processor material is attributed to the processor and reviewed for merchant, location, product, region, and date applicability.

### 2.4 OpenStreetMap

OpenStreetMap may provide location identity, names, addresses, coordinates, categories, websites, and payment tags.

OSM data is a source layer, not automatic acceptance confirmation.

- a recent dated payment observation may be medium verification evidence;
- an undated payment tag is weak candidate-discovery evidence;
- OSM alone does not satisfy the full confirmation threshold;
- OSM-derived fields retain OSM provenance and license metadata.

### 2.5 Directories and maps

Third-party directories, community maps, and aggregators may identify candidates.

They normally remain weak evidence unless their underlying source and date independently meet a stronger evidence class.

A copied directory chain counts as one origin, not multiple independent sources.

### 2.6 News and articles

Articles may provide historical context, but current acceptance normally requires a more direct and recent source.

CryptoPayMap stores links and short factual summaries rather than republishing article text.

### 2.7 Search-result snippets

Search snippets are discovery aids only. They are not treated as reliable standalone evidence or republished as source content.

### 2.8 Public user submissions

A user may submit:

- factual listing details;
- payment observations;
- correction reports;
- source URLs;
- evidence media;
- public-gallery media;
- business-claim information.

Submission intake terms must explain the applicable use permission for each purpose. Evidence-only permission and public-republication permission are separate.

### 2.9 Verified business representatives

Business representatives may provide official details and media after identity or control verification.

Verification of the representative does not transfer ownership of third-party content and does not bypass public verification policy.

### 2.10 Archives

Public web archives may improve durability when use is appropriate and the archive contains no private or restricted material.

CryptoPayMap does not submit private correspondence, receipts, ownership proof, personal data, or secret status pages to public archive services.

---

## 3. Source capture requirements

Every retained source record should store, where applicable:

- source type;
- source name;
- source URL;
- source-native identifier;
- observed date;
- published date;
- fetched date;
- reviewed summary;
- content hash;
- archive URL;
- license identifier;
- attribution text;
- visibility;
- relationship to candidate, claim, evidence, or field.

### 3.1 Observation date is not ingestion date

The date CryptoPayMap imports a page does not prove the claim became true on that date.

`observed_at`, `published_at`, and `fetched_at` remain separate.

### 3.2 Minimal necessary copying

Operational source capture should prefer:

- URLs;
- metadata;
- hashes;
- structured factual values;
- reviewer-authored summaries;
- limited excerpts only where legally appropriate and necessary.

Whole-page copies, large excerpts, full social posts, and third-party image downloads are not default source records.

### 3.3 Terms and access controls

Collection must respect applicable law, access controls, robots instructions where relevant, and source terms.

CryptoPayMap must not bypass authentication, technical restrictions, or paid access to obtain public evidence.

### 3.4 Sensitive source data

Private source material receives restricted visibility and appropriate retention. It is never added to public archives or public data files merely because it supports a public conclusion.

---

## 4. License layers

CryptoPayMap separates database, content, software, and media licensing.

### 4.1 OpenStreetMap-derived location data — ODbL 1.0

OpenStreetMap data is made available by the OpenStreetMap Foundation under the Open Data Commons Open Database License 1.0.

Official references:

- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [Open Data Commons ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

CryptoPayMap uses OSM-derived location data subject to ODbL requirements, including attribution and applicable share-alike obligations.

Required attribution uses the standard form:

> © OpenStreetMap contributors

The attribution links to the OpenStreetMap copyright page or otherwise makes the ODbL status clear.

### 4.2 CryptoPayMap acceptance database — ODC-By 1.0

CryptoPayMap-originated structured acceptance claims are intended to be made available under the Open Data Commons Attribution License 1.0.

Official reference:

- [Open Data Commons Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/)

This layer includes, to the extent CryptoPayMap owns or may license the applicable database rights:

- reviewed acceptance claims;
- asset and network combinations;
- route and payment-method classifications;
- confirmation dates;
- public verification events;
- public status;
- public restrictions;
- project-originated structured registry data;
- project-originated aggregate statistics.

Recommended attribution:

> CryptoPayMap acceptance data — ODC-By 1.0

The attribution should include the dataset or page name, CryptoPayMap, a version or retrieval date, and a link to the license or data page where practical.

### 4.3 CryptoPayMap explanatory text — CC BY 4.0

CryptoPayMap-authored explanatory text is intended to be licensed under Creative Commons Attribution 4.0 International, to the extent the text is protected and CryptoPayMap owns or may license the relevant rights.

Official reference:

- [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

This layer may include:

- reviewer-authored How to pay text;
- public evidence summaries;
- methodology explanations;
- glossary and help text;
- project-authored public documentation and data-field descriptions where marked.

Recommended attribution:

> CryptoPayMap explanatory content — CC BY 4.0

Adaptations should identify that changes were made where the license requires it.

### 4.4 Software code

This source and data policy does not automatically license repository software code.

A separate software license must be selected and added before code reuse rights are offered. Until then, the presence of code in a public repository does not by itself grant a general reuse license beyond rights provided by applicable law or platform terms.

### 4.5 Images and media

Images are excluded from the general public data and explanatory-text licenses unless an individual media record explicitly states otherwise.

Media may use one of these rights bases:

- owned by CryptoPayMap;
- submitted by a rights holder under the public-display grant;
- used with written permission;
- published under a compatible open license;
- public-domain material with documented basis.

Each public media item stores its own:

- rights basis;
- license where applicable;
- attribution;
- source;
- approved public use;
- removal status.

### 4.6 Logos, names, and trademarks

Business names, logos, processor marks, and trademarks remain the property of their respective owners.

Their appearance in factual records does not grant trademark rights or imply endorsement.

---

## 5. Public file license mapping

### 5.1 Separated source layers

| Public file | Primary content | License treatment |
|---|---|---|
| `/data/locations-osm.json` | Publishable OSM-derived location layer | ODbL 1.0 with OSM attribution |
| `/data/acceptance-claims.json` | CryptoPayMap-reviewed acceptance claims | ODC-By 1.0 |
| `/data/online-services.json` | CryptoPayMap-reviewed online acceptance records | ODC-By 1.0, with separate source notices where needed |
| `/data/assets.json` | Project-maintained public asset registry | ODC-By 1.0 |
| `/data/networks.json` | Project-maintained public network registry | ODC-By 1.0 |
| `/data/stats.json` | Aggregates of the public dataset | ODC-By 1.0, subject to source-layer notices |
| `/data/updates.json` | Structured public record changes | ODC-By 1.0; authored summaries may also carry CC BY 4.0 |

### 5.2 Combined convenience exports

| Public file | Treatment |
|---|---|
| `/data/places.json` | Combined convenience export retaining record-level or field-level source and license metadata |
| `/data/places.geojson` | Geographic convenience export retaining OSM attribution and component-license notices |
| `/data/place-pins.json` | Minimal combined map projection retaining required attribution through the map and data interface |

A combined file is not presented as though ODC-By replaces ODbL for OSM-derived data.

The manifest identifies:

- which fields or components derive from OSM;
- which components are CryptoPayMap-originated;
- applicable licenses;
- required attribution;
- schema and dataset versions;
- generation date.

CryptoPayMap does not promise that every combined use is legally a Collective Database rather than a Derivative Database. Reusers remain responsible for complying with the licenses applicable to the components and their intended use.

### 5.3 Manifest and notices

`/data/manifest.json` includes:

- file inventory;
- schema version;
- generated date;
- record counts for public data;
- source layers;
- license identifiers;
- attribution text;
- links to full license terms;
- data-safety statement.

`/version.json` identifies the public dataset and schema version but does not replace license notices.

---

## 6. OpenStreetMap handling

### 6.1 Attribution placement

OSM attribution appears wherever OSM data is presented, including:

- interactive maps;
- map-derived screenshots published by CryptoPayMap;
- OSM-derived public data files;
- data and source documentation;
- downloads where attribution is not otherwise visible.

The map interface must keep attribution readable and must not cover or remove provider-required notices.

### 6.2 OSM source separation

OSM-derived location fields remain identifiable through provenance metadata.

Examples:

- OSM object type and ID;
- source record;
- field-level provenance;
- ODbL identifier;
- attribution notice.

CryptoPayMap-authored acceptance instructions, evidence summaries, and verification state remain separate from the OSM location layer.

### 6.3 OSM changes and corrections

CryptoPayMap may correct its canonical display without claiming that the correction changed OpenStreetMap.

Where appropriate, operators or users may separately contribute improvements to OSM under OSM's own contribution process and terms.

### 6.4 OSM payment tags

OSM payment tags retain OSM provenance. CryptoPayMap may review them as candidate or evidence data, but a CryptoPayMap confirmation is a separate project decision.

---

## 7. CryptoPayMap data reuse

### 7.1 Attribution elements

A reasonable CryptoPayMap data attribution includes:

- `CryptoPayMap`;
- the dataset or file name;
- the applicable license;
- a link to the data page or source repository;
- version or retrieval date where practical.

### 7.2 Modification notices

Reusers should identify material modifications, especially where changed instructions, status, dates, or scope could be mistaken for current CryptoPayMap verification.

### 7.3 Freshness

A reused record should preserve:

- `last_confirmed_at`;
- public status;
- source or evidence references;
- dataset version or retrieval date.

Removing freshness information may make the data misleading even when license attribution is present.

### 7.4 No endorsement

Reuse does not imply endorsement by CryptoPayMap, BadJoke-Lab, a listed business, a processor, OpenStreetMap, or any contributor.

### 7.5 No verification inheritance after modification

A materially modified record must not be described as currently confirmed by CryptoPayMap unless it remains identical to the applicable published verification data or clearly distinguishes the modification.

---

## 8. Contributor permissions

### 8.1 Factual data submissions

Submission terms must authorize CryptoPayMap to:

- store and review submitted factual data;
- normalize it;
- compare it with other sources;
- incorporate approved factual contributions into the public acceptance database;
- distribute approved structured data under the applicable public data license.

A contributor must not submit information they are not permitted to share.

### 8.2 Evidence-only media and documents

Evidence-only permission allows CryptoPayMap to:

- receive;
- store privately;
- process for safety and privacy;
- review;
- create internal derivatives needed for review;
- retain according to policy;
- use the reviewed conclusion in a public record.

It does not authorize public gallery display or open-data redistribution of the original.

### 8.3 Public gallery media

A public-gallery submission requires the contributor to confirm that they own the media or are authorized to license it.

The contributor grants CryptoPayMap a non-exclusive, worldwide, royalty-free permission to:

- host;
- display;
- resize;
- crop;
- re-encode;
- create responsive derivatives;
- include the media in the applicable public listing and project promotion;
- remove the media when required.

The contributor retains ownership. The media is not automatically licensed to third parties as ODC-By or CC BY.

### 8.4 Business-provided media

Business media requires confirmation that the submitter is authorized to grant the relevant use permission.

Ownership verification of the business relationship and rights authorization for each media item remain separate checks.

### 8.5 Text contributions

Where a contributor supplies original public explanatory text, the submission terms must obtain permission for CryptoPayMap to edit, publish, and distribute approved text under the public text license.

Private correspondence is not converted into public CC BY content by default.

---

## 9. Third-party content exclusions

Unless explicitly licensed or permitted, public exports exclude:

- copied website descriptions;
- full articles;
- social-media text beyond limited necessary reference;
- third-party photographs;
- map-service screenshots without compliant attribution and permission;
- menus, logos, or product images copied from business websites;
- processor marketing images;
- private receipts or transaction screenshots;
- personal correspondence.

A URL and factual summary do not transfer ownership of the linked content.

---

## 10. Evidence citations and quotations

### 10.1 Prefer summary over quotation

Public evidence entries use reviewer-authored factual summaries and source links.

### 10.2 Limited quotation

A short quotation may be used only when:

- necessary to explain the evidence;
- legally appropriate;
- attributed;
- limited to what is needed;
- not a substitute for the source.

### 10.3 Translation

A translation of source material is treated as an adaptation and is not published without an appropriate rights basis. CryptoPayMap may instead publish an original factual summary in another language.

---

## 11. Archive and preservation policy

CryptoPayMap may store:

- source URL;
- archive URL;
- metadata;
- content hash;
- observation date;
- limited internal review notes.

The existence of a public archive does not change the source's copyright or license.

Archive links are removed or restricted when they expose private, harmful, or unlawfully retained material.

---

## 12. Attribution failure and remediation

If required attribution is missing or incorrect:

1. stop or limit the affected publication where necessary;
2. identify the affected file, page, or image;
3. restore attribution or remove the material;
4. record the correction;
5. review whether a public Changelog entry is required;
6. verify generated files and cached copies.

License or attribution errors are not corrected only in documentation while leaving affected public artifacts unchanged.

---

## 13. Rights, privacy, and takedown requests

A rights holder or affected person may report:

- unauthorized image use;
- incorrect attribution;
- personal information;
- private evidence exposure;
- trademark confusion;
- inaccurate ownership claims;
- license incompatibility.

Urgent reports may cause temporary hiding while the underlying issue is reviewed.

Removal of public media does not require deletion of all non-public audit metadata when lawful retention remains necessary. Private source material follows the applicable retention and privacy policy.

---

## 14. License changes

A public license change requires:

- confirmation that CryptoPayMap has authority to apply the new terms;
- compatibility review for existing contributions;
- separation of material that cannot be relicensed;
- updates to manifests and notices;
- public Changelog review after release;
- a clear effective date.

OpenStreetMap-derived data cannot be relicensed by CryptoPayMap in a way that removes ODbL obligations.

Contributed images cannot be relicensed as open data without the contributor's applicable permission.

---

## 15. Publication checklist

Before releasing a data or content artifact, verify:

- [ ] The source is recorded.
- [ ] The observation date is distinct from ingestion date.
- [ ] The applicable license is identified.
- [ ] Required attribution is visible.
- [ ] OSM-derived fields remain identifiable.
- [ ] ODC-By is not presented as replacing ODbL.
- [ ] Combined exports preserve component notices.
- [ ] Third-party text is summarized rather than copied without permission.
- [ ] Images have item-level rights metadata.
- [ ] Private evidence and contacts are excluded.
- [ ] Public text and structured data use the correct license layer.
- [ ] The manifest and version metadata are current.
- [ ] Cached and downloadable copies carry the required notices.
