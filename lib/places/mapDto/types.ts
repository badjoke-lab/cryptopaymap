export type Verification = "owner" | "community" | "directory" | "unverified";

export type PlaceSummary = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  verification: Verification;
  category: string;
  city: string;
  country: string;
  accepted: string[];
};

export type PlaceMapItem = PlaceSummary;

export type PlaceSummaryPlus = PlaceSummary & {
  address_full: string | null;
  about_short: string | null;
  paymentNote: string | null;
  amenities: string[] | null;
  phone: string | null;
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  facebook: string | null;
  coverImage: string | null;
};

export type DbContact = {
  website: string | null;
  phone: string | null;
  twitter: string | null;
  instagram: string | null;
  facebook: string | null;
};
