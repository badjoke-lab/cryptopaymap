export function p502rSyntheticSuggestRequest(challengeToken, name) {
  return {
    challengeToken,
    submission: {
      schemaVersion: 'submission-common-v1',
      submissionType: 'suggest',
      targetType: null,
      targetId: null,
      relationship: 'customer',
      contact: null,
      evidenceLinks: [],
      originalPayload: {
        schemaVersion: 'suggest-v1',
        suggestionKind: 'physical_place',
        entity: {
          name,
          legalName: null,
          websiteUrl: 'https://p5-02r-automated-review-probe.invalid/',
          countryCode: 'ZZ',
        },
        place: {
          branchName: 'P5-02R automated review probe',
          addressLine: '42 Fictional Audit Way',
          locality: 'Example Borough',
          region: 'Test Region',
          postalCode: '00000',
          countryCode: 'ZZ',
          latitude: null,
          longitude: null,
          websiteUrl: null,
          phone: null,
          description:
            'P5-02R automated review probe. Synthetic private review material; never publish as a real listing.',
          openingHours: null,
          amenities: [],
          socialLinks: [],
        },
        categories: [],
        paymentProposals: [
          {
            assetSlug: 'btc',
            networkSlug: 'bitcoin',
            routeType: 'direct_wallet',
            paymentMethod: 'onchain',
            processor: null,
            contractAddress: null,
            howToPay: 'Synthetic proposal for the automated private review probe.',
            restrictions: 'Not a real listing or payment claim.',
            isPrimary: true,
          },
        ],
        observedAt: '2026-07-12',
      },
      acknowledgements: {
        privacyNoticeAccepted: true,
        submissionTermsAccepted: true,
      },
    },
  };
}
