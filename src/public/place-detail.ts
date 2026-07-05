import { z } from 'zod';
import { publicPlaceSchema, publicPlacesFileSchema } from '../schemas/public-exports';

export type PublicPlace = z.infer<typeof publicPlaceSchema>;
export type PublicPlaceClaim = PublicPlace['claims'][number];
export type PublicPlaceStatus = PublicPlaceClaim['status'];

export interface PlaceDetailPayment {
  assetSlug: string;
  assetSymbol: string;
  networkSlug: string;
  paymentMethod: string;
  routeType: PublicPlaceClaim['routeType'];
  processorSlug: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface PlaceDetailModel {
  place: PublicPlace;
  status: PublicPlaceStatus;
  address: string;
  claims: PublicPlaceClaim[];
  payments: PlaceDetailPayment[];
  assetSymbols: string[];
  networkSlugs: string[];
  cover: PublicPlace['media'][number] | null;
  gallery: PublicPlace['media'];
  lastConfirmedAt: string;
}

const statusPriority: Record<PublicPlaceStatus, number> = {
  confirmed: 0,
  stale: 1,
  ended: 2,
};

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function statusForClaims(claims: PublicPlaceClaim[]): PublicPlaceStatus {
  if (claims.some((claim) => claim.status === 'confirmed')) return 'confirmed';
  if (claims.some((claim) => claim.status === 'stale')) return 'stale';
  return 'ended';
}

function buildAddress(place: PublicPlace): string {
  return uniqueStrings(
    [place.addressLine, place.locality, place.region, place.postalCode, place.countryCode].filter(
      (value): value is string => value !== null,
    ),
  ).join(', ');
}

export function buildPlaceDetailModel(place: PublicPlace): PlaceDetailModel {
  const claims = [...place.claims].sort((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) return statusDifference;
    return Date.parse(right.lastConfirmedAt) - Date.parse(left.lastConfirmedAt);
  });

  const payments = claims.flatMap((claim) =>
    claim.paymentAssets.map(
      (payment): PlaceDetailPayment => ({
        assetSlug: payment.assetSlug,
        assetSymbol: payment.assetSymbol,
        networkSlug: payment.networkSlug,
        paymentMethod: payment.paymentMethod,
        routeType: claim.routeType,
        processorSlug: claim.processorSlug,
        isPrimary: payment.isPrimary,
        notes: payment.notes,
      }),
    ),
  );

  const cover = place.media.find((media) => media.role === 'cover') ?? null;
  const gallery = place.media.filter((media) => media !== cover);
  const lastConfirmedAt = claims.reduce(
    (latest, claim) =>
      Date.parse(claim.lastConfirmedAt) > Date.parse(latest) ? claim.lastConfirmedAt : latest,
    claims[0]?.lastConfirmedAt ?? new Date(0).toISOString(),
  );

  return {
    place,
    status: statusForClaims(claims),
    address: buildAddress(place),
    claims,
    payments,
    assetSymbols: uniqueStrings(payments.map((payment) => payment.assetSymbol)),
    networkSlugs: uniqueStrings(payments.map((payment) => payment.networkSlug)),
    cover,
    gallery,
    lastConfirmedAt,
  };
}

export function parsePublicPlacesDocument(value: unknown): PublicPlace[] {
  return publicPlacesFileSchema.parse(value).records;
}
