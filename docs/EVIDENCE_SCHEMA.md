# CryptoPayMap evidence schema

## Purpose

Evidence records capture the reviewed basis for an acceptance claim without treating every source as equally strong or automatically public.

```text
source observation
  -> evidence review
  -> accepted supporting or contradicting evidence
  -> verification decision
```

Evidence is separate from the current claim status. P2-08 adds the append-only verification events that record which evidence supported each state decision.

## Evidence classes

```text
a  strong evidence
b  medium evidence
c  weak discovery evidence
```

Initial kind-to-class assignments are fixed:

### Class A

- live checkout observation;
- current official payment page;
- verified business representative;
- dated payment proof.

### Class B

- recent official social statement;
- current processor case study or listing;
- recent dated OpenStreetMap observation;
- recent independent user report.

### Class C

- directory listing;
- undated OpenStreetMap payment tag;
- article;
- search snippet;
- platform capability;
- other weak discovery material.

Class C can create or enrich a private candidate but cannot satisfy the confirmation threshold.

## Review and visibility

Evidence review status is independent from visibility.

```text
review_status
pending
accepted
rejected
superseded

visibility
public
private
restricted
```

Only accepted evidence may be public. Private or restricted receipts, transaction details, ownership proof, personal information, and secret source material may support a public conclusion without exposing the original material.

The reviewed summary is a CryptoPayMap-authored factual summary. The source page, post, image, or receipt is not copied into public output by default.

## Supporting and contradicting evidence

```text
supporting
contradicting
neutral
```

A newer material contradiction invalidates older supporting evidence for threshold evaluation. Later qualifying evidence may restore eligibility. The state change itself is recorded by a verification event rather than by modifying the historical evidence record.

## Evidence independence

Accepted Class B evidence requires an `independence_key`. This key represents the underlying observation or responsibility path rather than the URL.

Examples that normally share one independence key:

- articles copied from one press release;
- multiple directory entries copied from one source;
- a search snippet and its underlying page;
- reposts of one user report;
- multiple processor pages generated from one integration record.

Two Class B records count as a pair only when their independence keys differ and their origin roles are complementary:

```text
merchant_side or processor_side
+
usage_side, on_ground, or osm_side
```

## Confirmation threshold

The initial evaluator accepts either:

```text
one accepted supporting Class A item
```

or:

```text
two accepted supporting Class B items
with different independence keys
and complementary origin roles
```

Only evidence observed after the latest accepted Class A or B contradiction is eligible. Class C evidence never completes the threshold.

The evaluator proves evidence sufficiency only. A confirmed claim must also satisfy claim instructions, explicit asset-network-payment-method combinations, scope, lifecycle, and visibility requirements.

## Source capture

A retained evidence record can store:

- source type and name;
- source URL and source-native identifier;
- observation, publication, and fetch times;
- reviewed summary;
- content hash;
- archive URL;
- license identifier;
- attribution text;
- relationship to a claim, submission, or source record.

`observed_at`, `published_at`, and `fetched_at` remain separate. Ingestion time is not evidence that a claim became true at that time.

A source URL requires a fetch time. An archive URL requires an original source URL. Accepted Class A and B evidence requires an observation time.

## Deferred relationships

`submission_id` and `source_record_id` are stored now without foreign keys because the canonical submission and source-candidate tables are implemented later. Their foreign-key and provenance boundaries are completed when those tables are introduced.

## Minimal copying

Operational capture prefers URLs, metadata, hashes, structured facts, and reviewer-authored summaries. Whole pages, long excerpts, full social posts, and third-party media are not default evidence records.
