import { describe, expect, it } from 'vitest';
import { createOnlineServiceImportPlan } from '../src/importers/online-service';

const envelopeBase = {
  sourceId: '44444444-4444-4444-8444-444444444444',
  licenseId: '55555555-5555-4555-8555-555555555555',
  importBatchId: '66666666-6666-4666-8666-666666666666',
  fetchedAt: '2026-06-27T00:00:00Z',
  importerVersion: '1.0.0',
};

function record(index: number) {
  return {
    legacyId: `online-${index}`,
    legacyPath: `/service/online-${index}`,
    recordType: 'online_service',
    name: `Example Service ${index}`,
    websiteUrl: `https://service-${index}.example.com`,
    countryCode: index % 2 === 0 ? 'US' : null,
    category: 'software',
    acceptanceScope: 'all_checkout',
    routeType: 'processor_checkout',
    processorName: 'Example Processor',
    processorUrl: 'https://processor.example.com',
    assetLabels: ['BTC', 'USDC'],
    networkLabels: ['Lightning', 'Base'],
    paymentMethodLabels: ['processor checkout'],
    scopeNotes: null,
    howToPay: 'Choose cryptocurrency at checkout and follow the processor instructions.',
    evidenceUrls: [`https://service-${index}.example.com/payments`],
    observedAt: '2026-06-20T00:00:00Z',
    sourceUrl: null,
    legacyVerificationLabel: 'ready',
  };
}

describe('online-service candidate importer', () => {
  it('imports ten records only into private candidate-layer drafts', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: Array.from({ length: 10 }, (_, index) => record(index + 1)),
    });

    expect(plan.summary).toMatchObject({
      inputCount: 10,
      acceptedCount: 10,
      rejectedCount: 0,
      automaticConfirmedCount: 0,
    });
    expect(plan.drafts).toHaveLength(10);
    expect(
      plan.drafts.every(
        (draft) =>
          draft.candidate.candidateStatus === 'new' &&
          draft.candidate.canonicalEntityId === null &&
          draft.candidate.canonicalLocationId === null &&
          draft.legacyMapping.migrationStatus === 'pending',
      ),
    ).toBe(true);
    expect(plan.drafts.some((draft) => Object.hasOwn(draft, 'acceptanceClaim'))).toBe(false);
  });

  it('preserves raw values separately from normalized review values', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: [
        {
          ...record(1),
          name: '  Example Service 1  ',
          countryCode: 'us',
          assetLabels: [' BTC ', 'btc', 'USDC'],
        },
      ],
    });
    const draft = plan.drafts[0];
    const payload = draft?.sourceRecord.rawPayload as {
      rawRecord: Record<string, unknown>;
      normalizedRecord: Record<string, unknown>;
    };

    expect(payload.rawRecord.name).toBe('  Example Service 1  ');
    expect(payload.rawRecord.countryCode).toBe('us');
    expect(payload.normalizedRecord.name).toBe('Example Service 1');
    expect(payload.normalizedRecord.countryCode).toBe('US');
    expect(draft?.reviewData.assetLabels).toEqual(['BTC', 'USDC']);
  });

  it('keeps source identities deterministic across exact replays', async () => {
    const envelope = { ...envelopeBase, records: [record(1), record(2)] };
    const left = await createOnlineServiceImportPlan(envelope);
    const right = await createOnlineServiceImportPlan(envelope);

    expect(left.inputChecksum).toBe(right.inputChecksum);
    expect(left.drafts.map((draft) => draft.candidateId)).toEqual(
      right.drafts.map((draft) => draft.candidateId),
    );
    expect(left.drafts.map((draft) => draft.sourceRecordId)).toEqual(
      right.drafts.map((draft) => draft.sourceRecordId),
    );
  });

  it('collapses exact replays and rejects conflicting legacy IDs', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: [record(1), record(1), { ...record(1), name: 'Conflicting Service' }],
    });

    expect(plan.summary.acceptedCount).toBe(1);
    expect(plan.summary.replayedCount).toBe(1);
    expect(plan.summary.rejectedCount).toBe(1);
    expect(plan.rejections[0]?.reason).toBe('conflicting_legacy_identity');
  });

  it('rejects indirect spending and exchange records from the main directory', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: [
        { ...record(1), recordType: 'crypto_card' },
        { ...record(2), recordType: 'gift_card' },
        { ...record(3), recordType: 'bill_payment' },
        { ...record(4), recordType: 'exchange' },
        { ...record(5), recordType: 'atm' },
      ],
    });

    expect(plan.drafts).toHaveLength(0);
    expect(plan.summary.outOfScopeCount).toBe(5);
    expect(plan.rejections.every((rejection) => rejection.reason === 'out_of_scope')).toBe(true);
  });

  it('emits duplicate signals without merging shared domains', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: [
        record(1),
        {
          ...record(2),
          websiteUrl: 'https://www.service-1.example.com/checkout',
        },
      ],
    });

    expect(plan.drafts).toHaveLength(2);
    expect(plan.duplicateSignals).toContainEqual(
      expect.objectContaining({ reason: 'shared_official_domain', strength: 'strong' }),
    );
    expect(new Set(plan.drafts.map((draft) => draft.candidateId)).size).toBe(2);
  });

  it('preserves proposal labels without resolving canonical payment facts', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: [record(1)],
    });
    const draft = plan.drafts[0];

    expect(draft?.reviewData.assetLabels).toEqual(['BTC', 'USDC']);
    expect(draft?.reviewData.networkLabels).toEqual(['Base', 'Lightning']);
    expect(draft?.reviewData.proposedRouteType).toBe('processor_checkout');
    expect(draft?.reviewData.requiresAcceptanceReview).toBe(true);
    expect(plan.summary.automaticConfirmedCount).toBe(0);
    expect(Object.hasOwn(draft ?? {}, 'claimAssets')).toBe(false);
  });

  it('rejects unsafe rows without aborting valid rows', async () => {
    const plan = await createOnlineServiceImportPlan({
      ...envelopeBase,
      records: [
        record(1),
        { ...record(2), websiteUrl: 'file:///tmp/private' },
        { ...record(3), name: '<script>bad</script>' },
        { ...record(4), routeType: 'direct_wallet', processorName: 'Impossible Processor' },
      ],
    });

    expect(plan.summary.acceptedCount).toBe(1);
    expect(plan.summary.rejectedCount).toBe(3);
    expect(plan.rejections.every((rejection) => rejection.reason === 'invalid_record')).toBe(true);
  });
});
