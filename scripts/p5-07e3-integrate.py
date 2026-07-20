from pathlib import Path

# Register the executable runtime audit.
package = Path('package.json')
text = package.read_text()
old = 'node scripts/check-business-claim-payment-preview.mjs && tsx scripts/check-positive-payment-evidence.ts'
new = 'node scripts/check-business-claim-payment-preview.mjs && node scripts/check-business-claim-payment-plan.mjs && tsx scripts/check-positive-payment-evidence.ts'
assert old in text
package.write_text(text.replace(old, new, 1))

# E3 needs the exact current primary-row state that E2 already loads privately.
preview = Path('src/admin/submissions/business-claim-payment-preview.ts')
text = preview.read_text()
old = '''  paymentMethodId: string;
  contractAddress: string | null;
}'''
new = '''  paymentMethodId: string;
  contractAddress: string | null;
  isPrimary: boolean;
}'''
assert old in text
preview.write_text(text.replace(old, new, 1))

preview_backend = Path('src/admin/submissions/drizzle-business-claim-payment-preview-backend.ts')
text = preview_backend.read_text()
old = '''                paymentMethodId: claimAssets.paymentMethodId,
                contractAddress: claimAssets.contractAddress,
              })'''
new = '''                paymentMethodId: claimAssets.paymentMethodId,
                contractAddress: claimAssets.contractAddress,
                isPrimary: claimAssets.isPrimary,
              })'''
assert old in text
preview_backend.write_text(text.replace(old, new, 1))

# Replay verification must support both human and explicitly authorized system actors.
service = Path('src/admin/submissions/business-claim-payment-plan.ts')
text = service.read_text()
text = text.replace(
    '''  actorId: string,
  requestFingerprint: string,
  event: BusinessClaimPaymentPlanEventRecord,''',
    '''  actorId: string,
  actorType: 'human' | 'system',
  requestFingerprint: string,
  event: BusinessClaimPaymentPlanEventRecord,''',
    1,
)
text = text.replace(
    "    event.actorType !== 'reviewer' ||",
    "    event.actorType !== (actorType === 'human' ? 'reviewer' : 'system') ||",
    1,
)
text = text.replace(
    '''      context.actorId,
      requestFingerprint,
      existing,''',
    '''      context.actorId,
      context.actorType,
      requestFingerprint,
      existing,''',
    1,
)
text = text.replace(
    '''          context.actorId,
          requestFingerprint,
          raced,''',
    '''          context.actorId,
          context.actorType,
          requestFingerprint,
          raced,''',
    1,
)
text = text.replace(
    '''    context.actorId,
    requestFingerprint,
    {''',
    '''    context.actorId,
    context.actorType,
    requestFingerprint,
    {''',
    1,
)
service.write_text(text)

# Advance the bounded repository handoff while preserving older audit markers.
status = Path('docs/PROJECT_STATUS.md')
text = status.read_text()
text = text.replace(
    'P5-07E2 — Protected Business Claim payment-draft preview',
    'P5-07E3 — Durable Business Claim payment application plan',
    1,
)
text = text.replace(
    '- P5-07E2 is active in PR #256 on `p5-07e2-business-claim-payment-preview`.',
    '- P5-07E2 protected Business Claim payment-draft preview completed in #256.\n- P5-07E3 is active on `p5-07e3-business-claim-payment-plan`.',
    1,
)
text = text.replace(
    '482a99252019be34e11f1fb2ef6a0499d481cb4e',
    '60d0881778aaf04e1cdd1d408d60be609cc7bd77',
    1,
)
text = text.replace(
    'The final P5-07E1 head passed all four normal workflow groups.',
    'The final P5-07E2 head passed all four normal workflow groups.',
    1,
)
text = text.replace(
    '#256 — P5-07E2 Business Claim payment preview',
    'p5-07e3-business-claim-payment-plan — Business Claim payment plan',
    1,
)
start = text.index('## Current boundary')
end = text.index('## Blocked')
replacement = '''## Current boundary

P5-07E3 may persist one exact private payment plan bound to the E2 `draftSetHash`, current target versions, selected existing Claim versions, complete selected Claim Asset set hashes, and explicit reviewer selections for ambiguous drafts.

It derives candidate Claim IDs, Claim Asset row IDs, registries, processors, duplicate rows, and primary-row safety on the server. It must not mutate canonical Claims, Claim Assets, provenance, verification history, lifecycle, export, or release.

## Next

Implement P5-07E4 as the atomic consumer of one exact E3 plan. It should create planned hidden candidate Claims, insert planned Claim Asset rows, preserve already-present rows, write payment provenance and verification history, and commit the common application with replay-safe recovery. Entity and Location field-level provenance remains a separate atomic owner.

'''
text = text[:start] + replacement + text[end:]
if '- `docs/P5_07E3_BUSINESS_CLAIM_PAYMENT_PLAN.md`' not in text:
    text = text.replace(
        '- `docs/P5_07E2_BUSINESS_CLAIM_PAYMENT_PREVIEW.md`',
        '- `docs/P5_07E2_BUSINESS_CLAIM_PAYMENT_PREVIEW.md`\n- `docs/P5_07E3_BUSINESS_CLAIM_PAYMENT_PLAN.md`',
        1,
    )
status.write_text(text)
