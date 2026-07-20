# Temporary fallback retained only until the workflow commits the integrated slice.
from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        print(f'{label}: already applied')
        return
    if old not in text:
        raise RuntimeError(f'{label}: neither source nor target marker exists')
    file.write_text(text.replace(old, new, 1))


replace_once(
    'package.json',
    'node scripts/check-business-claim-payment-preview.mjs && tsx scripts/check-positive-payment-evidence.ts',
    'node scripts/check-business-claim-payment-preview.mjs && node scripts/check-business-claim-payment-plan.mjs && tsx scripts/check-positive-payment-evidence.ts',
    'schema audit registration',
)

replace_once(
    'src/admin/submissions/business-claim-payment-preview.ts',
    '''  paymentMethodId: string;
  contractAddress: string | null;
}''',
    '''  paymentMethodId: string;
  contractAddress: string | null;
  isPrimary: boolean;
}''',
    'preview primary-row state',
)

replace_once(
    'src/admin/submissions/drizzle-business-claim-payment-preview-backend.ts',
    '''                paymentMethodId: claimAssets.paymentMethodId,
                contractAddress: claimAssets.contractAddress,
              })''',
    '''                paymentMethodId: claimAssets.paymentMethodId,
                contractAddress: claimAssets.contractAddress,
                isPrimary: claimAssets.isPrimary,
              })''',
    'preview backend primary-row read',
)

replace_once(
    'src/admin/submissions/business-claim-payment-plan.ts',
    '''  actorId: string,
  requestFingerprint: string,
  event: BusinessClaimPaymentPlanEventRecord,''',
    '''  actorId: string,
  actorType: 'human' | 'system',
  requestFingerprint: string,
  event: BusinessClaimPaymentPlanEventRecord,''',
    'replay actor signature',
)
replace_once(
    'src/admin/submissions/business-claim-payment-plan.ts',
    "    event.actorType !== 'reviewer' ||",
    "    event.actorType !== (actorType === 'human' ? 'reviewer' : 'system') ||",
    'replay actor guard',
)
replace_once(
    'src/admin/submissions/business-claim-payment-plan.ts',
    '''      context.actorId,
      requestFingerprint,
      existing,''',
    '''      context.actorId,
      context.actorType,
      requestFingerprint,
      existing,''',
    'initial replay actor argument',
)
replace_once(
    'src/admin/submissions/business-claim-payment-plan.ts',
    '''          context.actorId,
          requestFingerprint,
          raced,''',
    '''          context.actorId,
          context.actorType,
          requestFingerprint,
          raced,''',
    'raced replay actor argument',
)
replace_once(
    'src/admin/submissions/business-claim-payment-plan.ts',
    '''    context.actorId,
    requestFingerprint,
    {''',
    '''    context.actorId,
    context.actorType,
    requestFingerprint,
    {''',
    'committed receipt actor argument',
)

status = Path('docs/PROJECT_STATUS.md')
text = status.read_text()
for old, new, label in [
    (
        'P5-07E2 — Protected Business Claim payment-draft preview',
        'P5-07E3 — Durable Business Claim payment application plan',
        'status current item',
    ),
    (
        '- P5-07E2 is active in PR #256 on `p5-07e2-business-claim-payment-preview`.',
        '- P5-07E2 protected Business Claim payment-draft preview completed in #256.\n- P5-07E3 is active on `p5-07e3-business-claim-payment-plan`.',
        'status repository state',
    ),
    (
        '482a99252019be34e11f1fb2ef6a0499d481cb4e',
        '60d0881778aaf04e1cdd1d408d60be609cc7bd77',
        'status main sha',
    ),
    (
        'The final P5-07E1 head passed all four normal workflow groups.',
        'The final P5-07E2 head passed all four normal workflow groups.',
        'status verified head',
    ),
    (
        '#256 — P5-07E2 Business Claim payment preview',
        'p5-07e3-business-claim-payment-plan — Business Claim payment plan',
        'status active pr',
    ),
]:
    if new in text:
        print(f'{label}: already applied')
    elif old in text:
        text = text.replace(old, new, 1)
        print(f'{label}: applied')

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
