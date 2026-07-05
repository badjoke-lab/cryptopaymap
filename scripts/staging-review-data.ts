import {
  publicOnlineServicesFileSchema,
  publicPlacePinsFileSchema,
  publicPlacesFileSchema,
  publicStatsSchema,
} from '../src/schemas/public-exports';

const generatedAt = '2026-07-05T00:00:00Z';

interface PaymentSpec {
  assetSlug: string;
  assetSymbol: string;
  networkSlug: string;
  paymentMethod: 'onchain' | 'lightning_invoice' | 'wallet_qr' | 'processor_checkout';
}

interface PlaceSpec {
  slug: string;
  name: string;
  category: string;
  countryCode: string;
  locality: string;
  region: string | null;
  latitude: number;
  longitude: number;
  status: 'confirmed' | 'stale' | 'ended';
  routeType: 'direct_wallet' | 'processor_checkout';
  payment: PaymentSpec;
  restrictions?: string | null;
  howToPay?: string;
}

interface ServiceSpec {
  slug: string;
  name: string;
  category: string;
  countryCode: string | null;
  status: 'confirmed' | 'stale' | 'ended';
  routeType: 'direct_wallet' | 'processor_checkout';
  payment: PaymentSpec;
  acceptanceScope: 'all_checkout' | 'selected_products' | 'new_purchase_only' | 'region_limited';
  restrictions?: string | null;
  howToPay?: string;
}

const places: PlaceSpec[] = [
  { slug: 'staging-coffee-tokyo', name: 'Staging Coffee Tokyo', category: 'cafe', countryCode: 'JP', locality: 'Tokyo', region: 'Tokyo', latitude: 35.6812, longitude: 139.7671, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'lightning', paymentMethod: 'lightning_invoice' } },
  { slug: 'staging-ramen-shinjuku', name: 'Staging Ramen Shinjuku', category: 'restaurant', countryCode: 'JP', locality: 'Tokyo', region: 'Tokyo', latitude: 35.6938, longitude: 139.7034, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'base', paymentMethod: 'processor_checkout' } },
  { slug: 'staging-books-kanda', name: 'Staging Independent Books & Reading Room Kanda', category: 'bookstore', countryCode: 'JP', locality: 'Tokyo', region: 'Tokyo', latitude: 35.6958, longitude: 139.7676, status: 'stale', routeType: 'direct_wallet', payment: { assetSlug: 'xrp', assetSymbol: 'XRP', networkSlug: 'xrpl', paymentMethod: 'wallet_qr' }, restrictions: 'Ask staff before payment. Availability may depend on the register in use.' },
  { slug: 'staging-market-osaka', name: 'Staging Market Osaka', category: 'grocery', countryCode: 'JP', locality: 'Osaka', region: 'Osaka', latitude: 34.6937, longitude: 135.5023, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdt', assetSymbol: 'USDT', networkSlug: 'tron', paymentMethod: 'processor_checkout' } },
  { slug: 'staging-hotel-namba', name: 'Staging Hotel Namba', category: 'hotel', countryCode: 'JP', locality: 'Osaka', region: 'Osaka', latitude: 34.6654, longitude: 135.5013, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'bitcoin', paymentMethod: 'onchain' }, restrictions: 'Crypto payment is available for direct bookings made through the hotel front desk.' },
  { slug: 'staging-gallery-yokohama', name: 'Staging Gallery Yokohama', category: 'gallery', countryCode: 'JP', locality: 'Yokohama', region: 'Kanagawa', latitude: 35.4437, longitude: 139.638, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'ether', assetSymbol: 'ETH', networkSlug: 'ethereum', paymentMethod: 'wallet_qr' } },
  { slug: 'staging-bakery-sapporo', name: 'Staging Bakery Sapporo', category: 'bakery', countryCode: 'JP', locality: 'Sapporo', region: 'Hokkaido', latitude: 43.0618, longitude: 141.3545, status: 'stale', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'lightning', paymentMethod: 'lightning_invoice' } },
  { slug: 'staging-cowork-fukuoka', name: 'Staging Cowork Fukuoka', category: 'coworking', countryCode: 'JP', locality: 'Fukuoka', region: 'Fukuoka', latitude: 33.5904, longitude: 130.4017, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'solana', paymentMethod: 'processor_checkout' } },
  { slug: 'staging-design-seoul', name: 'Staging Design Store Seoul', category: 'retail', countryCode: 'KR', locality: 'Seoul', region: null, latitude: 37.5665, longitude: 126.978, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'xrp', assetSymbol: 'XRP', networkSlug: 'xrpl', paymentMethod: 'wallet_qr' } },
  { slug: 'staging-noodle-singapore', name: 'Staging Noodle House Singapore', category: 'restaurant', countryCode: 'SG', locality: 'Singapore', region: null, latitude: 1.3521, longitude: 103.8198, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdt', assetSymbol: 'USDT', networkSlug: 'tron', paymentMethod: 'processor_checkout' } },
  { slug: 'staging-cycle-london', name: 'Staging Cycle Workshop London', category: 'bicycle', countryCode: 'GB', locality: 'London', region: 'England', latitude: 51.5072, longitude: -0.1276, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'lightning', paymentMethod: 'lightning_invoice' } },
  { slug: 'staging-studio-new-york', name: 'Staging Creative Studio New York', category: 'studio', countryCode: 'US', locality: 'New York', region: 'New York', latitude: 40.7128, longitude: -74.006, status: 'stale', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'base', paymentMethod: 'processor_checkout' } },
  { slug: 'staging-florist-paris', name: 'Staging Florist Paris', category: 'florist', countryCode: 'FR', locality: 'Paris', region: null, latitude: 48.8566, longitude: 2.3522, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'ether', assetSymbol: 'ETH', networkSlug: 'ethereum', paymentMethod: 'wallet_qr' } },
  { slug: 'staging-surf-sydney', name: 'Staging Surf Shop Sydney', category: 'retail', countryCode: 'AU', locality: 'Sydney', region: 'New South Wales', latitude: -33.8688, longitude: 151.2093, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'solana', paymentMethod: 'processor_checkout' } },
  { slug: 'staging-records-berlin', name: 'Staging Records Berlin', category: 'music', countryCode: 'DE', locality: 'Berlin', region: null, latitude: 52.52, longitude: 13.405, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'bitcoin', paymentMethod: 'onchain' } },
  { slug: 'staging-tea-taipei', name: 'Staging Tea Room Taipei', category: 'cafe', countryCode: 'TW', locality: 'Taipei', region: null, latitude: 25.033, longitude: 121.5654, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'xrp', assetSymbol: 'XRP', networkSlug: 'xrpl', paymentMethod: 'wallet_qr' } },
  { slug: 'staging-closed-diner-kyoto', name: 'Staging Closed Diner Kyoto', category: 'restaurant', countryCode: 'JP', locality: 'Kyoto', region: 'Kyoto', latitude: 35.0116, longitude: 135.7681, status: 'ended', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'lightning', paymentMethod: 'lightning_invoice' } },
  { slug: 'staging-ended-shop-toronto', name: 'Staging Ended Shop Toronto', category: 'retail', countryCode: 'CA', locality: 'Toronto', region: 'Ontario', latitude: 43.6532, longitude: -79.3832, status: 'ended', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'base', paymentMethod: 'processor_checkout' } },
];

const services: ServiceSpec[] = [
  { slug: 'staging-vpn', name: 'Staging VPN', category: 'vpn', countryCode: null, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'bitcoin', paymentMethod: 'processor_checkout' }, acceptanceScope: 'all_checkout' },
  { slug: 'staging-hosting', name: 'Staging Cloud Hosting', category: 'hosting', countryCode: null, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'base', paymentMethod: 'processor_checkout' }, acceptanceScope: 'new_purchase_only', restrictions: 'Available for new annual plans. Renewal availability may differ by account region.' },
  { slug: 'staging-domain-shop', name: 'Staging Domain Shop', category: 'domains', countryCode: 'US', status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'lightning', paymentMethod: 'lightning_invoice' }, acceptanceScope: 'selected_products' },
  { slug: 'staging-design-tools', name: 'Staging Design Tools Pro', category: 'software', countryCode: null, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'solana', paymentMethod: 'processor_checkout' }, acceptanceScope: 'all_checkout' },
  { slug: 'staging-travel-booking', name: 'Staging Travel Booking', category: 'travel', countryCode: null, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'usdt', assetSymbol: 'USDT', networkSlug: 'tron', paymentMethod: 'processor_checkout' }, acceptanceScope: 'region_limited', restrictions: 'Availability depends on the departure market and selected supplier.' },
  { slug: 'staging-learning', name: 'Staging Learning Platform', category: 'education', countryCode: 'GB', status: 'stale', routeType: 'direct_wallet', payment: { assetSlug: 'xrp', assetSymbol: 'XRP', networkSlug: 'xrpl', paymentMethod: 'wallet_qr' }, acceptanceScope: 'selected_products' },
  { slug: 'staging-media-subscription', name: 'Staging Media Subscription', category: 'media', countryCode: null, status: 'confirmed', routeType: 'processor_checkout', payment: { assetSlug: 'ether', assetSymbol: 'ETH', networkSlug: 'ethereum', paymentMethod: 'processor_checkout' }, acceptanceScope: 'new_purchase_only' },
  { slug: 'staging-ended-saas', name: 'Staging Ended SaaS', category: 'software', countryCode: 'CA', status: 'ended', routeType: 'processor_checkout', payment: { assetSlug: 'usdc', assetSymbol: 'USDC', networkSlug: 'base', paymentMethod: 'processor_checkout' }, acceptanceScope: 'all_checkout' },
  { slug: 'staging-gift-cards', name: 'Staging Gift Cards Marketplace With An Intentionally Long Service Name', category: 'gift-cards', countryCode: null, status: 'confirmed', routeType: 'direct_wallet', payment: { assetSlug: 'bitcoin', assetSymbol: 'BTC', networkSlug: 'lightning', paymentMethod: 'lightning_invoice' }, acceptanceScope: 'selected_products', howToPay: 'Choose an eligible gift card, select the cryptocurrency payment option, generate the invoice, confirm the asset and network shown in the checkout, and complete payment before the invoice expires.' },
];

function evidence(slug: string) {
  return {
    kind: 'official_payment_page' as const,
    evidenceClass: 'a' as const,
    sourceType: 'official_page' as const,
    polarity: 'supporting' as const,
    sourceName: `${slug} staging evidence`,
    sourceUrl: `https://example.com/staging/evidence/${slug}`,
    archiveUrl: null,
    observedAt: '2026-06-20T00:00:00Z',
    publishedAt: null,
    summary: 'Synthetic staging evidence used only to exercise reviewed public presentation states.',
  };
}

function paymentAsset(payment: PaymentSpec) {
  return {
    ...payment,
    contractAddress: null,
    isPrimary: true,
    notes: null,
  };
}

function claimBase(spec: PlaceSpec | ServiceSpec, scope: 'location_specific' | 'online_service') {
  const processor = spec.routeType === 'processor_checkout' ? 'staging-processor' : null;
  const ended = spec.status === 'ended';
  return {
    claimKey: `${spec.slug}-claim`,
    entitySlug: spec.slug,
    locationSlug: scope === 'location_specific' ? spec.slug : null,
    claimScope: scope,
    acceptanceScope: 'acceptanceScope' in spec ? spec.acceptanceScope : 'all_checkout',
    status: spec.status,
    routeType: spec.routeType,
    processorSlug: processor,
    howToPay:
      spec.howToPay ??
      (spec.routeType === 'processor_checkout'
        ? 'Choose cryptocurrency at checkout, confirm the displayed asset and network, then complete the processor payment request.'
        : 'Ask to pay with cryptocurrency, confirm the asset and network with the merchant, then scan or open the payment request.'),
    instructionsLanguage: 'en',
    merchantReceives: spec.routeType === 'processor_checkout' ? 'fiat' : 'crypto',
    restrictions: spec.restrictions ?? null,
    firstConfirmedAt: '2026-01-15T00:00:00Z',
    lastConfirmedAt: spec.status === 'stale' ? '2026-01-20T00:00:00Z' : '2026-06-20T00:00:00Z',
    nextReviewAt: ended ? null : '2026-12-20T00:00:00Z',
    endedAt: ended ? '2026-05-01T00:00:00Z' : null,
    endedReason: ended ? 'Synthetic ended state for staging review.' : null,
    paymentAssets: [paymentAsset(spec.payment)],
    evidence: [evidence(spec.slug)],
  };
}

function provenance(slug: string) {
  return [
    {
      sourceName: `${slug} staging source`,
      sourceUrl: `https://example.com/staging/source/${slug}`,
      licenseSlug: null,
      attribution: null,
      fields: ['name', 'websiteUrl', 'claims'],
    },
  ];
}

export function buildStagingReviewData() {
  const placeRecords = places.map((spec) => ({
    placeSlug: spec.slug,
    entitySlug: spec.slug,
    name: spec.name,
    categorySlug: spec.category,
    entityStatus: spec.status === 'ended' ? 'ended' : 'active',
    locationStatus: spec.status === 'ended' ? 'closed' : 'active',
    addressLine: null,
    locality: spec.locality,
    region: spec.region,
    postalCode: null,
    countryCode: spec.countryCode,
    latitude: spec.latitude,
    longitude: spec.longitude,
    websiteUrl: `https://example.com/staging/place/${spec.slug}`,
    claims: [claimBase(spec, 'location_specific')],
    media: [],
    provenance: provenance(spec.slug),
  }));

  const pinRecords = places
    .filter((spec) => spec.status !== 'ended')
    .map((spec) => ({
      placeSlug: spec.slug,
      name: spec.name,
      categorySlug: spec.category,
      countryCode: spec.countryCode,
      locality: spec.locality,
      latitude: spec.latitude,
      longitude: spec.longitude,
      status: spec.status,
      assetSlugs: [spec.payment.assetSlug],
      networkSlugs: [spec.payment.networkSlug],
      routeTypes: [spec.routeType],
      lastConfirmedAt: spec.status === 'stale' ? '2026-01-20T00:00:00Z' : '2026-06-20T00:00:00Z',
      thumbnail: null,
    }));

  const serviceRecords = services.map((spec) => ({
    serviceSlug: spec.slug,
    name: spec.name,
    categorySlug: spec.category,
    entityStatus: spec.status === 'ended' ? 'ended' : 'active',
    countryCode: spec.countryCode,
    websiteUrl: `https://example.com/staging/service/${spec.slug}`,
    claims: [claimBase(spec, 'online_service')],
    media: [],
    provenance: provenance(spec.slug),
  }));

  const activePlaceSpecs = places.filter((spec) => spec.status === 'confirmed');
  const activeServiceSpecs = services.filter((spec) => spec.status === 'confirmed');
  const allActive = [...activePlaceSpecs, ...activeServiceSpecs];
  const counts = (key: 'assetSlug' | 'networkSlug') =>
    [...new Set(allActive.map((spec) => spec.payment[key]))]
      .map((value) => ({
        key: value,
        count: allActive.filter((spec) => spec.payment[key] === value).length,
      }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  return {
    places: publicPlacesFileSchema.parse({ schemaVersion: '1.0.0', generatedAt, records: placeRecords }),
    placePins: publicPlacePinsFileSchema.parse({ schemaVersion: '1.0.0', generatedAt, records: pinRecords }),
    onlineServices: publicOnlineServicesFileSchema.parse({ schemaVersion: '1.0.0', generatedAt, records: serviceRecords }),
    stats: publicStatsSchema.parse({
      confirmedPhysicalPlaces: activePlaceSpecs.length,
      confirmedOnlineServices: activeServiceSpecs.length,
      countries: new Set(activePlaceSpecs.map((spec) => spec.countryCode)).size,
      cities: new Set(activePlaceSpecs.map((spec) => `${spec.countryCode}:${spec.locality}`)).size,
      staleRecords: places.filter((spec) => spec.status === 'stale').length + services.filter((spec) => spec.status === 'stale').length,
      endedRecords: places.filter((spec) => spec.status === 'ended').length + services.filter((spec) => spec.status === 'ended').length,
      directWalletClaims: allActive.filter((spec) => spec.routeType === 'direct_wallet').length,
      processorCheckoutClaims: allActive.filter((spec) => spec.routeType === 'processor_checkout').length,
      howToPayCoverage: 1,
      networkSpecifiedRate: 1,
      evidenceBackedRate: 1,
      reconfirmedWithin90Days: 0.86,
      reconfirmedWithin180Days: 0.96,
      staleRate: 0.12,
      topAssets: counts('assetSlug'),
      topNetworks: counts('networkSlug'),
    }),
  };
}
