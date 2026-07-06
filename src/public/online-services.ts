import { z } from 'zod';
import {
  publicOnlineServiceSchema,
  publicOnlineServicesFileSchema,
} from '../schemas/public-exports';

export type PublicOnlineService = z.infer<typeof publicOnlineServiceSchema>;
export type PublicOnlineClaim = PublicOnlineService['claims'][number];
export type PublicOnlineStatus = PublicOnlineClaim['status'];

export interface OnlineServicePayment {
  assetSlug: string;
  assetSymbol: string;
  networkSlug: string;
  paymentMethod: string;
  routeType: PublicOnlineClaim['routeType'];
  processorSlug: string | null;
  isPrimary: boolean;
}

export interface OnlineServiceDetailModel {
  service: PublicOnlineService;
  status: PublicOnlineStatus;
  claims: PublicOnlineClaim[];
  payments: OnlineServicePayment[];
  assetSymbols: string[];
  networkSlugs: string[];
  processorSlugs: string[];
  acceptanceScopes: PublicOnlineClaim['acceptanceScope'][];
  cover: PublicOnlineService['media'][number] | null;
  gallery: PublicOnlineService['media'];
  lastConfirmedAt: string;
}

export interface OnlineServiceCardModel {
  serviceSlug: string;
  name: string;
  categorySlug: string;
  countryCode: string | null;
  status: PublicOnlineStatus;
  assetSymbols: string[];
  networkSlugs: string[];
  acceptanceScopes: PublicOnlineClaim['acceptanceScope'][];
  cover: PublicOnlineService['media'][number] | null;
  lastConfirmedAt: string;
}

const statusPriority: Record<PublicOnlineStatus, number> = {
  confirmed: 0,
  stale: 1,
  ended: 2,
};

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function statusForClaims(claims: readonly PublicOnlineClaim[]): PublicOnlineStatus {
  if (claims.some((claim) => claim.status === 'confirmed')) return 'confirmed';
  if (claims.some((claim) => claim.status === 'stale')) return 'stale';
  return 'ended';
}

function latestConfirmation(claims: readonly PublicOnlineClaim[]): string {
  return claims.reduce(
    (latest, claim) =>
      Date.parse(claim.lastConfirmedAt) > Date.parse(latest) ? claim.lastConfirmedAt : latest,
    claims[0]?.lastConfirmedAt ?? new Date(0).toISOString(),
  );
}

export function buildOnlineServiceDetailModel(
  service: PublicOnlineService,
): OnlineServiceDetailModel {
  const claims = [...service.claims].sort((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) return statusDifference;
    return Date.parse(right.lastConfirmedAt) - Date.parse(left.lastConfirmedAt);
  });

  const payments = claims.flatMap((claim) =>
    claim.paymentAssets.map(
      (payment): OnlineServicePayment => ({
        assetSlug: payment.assetSlug,
        assetSymbol: payment.assetSymbol,
        networkSlug: payment.networkSlug,
        paymentMethod: payment.paymentMethod,
        routeType: claim.routeType,
        processorSlug: claim.processorSlug,
        isPrimary: payment.isPrimary,
      }),
    ),
  );
  const cover = service.media.find((media) => media.role === 'cover') ?? null;

  return {
    service,
    status: statusForClaims(claims),
    claims,
    payments,
    assetSymbols: uniqueStrings(payments.map((payment) => payment.assetSymbol)),
    networkSlugs: uniqueStrings(payments.map((payment) => payment.networkSlug)),
    processorSlugs: uniqueStrings(
      claims
        .map((claim) => claim.processorSlug)
        .filter((processor): processor is string => processor !== null),
    ),
    acceptanceScopes: [...new Set(claims.map((claim) => claim.acceptanceScope))],
    cover,
    gallery: service.media.filter((media) => media !== cover),
    lastConfirmedAt: latestConfirmation(claims),
  };
}

export function buildOnlineServiceCardModel(service: PublicOnlineService): OnlineServiceCardModel {
  const detail = buildOnlineServiceDetailModel(service);
  return {
    serviceSlug: service.serviceSlug,
    name: service.name,
    categorySlug: service.categorySlug,
    countryCode: service.countryCode,
    status: detail.status,
    assetSymbols: detail.assetSymbols,
    networkSlugs: detail.networkSlugs,
    acceptanceScopes: detail.acceptanceScopes,
    cover: detail.cover,
    lastConfirmedAt: detail.lastConfirmedAt,
  };
}

export function filterPublicOnlineServices(
  services: readonly PublicOnlineService[],
  search: string,
): PublicOnlineService[] {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return [...services];

  return services.filter((service) =>
    [service.name, service.categorySlug, service.countryCode ?? '']
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  );
}

export function parsePublicOnlineServicesDocument(value: unknown): PublicOnlineService[] {
  return publicOnlineServicesFileSchema.parse(value).records;
}
