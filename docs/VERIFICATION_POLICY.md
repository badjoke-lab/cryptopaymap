# CryptoPayMap verification policy

## Purpose

CryptoPayMap publishes claims about where and how cryptocurrency can be used at checkout. This policy defines the evidence, scope, freshness, contradiction handling, and state transitions required before an acceptance claim may appear publicly.

The policy is designed to answer a practical question:

> Can a customer reasonably understand and attempt this payment route now?

A listing is not confirmed merely because a business is described as crypto-friendly, appears in a directory, has an old payment tag, or uses a platform that supports cryptocurrency in general.

---

## 1. Verification principles

1. **The payment route must be specific.** The accepted asset, network, route, payment method, and usable instructions must be known.
2. **Evidence must apply to the listed scope.** A brand announcement does not automatically prove every branch accepts cryptocurrency.
3. **Freshness matters.** Older evidence loses weight when checkout options, processors, branches, or service plans change.
4. **Newer contradiction overrides older support.** A current removal notice or failed checkout can outweigh an older announcement.
5. **Candidate data is private.** Unverified candidates never appear on public maps, public search, or public statistics.
6. **Commercial relationships do not change verification.** Sponsorship, payment, ownership claims, and partnerships cannot purchase confirmed status.
7. **Private proof may support a public conclusion without being published.** Receipts, transaction links, ownership proof, and personal information remain private unless separately approved for public display.
8. **The policy fails closed.** Missing required information prevents confirmation rather than being filled by assumption.

---

## 2. Acceptance-claim states

### 2.1 Candidate

A candidate is an internal review record.

Candidate records:

- are not public;
- do not appear in public counts;
- may be incomplete;
- may contain conflicting or weak evidence;
- may be linked to source records or submissions;
- require explicit review before promotion.

### 2.2 Confirmed

A claim is confirmed only when all required payment details are known and the evidence threshold is met.

Confirmed does not mean guaranteed. It means the claim met the published verification policy at its last confirmation date.

### 2.3 Stale

A claim is stale when:

- its reconfirmation window has expired;
- recent contradictory evidence requires investigation;
- previously confirmed information may no longer be reliable;
- the payment route remains plausible but is not currently strong enough for default discovery.

Stale claims are excluded from default search and map results.

### 2.4 Ended

A claim is ended when reliable evidence shows that:

- cryptocurrency acceptance ended;
- the relevant checkout option disappeared;
- the business or location closed;
- the service or applicable product ended;
- the previously listed route is no longer available.

Ended records may remain available as public history but are excluded from normal active discovery.

### 2.5 Rejected

A claim is rejected when it is:

- outside product scope;
- false or misleading;
- unsupported after review;
- not identifiable;
- a duplicate;
- spam or promotion without useful evidence;
- affected by unresolved rights or privacy problems;
- an indirect spending route presented as merchant acceptance.

Rejected claims are not normally public.

### 2.6 Visibility is separate from status

A claim may be temporarily hidden without changing its verification state when urgent privacy, rights, legal, or safety review is required.

```text
claim_status = confirmed
visibility = temporarily_hidden
```

Temporary hiding is not evidence that the payment route ended.

---

## 3. Required payment information

A confirmed claim requires:

- an identifiable merchant, place, or online service;
- an applicable location or service scope;
- at least one accepted asset;
- an explicit network for each published asset combination;
- a payment route;
- a payment method;
- usable How to pay instructions;
- supporting evidence meeting this policy;
- a last confirmation date.

### 3.1 Payment route

```text
direct_wallet
processor_checkout
```

### 3.2 Payment method

Examples include:

```text
onchain
lightning_invoice
lightning_nfc
wallet_qr
processor_checkout
pos_terminal
invoice
payment_link
```

Payment route and payment method are not interchangeable.

### 3.3 Network requirement

The network must be explicit for each published asset combination.

Examples:

- BTC on Bitcoin mainnet;
- BTC over Lightning;
- USDT on Tron;
- USDC on Base;
- XRP on XRPL.

The network must not be inferred solely from the asset symbol.

A direct-wallet claim with an unknown network cannot be confirmed.

### 3.4 Processor requirement

A processor-checkout claim requires:

- an identified processor;
- a verified checkout or invoice path;
- at least one currently verified asset, network, and payment-method combination;
- instructions explaining where the customer selects or receives the crypto payment option.

If available assets may change at checkout, the public record may say so, but only verified combinations may be listed as current accepted options.

### 3.5 How to pay

How to pay must be actionable, not merely promotional.

A useful instruction explains one or more of the following:

- what to ask staff;
- where the checkout option appears;
- which QR, invoice, terminal, or payment link is used;
- which network is required;
- which processor is involved;
- which products, plans, regions, or customer types are eligible;
- any minimum, reservation, renewal, or timing restriction.

Example:

> Ask staff to display a Lightning invoice, then scan the QR code with a Lightning-compatible wallet.

### 3.6 Merchant-receipt information

The merchant's settlement outcome is recorded only when publicly confirmed.

```text
crypto
fiat
crypto_or_fiat
not_publicly_confirmed
```

Processor capability alone is not proof of the merchant's selected settlement setting.

---

## 4. Evidence classes

Evidence is classified by strength and source relationship.

### 4.1 Class A — strong evidence

#### A1 — Live checkout observed

CryptoPayMap or a reviewer confirms that the current checkout, invoice, terminal, or in-person flow actually presents the described cryptocurrency payment route.

A live checkout observation records:

- observation date;
- applicable product or location;
- asset and network where visible;
- route and method;
- any restrictions;
- whether payment completion was observed or only option availability was observed.

#### A2 — Current official merchant or service page

A current official page explicitly describes the applicable cryptocurrency payment route.

Examples:

- payment help page;
- checkout documentation;
- official terms;
- official FAQ;
- branch-specific payment page.

A generic corporate blockchain announcement is not automatically A2.

#### A3 — Verified business representative

A business or service representative completes an approved ownership-verification method and provides applicable payment details.

Ownership verification proves the representative relationship. The supplied acceptance details still undergo consistency and scope review.

#### A4 — Dated real-payment proof

A dated payment report provides enough private or public evidence to verify the target, route, asset, network, and successful payment.

Sensitive transaction details may remain private. The public record uses a reviewed summary rather than publishing the original proof by default.

### 4.2 Class B — medium evidence

#### B1 — Recent official social statement

A recent post from an official business account explicitly describes the applicable payment route or current acceptance.

#### B2 — Current processor case study or merchant listing

A processor identifies the business or service as a current customer or acceptance example.

A processor listing is medium evidence because integrations may be optional, partial, branch-specific, or outdated.

#### B3 — Recent dated OpenStreetMap observation

A recent OpenStreetMap payment tag has a useful survey or check date and applies to the specific physical location.

An undated tag is not B3.

#### B4 — Recent independent user report

A recent report describes the target, date, route, asset, network, method, and observed result but does not include enough proof for A4.

### 4.3 Class C — weak discovery evidence

Examples:

- BTC Map or another directory listing;
- undated OpenStreetMap payment tags;
- old articles;
- generic social posts;
- search-result snippets;
- copied directory entries;
- platform capability without merchant-specific activation;
- vague “crypto accepted” claims without asset, network, route, or date.

Class C is useful for candidate discovery. It is never sufficient by itself for confirmation.

---

## 5. Confirmation threshold

A claim may be confirmed when all required payment information is present and one of these evidence conditions is met.

### 5.1 One Class A item

```text
one accepted A item
and
no newer material contradiction
```

### 5.2 Two independent Class B items

```text
two accepted independent B items
and
one is merchant-side or processor-side
and
one is usage-side, on-the-ground, or dated OSM-side
and
no newer material contradiction
```

Examples of acceptable B pairs:

- recent official merchant social statement + recent independent user report;
- current processor case study + recent dated OSM survey;
- recent official merchant statement + recent dated OSM survey.

### 5.3 Evidence independence

Two pages do not count as independent merely because they have different URLs.

The following normally count as one origin:

- directories copying the same announcement;
- articles repeating one press release;
- multiple processor pages generated from one integration record;
- reposts of the same user report;
- a search snippet and the page it summarizes.

Evidence is independent when it comes from materially separate observation or responsibility paths.

### 5.4 Class C cannot complete the threshold

Class C may support context, duplicate resolution, or candidate discovery, but cannot replace A or B evidence.

---

## 6. Scope verification

### 6.1 Location-specific claims

A physical map pin normally requires a confirmed `location_specific` claim.

Evidence must identify the actual branch or location.

### 6.2 Brand-region or brand-global claims

A brand-wide statement does not automatically create pins for every location.

Expansion to location pins requires:

- an explicit official statement that the relevant locations participate;
- a current official locator or stable location list;
- a defined region;
- no unresolved franchise or branch exception;
- a way to track exclusions and changes.

If these conditions are not met, the claim remains brand-level and does not generate location-specific public pins.

### 6.3 Franchise and independently operated locations

Franchise or independently operated branches do not inherit acceptance from a parent brand without applicable evidence.

### 6.4 Platform capability

A commerce or point-of-sale platform supporting cryptocurrency does not prove that each merchant using the platform enabled it.

`platform_capability` never creates a merchant pin by itself.

### 6.5 Online-service scope

Online acceptance records must describe applicable scope where relevant:

```text
all_checkout
selected_products
new_purchase_only
renewal_only
region_limited
temporary
```

A marketplace is listed only when the platform's own checkout supports cryptocurrency. Individual seller arrangements do not prove platform-wide acceptance.

---

## 7. Freshness and reconfirmation

Freshness windows are measured from the applicable observation or verification date, not merely the date a record was entered.

Initial reconfirmation windows:

| Evidence basis | Review window |
|---|---:|
| Current official payment page or live checkout observation | 180 days |
| Dated real-payment proof | 180 days |
| Verified business representative | 365 days |
| Dated medium evidence pair | 180 days unless a shorter context applies |
| Undated OSM only | Not publishable |
| Directory only | Not publishable |

The system stores `last_confirmed_at` and `next_review_at` separately.

### 7.1 Reconfirmation

Reconfirmation requires evidence that meets the current policy for the same applicable scope.

A reconfirmation event records:

- date;
- evidence used;
- whether payment details changed;
- new next-review date;
- public summary where appropriate.

### 7.2 Expired review window

When the review window expires without sufficient reconfirmation:

```text
confirmed → stale
```

Expiration alone does not prove acceptance ended.

### 7.3 Policy changes

Changes to freshness windows are documented and apply prospectively or through an explicit migration review. They are not silently backdated without updating affected next-review dates.

---

## 8. Contradictory and negative evidence

### 8.1 One ordinary failure report

One ordinary failure report normally causes:

- private negative evidence;
- a priority recheck;
- no immediate ended status;
- no automatic removal of the current claim.

The report may cause temporary hiding only for a separate urgent privacy, rights, or safety reason.

### 8.2 Two independent recent failure reports

Two independent credible reports within 30 days normally cause:

```text
confirmed → stale
```

The route remains under review until official or stronger evidence resolves the contradiction.

### 8.3 Strong official removal evidence

Examples:

- official payment page removes the option;
- checkout no longer presents the option;
- processor or merchant confirms termination;
- official branch closure notice;
- official service shutdown.

Depending on clarity:

```text
confirmed → stale
```

or:

```text
confirmed → ended
```

### 8.4 Newer evidence priority

When evidence conflicts, reviewers consider:

1. applicability to the exact place, service, product, and region;
2. observation date;
3. source responsibility;
4. independence;
5. directness of observation;
6. whether the payment route was merely offered or successfully completed.

A newer, directly applicable official removal normally outweighs an older confirmation.

### 8.5 No automatic crowd vote

Report count alone does not determine truth. Duplicate, coordinated, copied, or unsupported reports are not treated as independent evidence.

---

## 9. Ended-state requirements

Ended status requires strong evidence that the applicable route or target ended.

Examples:

- official end-of-support statement;
- current checkout removal confirmed by direct observation;
- official business closure;
- current service shutdown;
- processor termination confirmed for the applicable merchant;
- multiple independent failures plus supporting current evidence.

An ended event records:

- effective or observed end date where known;
- reason code;
- evidence;
- public summary;
- previous state.

Ended does not erase history.

---

## 10. Rejected-state requirements

A rejected decision records a machine-readable reason such as:

```text
out_of_scope
insufficient_evidence
unverifiable
false_or_misleading
duplicate
spam_or_promotion
location_not_identifiable
asset_or_network_not_identifiable
rights_issue
privacy_issue
indirect_spending_route
```

A rejected source candidate is not a public allegation against a business. Rejection is normally internal.

---

## 11. Evidence handling and publication

### 11.1 Public evidence

Public evidence may include:

- official URLs;
- public archive URLs where permitted;
- reviewed summaries;
- observation dates;
- source type;
- evidence class;
- public verification events.

### 11.2 Private evidence

Private evidence may include:

- transaction URLs;
- receipts;
- screenshots containing personal information;
- ownership proof;
- private correspondence;
- unredacted payment details;
- private submitter contact information.

Private evidence may support a public conclusion without being published.

### 11.3 Screenshots and media

A screenshot or photograph used as evidence is not automatically licensed for public gallery use.

Evidence review, privacy review, and public-media rights review are separate decisions.

### 11.4 Archive URLs

Archive services may be used only when:

- archiving is lawful and appropriate;
- the archived page does not contain private or restricted material;
- the archive adds durable verification value;
- the source and observation dates remain clear.

CryptoPayMap does not archive private submissions, ownership proof, receipts, or personal data through public archive services.

### 11.5 Search snippets

A search-result snippet is discovery evidence only. Reviewers must inspect the underlying source where possible.

---

## 12. Review decisions

### 12.1 Reviewer output

A verification review records:

- claim scope;
- route and method;
- asset and network combinations;
- How to pay;
- restrictions;
- evidence accepted or rejected;
- status decision;
- confirmation or effective date;
- next review date;
- public summary;
- private notes where needed.

### 12.2 Atomic canonical change

A review decision updates canonical data and verification history in one controlled transaction.

A public status is not reported as published until public-export validation succeeds.

### 12.3 Partial evidence acceptance

A submission may contain useful and unusable parts.

Reviewers may accept one field or evidence item while rejecting or holding another. This does not lower the confirmation threshold.

### 12.4 Ownership claims

Verified ownership establishes the claimant's relationship to a business. It does not:

- automatically confirm acceptance;
- allow unreviewed public edits;
- suppress contradictory evidence;
- change ranking or visibility through payment.

---

## 13. Public language

CryptoPayMap uses precise status language.

Preferred:

- Confirmed on 12 June 2026.
- Last reconfirmed 90 days ago.
- This payment route is stale and excluded from default results.
- Acceptance ended according to the linked official notice.
- Available assets are shown at checkout and may change.

Avoid:

- guaranteed;
- certified safe;
- always accepted;
- officially endorsed by CryptoPayMap;
- every branch accepts cryptocurrency;
- the merchant receives crypto, unless confirmed.

---

## 14. Public statistics

Public statistics count only eligible public canonical records.

They exclude:

- source candidates;
- rejected records;
- private submissions;
- internal review queues;
- duplicate source observations;
- temporarily hidden records where public counting would reveal restricted information.

Stats describe the CryptoPayMap dataset, not global cryptocurrency adoption.

---

## 15. Appeals, corrections, and emergency handling

Businesses and users may submit corrections through the public contribution routes.

Urgent privacy, rights, or dangerous misinformation reports may cause temporary hiding before the underlying verification review completes.

A correction or removal request does not erase valid evidence history automatically. Retention and deletion follow the applicable privacy, media, and legal policies.

---

## 16. Policy versioning

Material policy changes require:

- a reviewed pull request;
- public Changelog review after the product is released;
- migration analysis for affected claims;
- explicit effective date;
- updated validators where applicable.

Existing confirmations are re-evaluated when a policy change materially affects eligibility.

---

## 17. Verification checklist

Before marking a claim confirmed, verify:

- [ ] The target is identifiable.
- [ ] The claim scope is correct.
- [ ] The route is direct wallet or processor checkout.
- [ ] The payment method is explicit.
- [ ] Each listed asset has an explicit network.
- [ ] How to pay is actionable.
- [ ] Restrictions are recorded.
- [ ] Evidence meets one-A or two-independent-B threshold.
- [ ] Evidence applies to the listed location or service scope.
- [ ] No newer material contradiction exists.
- [ ] Last confirmation and next review dates are set.
- [ ] Merchant settlement is not inferred.
- [ ] Public evidence contains no private material.
- [ ] The canonical and public-export validators pass.
