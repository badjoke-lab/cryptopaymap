import { publicUpdatesFileSchema } from '../src/schemas/public-exports';

const generatedAt = '2026-07-05T00:00:00Z';

export function buildStagingReviewUpdates() {
  return publicUpdatesFileSchema.parse({
    schemaVersion: '1.0.0',
    generatedAt,
    records: [
      {
        updateKey: 'staging-coffee-tokyo-confirmed',
        updateType: 'newly_confirmed',
        subjectType: 'place',
        subjectSlug: 'staging-coffee-tokyo',
        title: 'Staging Coffee Tokyo confirmed',
        summary:
          'Lightning payment instructions and supporting public evidence were reviewed and published.',
        effectiveAt: '2026-07-04T00:00:00Z',
      },
      {
        updateKey: 'staging-market-osaka-reconfirmed',
        updateType: 'reconfirmed',
        subjectType: 'place',
        subjectSlug: 'staging-market-osaka',
        title: 'Staging Market Osaka reconfirmed',
        summary: 'The published processor-checkout route was reviewed again and remains current.',
        effectiveAt: '2026-07-03T00:00:00Z',
      },
      {
        updateKey: 'staging-hotel-namba-payment-changed',
        updateType: 'payment_method_changed',
        subjectType: 'place',
        subjectSlug: 'staging-hotel-namba',
        title: 'Payment method updated for Staging Hotel Namba',
        summary:
          'The public payment instructions were updated after the reviewed checkout flow changed.',
        effectiveAt: '2026-07-02T00:00:00Z',
      },
      {
        updateKey: 'staging-books-kanda-stale',
        updateType: 'marked_stale',
        subjectType: 'place',
        subjectSlug: 'staging-books-kanda',
        title: 'Staging Independent Books & Reading Room Kanda marked stale',
        summary:
          'The record passed its reconfirmation window and now needs fresh supporting evidence.',
        effectiveAt: '2026-07-01T00:00:00Z',
      },
      {
        updateKey: 'staging-vpn-online-added',
        updateType: 'new_online_service',
        subjectType: 'online_service',
        subjectSlug: 'staging-vpn',
        title: 'Staging VPN added to Online Services',
        summary:
          'A reviewed cryptocurrency checkout record was added to the public Online Services collection.',
        effectiveAt: '2026-06-29T00:00:00Z',
      },
      {
        updateKey: 'staging-domain-shop-reconfirmed',
        updateType: 'reconfirmed',
        subjectType: 'online_service',
        subjectSlug: 'staging-domain-shop',
        title: 'Staging Domain Shop reconfirmed',
        summary: 'The selected-product Lightning route was reviewed again and remains available.',
        effectiveAt: '2026-06-26T00:00:00Z',
      },
      {
        updateKey: 'staging-learning-stale',
        updateType: 'marked_stale',
        subjectType: 'online_service',
        subjectSlug: 'staging-learning',
        title: 'Staging Learning Platform marked stale',
        summary:
          'The published acceptance record requires a new reconfirmation before it can be treated as current.',
        effectiveAt: '2026-06-20T00:00:00Z',
      },
      {
        updateKey: 'staging-ended-saas-ended',
        updateType: 'ended',
        subjectType: 'online_service',
        subjectSlug: 'staging-ended-saas',
        title: 'Staging Ended SaaS acceptance ended',
        summary:
          'Reviewed evidence shows that the previously published cryptocurrency checkout route has ended.',
        effectiveAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
}
