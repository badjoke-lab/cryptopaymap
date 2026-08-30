import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { assets, networks, paymentMethods } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing registry audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const [[bitcoin], [bitcoinNetwork], [onchain]] = await Promise.all([
    db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.slug, 'bitcoin'), eq(assets.status, 'active')))
      .limit(1),
    db
      .select({ id: networks.id })
      .from(networks)
      .where(and(eq(networks.slug, 'bitcoin'), eq(networks.status, 'active')))
      .limit(1),
    db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.slug, 'onchain'), eq(paymentMethods.status, 'active')))
      .limit(1),
  ]);

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      bitcoinAssetReady: Boolean(bitcoin),
      bitcoinNetworkReady: Boolean(bitcoinNetwork),
      onchainPaymentMethodReady: Boolean(onchain),
      mutationPerformed: false,
      publicDataChanged: false,
    }),
  );
}

await main();
