import { eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { networks, paymentMethods } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';

function conflict(message: string): never {
  throw new Error(`Refusing Bitcoin on-chain staging registry seed: ${message}`);
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Bitcoin on-chain registry seed outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  let networkCreated = false;
  let paymentMethodCreated = false;

  const [existingBitcoinNetwork] = await db
    .select()
    .from(networks)
    .where(eq(networks.slug, 'bitcoin'))
    .limit(1);
  if (existingBitcoinNetwork) {
    if (existingBitcoinNetwork.name !== 'Bitcoin' || existingBitcoinNetwork.status !== 'active') {
      conflict('existing bitcoin network does not match the bounded seed.');
    }
  } else {
    await db.insert(networks).values({
      slug: 'bitcoin',
      name: 'Bitcoin',
      aliases: null,
      status: 'active',
    });
    networkCreated = true;
  }

  const [existingOnchain] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.slug, 'onchain'))
    .limit(1);
  if (existingOnchain) {
    if (existingOnchain.name !== 'On-chain' || existingOnchain.status !== 'active') {
      conflict('existing onchain payment method does not match the bounded seed.');
    }
  } else {
    await db.insert(paymentMethods).values({
      slug: 'onchain',
      name: 'On-chain',
      aliases: null,
      description: null,
      status: 'active',
    });
    paymentMethodCreated = true;
  }

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      boundedRegistrySeed: true,
      networkCreated,
      paymentMethodCreated,
      bitcoinNetworkReady: true,
      onchainPaymentMethodReady: true,
      publicDataChanged: false,
      candidateDataExposed: false,
    }),
  );
}

await main();
