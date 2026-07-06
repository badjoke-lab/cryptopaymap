import { describe, expect, it } from 'vitest';
import { buildPublicUpdatesViewModel, parsePublicUpdatesDocument } from '../src/public/updates';

const document = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-07-05T00:00:00Z',
  records: [
    {
      updateKey: 'coffee-reconfirmed',
      updateType: 'reconfirmed',
      subjectType: 'place',
      subjectSlug: 'coffee-tokyo',
      title: 'Coffee Tokyo reconfirmed',
      summary: 'Lightning checkout was reconfirmed.',
      effectiveAt: '2026-07-02T00:00:00Z',
    },
    {
      updateKey: 'vpn-added',
      updateType: 'new_online_service',
      subjectType: 'online_service',
      subjectSlug: 'example-vpn',
      title: 'Example VPN added',
      summary: 'A reviewed online checkout record was published.',
      effectiveAt: '2026-06-28T00:00:00Z',
    },
    {
      updateKey: 'market-stale',
      updateType: 'marked_stale',
      subjectType: 'place',
      subjectSlug: 'market-osaka',
      title: 'Market Osaka marked stale',
      summary: 'The record passed its reconfirmation window.',
      effectiveAt: '2026-07-04T00:00:00Z',
    },
  ],
};

describe('public Updates model', () => {
  it('validates the public artifact and groups updates in descending effective order', () => {
    const records = parsePublicUpdatesDocument(document);
    const model = buildPublicUpdatesViewModel(records);

    expect(model.total).toBe(3);
    expect(model.latestEffectiveAt).toBe('2026-07-04T00:00:00Z');
    expect(model.groups.map((group) => group.monthKey)).toEqual(['2026-07', '2026-06']);
    expect(model.groups[0]?.updates.map((update) => update.updateKey)).toEqual([
      'market-stale',
      'coffee-reconfirmed',
    ]);
  });

  it('rejects private or unsupported update fields', () => {
    expect(() =>
      parsePublicUpdatesDocument({
        ...document,
        records: [{ ...document.records[0], internalNote: 'private review material' }],
      }),
    ).toThrow();
  });

  it('returns an explicit empty view model', () => {
    const model = buildPublicUpdatesViewModel([]);

    expect(model).toEqual({
      total: 0,
      latestEffectiveAt: null,
      groups: [],
    });
  });
});
