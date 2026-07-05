import {
  buildOnlineServiceDetailModel,
  type PublicOnlineService,
} from './online-services';
import { buildPlaceDetailModel, type PublicPlace } from './place-detail';

export interface HomeBrowseItem {
  value: string;
  label: string;
  count: number;
}

export interface HomeRecentRecord {
  kind: 'place' | 'service';
  slug: string;
  name: string;
  categorySlug: string;
  lastConfirmedAt: string;
  assetSymbols: string[];
}

export interface PublicHomeModel {
  confirmedPhysicalCount: number;
  confirmedOnlineCount: number;
  recentRecords: HomeRecentRecord[];
  assets: HomeBrowseItem[];
  networks: HomeBrowseItem[];
  regions: HomeBrowseItem[];
  onlineHighlights: HomeRecentRecord[];
}

function countValues(values: readonly string[]): HomeBrowseItem[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function countAssets(
  values: readonly { assetSlug: string; assetSymbol: string }[],
): HomeBrowseItem[] {
  const counts = new Map<string, HomeBrowseItem>();
  for (const asset of values) {
    const current = counts.get(asset.assetSlug);
    counts.set(asset.assetSlug, {
      value: asset.assetSlug,
      label: asset.assetSymbol,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.value.localeCompare(right.value),
  );
}

export function buildPublicHomeModel(
  places: readonly PublicPlace[],
  services: readonly PublicOnlineService[],
): PublicHomeModel {
  const confirmedPlaces = places
    .map(buildPlaceDetailModel)
    .filter((model) => model.status === 'confirmed');
  const confirmedServices = services
    .map(buildOnlineServiceDetailModel)
    .filter((model) => model.status === 'confirmed');

  const placeRecords: HomeRecentRecord[] = confirmedPlaces.map((model) => ({
    kind: 'place',
    slug: model.place.placeSlug,
    name: model.place.name,
    categorySlug: model.place.categorySlug,
    lastConfirmedAt: model.lastConfirmedAt,
    assetSymbols: model.assetSymbols,
  }));
  const serviceRecords: HomeRecentRecord[] = confirmedServices.map((model) => ({
    kind: 'service',
    slug: model.service.serviceSlug,
    name: model.service.name,
    categorySlug: model.service.categorySlug,
    lastConfirmedAt: model.lastConfirmedAt,
    assetSymbols: model.assetSymbols,
  }));

  const recentRecords = [...placeRecords, ...serviceRecords]
    .sort((left, right) => Date.parse(right.lastConfirmedAt) - Date.parse(left.lastConfirmedAt))
    .slice(0, 6);

  return {
    confirmedPhysicalCount: confirmedPlaces.length,
    confirmedOnlineCount: confirmedServices.length,
    recentRecords,
    assets: countAssets([
      ...confirmedPlaces.flatMap((model) => model.payments),
      ...confirmedServices.flatMap((model) => model.payments),
    ]).slice(0, 8),
    networks: countValues([
      ...confirmedPlaces.flatMap((model) => model.networkSlugs),
      ...confirmedServices.flatMap((model) => model.networkSlugs),
    ]).slice(0, 8),
    regions: countValues([
      ...confirmedPlaces.map((model) => model.place.countryCode),
      ...confirmedServices
        .map((model) => model.service.countryCode)
        .filter((country): country is string => country !== null),
    ]).slice(0, 8),
    onlineHighlights: serviceRecords
      .sort((left, right) => Date.parse(right.lastConfirmedAt) - Date.parse(left.lastConfirmedAt))
      .slice(0, 3),
  };
}
