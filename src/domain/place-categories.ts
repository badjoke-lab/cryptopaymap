export const placeCategoryValues = [
  'restaurant',
  'cafe',
  'bar',
  'retail',
  'lodging',
  'automotive',
  'health',
  'personal-services',
  'professional-services',
  'education',
  'arts-culture',
  'logistics',
] as const;

export type PlaceCategory = (typeof placeCategoryValues)[number];

export interface PlaceCategorySignals {
  name: string;
  amenity?: string | null | undefined;
  tourism?: string | null | undefined;
  shop?: string | null | undefined;
  office?: string | null | undefined;
  healthcare?: string | null | undefined;
}

function normalized(value: string | null | undefined): string | null {
  const next = value?.trim().toLowerCase();
  return next ? next : null;
}

export function classifyPlaceCategory(signals: PlaceCategorySignals): PlaceCategory | null {
  const name = signals.name.trim().toLowerCase();
  const amenity = normalized(signals.amenity);
  const tourism = normalized(signals.tourism);
  const shop = normalized(signals.shop);
  const office = normalized(signals.office);
  const healthcare = normalized(signals.healthcare);

  if (
    name.includes('chipotle') ||
    name.includes('steak n shake') ||
    name.includes("steak 'n shake")
  ) {
    return 'restaurant';
  }
  if (amenity && ['restaurant', 'fast_food', 'food_court'].includes(amenity)) {
    return 'restaurant';
  }
  if (amenity === 'cafe' || shop === 'coffee') return 'cafe';
  if (amenity && ['bar', 'pub', 'biergarten'].includes(amenity)) return 'bar';
  if (tourism && ['hotel', 'hostel', 'guest_house', 'motel'].includes(tourism)) return 'lodging';
  if (amenity === 'arts_centre' || (tourism && ['gallery', 'museum'].includes(tourism))) {
    return 'arts-culture';
  }
  if (amenity === 'car_rental' || shop === 'car_repair') return 'automotive';
  if (
    (amenity && ['doctors', 'clinic', 'dentist', 'pharmacy'].includes(amenity)) ||
    (healthcare && ['doctor', 'physiotherapist', 'dentist', 'pharmacy'].includes(healthcare))
  ) {
    return 'health';
  }
  if (amenity && ['parcel_locker', 'post_office'].includes(amenity)) return 'logistics';
  if (office === 'educational_institution') return 'education';
  if (
    office &&
    ['consulting', 'it', 'advertising_agency', 'association', 'company', 'financial'].includes(office)
  ) {
    return 'professional-services';
  }
  if (shop && ['beauty', 'tailor'].includes(shop)) return 'personal-services';
  if (shop) return 'retail';
  return null;
}
