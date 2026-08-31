import { publicUpdatesFileSchema } from '../src/schemas/public-exports';

const generatedAt = '2026-08-31T00:00:00Z';

export function buildStagingReviewUpdates() {
  return publicUpdatesFileSchema.parse({
    schemaVersion: '1.0.0',
    generatedAt,
    records: [],
  });
}
