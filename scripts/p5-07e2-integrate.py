from pathlib import Path

package = Path('package.json')
text = package.read_text()
old = 'node scripts/check-business-claim-application-order.mjs && tsx scripts/check-positive-payment-evidence.ts'
new = 'node scripts/check-business-claim-application-order.mjs && node scripts/check-business-claim-payment-preview.mjs && tsx scripts/check-positive-payment-evidence.ts'
assert old in text
package.write_text(text.replace(old, new, 1))

Path('scripts/check-business-claim-payment-preview.mjs').write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const service = read('src/admin/submissions/business-claim-payment-preview.ts');
for (const marker of [
  'business-claim-payment-preview-v1',
  "'attach_existing_claim'",
  "'create_candidate_claim'",
  "'needs_selection'",
  "'already_present'",
  'acceptedProposals',
  'draftSetHash',
  'readProcessorCandidates',
]) {
  assert.ok(service.includes(marker), `payment preview service lost ${marker}`);
}

const backend = read('src/admin/submissions/drizzle-business-claim-payment-preview-backend.ts');
for (const marker of [
  'business_claim_fields_applied',
  'payment_processor',
  'acceptanceClaims',
  'claimAssets',
  'readPaymentMethodBySlug',
]) {
  assert.ok(backend.includes(marker), `payment preview backend lost ${marker}`);
}
for (const forbidden of [
  'database.insert(acceptanceClaims)',
  'database.insert(claimAssets)',
  '.update(acceptanceClaims)',
  '.update(claimAssets)',
  'publishRelease',
  'activateExport',
]) {
  assert.ok(!backend.includes(forbidden), `payment preview unexpectedly mutates through ${forbidden}`);
}

const route = read(
  'functions/admin/api/business-claim-applications/[applicationId]/payment-preview.ts',
);
assert.ok(route.includes("'Cache-Control': 'private, no-store'"));
assert.ok(route.includes('CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PREVIEW_SUBJECTS'));
assert.ok(route.includes('readProtectedAdminIdentity'));

const status = read('docs/PROJECT_STATUS.md');
assert.ok(status.includes('P5-07D3'));
assert.ok(status.includes('P5-07D4'));
assert.ok(status.includes('P5-07E1'));
assert.ok(status.includes('P5-07E2'));

console.log('P5-07E2 Business Claim payment preview check passed.');
""")

Path('docs/P5_07E2_BUSINESS_CLAIM_PAYMENT_PREVIEW.md').write_text("""# P5-07E2 Business Claim payment preview

**Implementation item:** P5-07E2  
**Status:** Active  
**Last updated:** 2026-07-20

## Purpose

P5-07E2 adds a protected, read-only preview for accepted Business Claim payment drafts after P5-07E1 has left the common application in `pending / blocked` state.

The preview consumes the exact durable `business_claim_fields_applied` payload. It does not accept a reconstructed proposal or client-selected registry identity.

## Classification

Each accepted draft preserves its original submitted index and is classified as exactly one of:

- `attach_existing_claim` — one exact compatible Claim exists and the tuple is new;
- `create_candidate_claim` — no compatible Claim exists and all canonical identities resolve;
- `needs_selection` — multiple compatible Claims exist and the preview refuses to guess;
- `already_present` — one compatible Claim already contains the exact Claim Asset tuple;
- `blocked` — required registry, route, processor, or target material is absent or ambiguous.

## Exact resolution

The preview resolves active Asset, Network, Payment Method, and payment-processor records. Processor checkout requires one exact active processor identity. Direct-wallet proposals cannot resolve to a processor.

Compatible Claims must belong to the exact Entity or Location target, remain undeleted, use the exact route and processor identity, and have status `candidate`, `confirmed`, or `stale`.

The returned `draftSetHash` binds the durable accepted proposal order, resolved registries, compatible Claim IDs, and readiness result for the next planning slice.

## Privacy and access

The GET route is protected by verified Admin identity plus the dedicated environment allow-list `CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PREVIEW_SUBJECTS`. Responses are `private, no-store`.

## Exclusions

P5-07E2 creates no Claim, Claim Asset, processor, registry, Source Record, provenance, Evidence, Verification Event, lifecycle transition, export, release, retention, migration, or deployment mutation.

## Next

P5-07E3 should persist one exact durable payment application plan. It must bind the E2 hash and explicit reviewer selections, and must still avoid canonical mutation. Entity and Location field-level provenance completion remains a separate owner.
""")

status = Path('docs/PROJECT_STATUS.md')
text = status.read_text()
text = text.replace(
    'P5-07E1 — Business Claim application-order correction',
    'P5-07E2 — Protected Business Claim payment-draft preview',
    1,
)
text = text.replace(
    '- P5-07E1 is active in PR #255 on `p5-07e1-business-claim-application-order`.',
    '- P5-07E1 Business Claim application-order correction completed in #255.\n- P5-07E2 is active on `p5-07e2-business-claim-payment-preview`.',
    1,
)
text = text.replace('3d4e68ae2280807b7c0c9083f041425ebc42c19e', '482a99252019be34e11f1fb2ef6a0499d481cb4e', 1)
text = text.replace(
    '#255 — P5-07E1 Business Claim application ordering',
    'p5-07e2-business-claim-payment-preview — Business Claim payment preview',
    1,
)
start = text.index('## Current boundary')
end = text.index('## Blocked')
replacement = """## Current boundary

P5-07E2 may read only the exact pending Business Claim application, durable accepted payment drafts, canonical target, active registries, processor candidates, and compatible Claim/Claim Asset state.

It classifies each accepted draft without guessing and returns a deterministic `draftSetHash`. It must not mutate canonical or lifecycle state.

## Next

Implement P5-07E3 as a durable exact payment application plan bound to the E2 preview and explicit reviewer selection. Canonical payment application and Entity/Location provenance remain later separate atomic owners.

"""
text = text[:start] + replacement + text[end:]
if '- `docs/P5_07E2_BUSINESS_CLAIM_PAYMENT_PREVIEW.md`' not in text:
    text = text.replace(
        '- `docs/P5_07E1_BUSINESS_CLAIM_APPLICATION_ORDER.md`',
        '- `docs/P5_07E1_BUSINESS_CLAIM_APPLICATION_ORDER.md`\n- `docs/P5_07E2_BUSINESS_CLAIM_PAYMENT_PREVIEW.md`',
        1,
    )
status.write_text(text)
