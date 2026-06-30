import { and, asc, eq, isNull } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { assets, entities, networks, paymentMethods } from '../../db/schema';
import type {
  CandidatePromotionRegistryBackend,
  CandidatePromotionRegistryOptions,
} from './workspace';

export function createDrizzlePromotionRegistryBackend(
  database: CryptoPayMapDatabase,
): CandidatePromotionRegistryBackend {
  return {
    async loadRegistryOptions(): Promise<CandidatePromotionRegistryOptions> {
      const [assetRows, networkRows, methodRows, processorRows] = await Promise.all([
        database
          .select({ id: assets.id, slug: assets.slug, symbol: assets.symbol, name: assets.name })
          .from(assets)
          .where(eq(assets.status, 'active'))
          .orderBy(asc(assets.symbol), asc(assets.name))
          .limit(500),
        database
          .select({ id: networks.id, slug: networks.slug, name: networks.name })
          .from(networks)
          .where(eq(networks.status, 'active'))
          .orderBy(asc(networks.name))
          .limit(500),
        database
          .select({ id: paymentMethods.id, slug: paymentMethods.slug, name: paymentMethods.name })
          .from(paymentMethods)
          .where(eq(paymentMethods.status, 'active'))
          .orderBy(asc(paymentMethods.name))
          .limit(100),
        database
          .select({ id: entities.id, name: entities.name, websiteUrl: entities.websiteUrl })
          .from(entities)
          .where(
            and(
              eq(entities.entityType, 'payment_processor'),
              eq(entities.entityStatus, 'active'),
              isNull(entities.deletedAt),
            ),
          )
          .orderBy(asc(entities.name))
          .limit(500),
      ]);

      return {
        assets: assetRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          label: `${row.symbol} — ${row.name}`,
        })),
        networks: networkRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          label: row.name,
        })),
        paymentMethods: methodRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          label: row.name,
        })),
        processors: processorRows.map((row) => ({
          id: row.id,
          name: row.name,
          websiteUrl: row.websiteUrl,
        })),
      };
    },
  };
}
