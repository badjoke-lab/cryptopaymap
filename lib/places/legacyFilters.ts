export const LEGACY_TEST_IDS = new Set([
  "cpm:tokyo:owner-cafe-1",
  "cpm:newyork:community-diner-1",
  "cpm:paris:directory-bistro-1",
  "cpm:sydney:unverified-bookstore-1",
  "cpm:toronto:owner-bakery-1",
]);

export const isAntarcticaDemoId = (id: string) => id.toLowerCase().startsWith("antarctica-");

export const isLegacyOrDemoId = (id: string) => LEGACY_TEST_IDS.has(id) || isAntarcticaDemoId(id);
