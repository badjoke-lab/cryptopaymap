import { eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { assets, networks, paymentMethods } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';

function conflict(message: string): never {
  throw new Error(`Refusing staging registry seed: ${message}`);
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing payment registry seed outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  let assetCreated = false;
  let networkCreated = false;
  let paymentMethodCreated = false;

  const [existingBitcoin] = await db.select().from(assets).where(eq(assets.slug, 'bitcoin')).limit(1);
  if (existingBitcoin) {
    if (
      existingBitcoin.symbol !== 'BTC' ||
      existingBitcoin.name !== 'Bitcoin' ||
      existingBitcoin.assetType !== 'native' ||
      existingBitcoin.isStablecoin ||
      existingBitcoin.isWrapped ||
      existingBitcoin.defaultDecimals !== 8 ||
      existingBitcoin.status !== 'active'
    ) {
      conflict('existing bitcoin asset does not match the canonical bounded seed.');
    }
  } else {
    const [btcBySymbol] = await db.select().from(assets).where(eq(assets.symbol, 'BTC')).limit(1);
    if (btcBySymbol) conflict('BTC symbol already belongs to a different asset row.');
    await db.insert(assets).values({
      slug: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      aliases: null,
      assetType: 'native',
      isStablecoin: false,
      isWrapped: false,
      defaultDecimals: 8,
      status: 'active',
    });
    assetCreated = true;
  }

  const [existingLightning] = await db
    .select()
    .from(networks)
    .where(eq(networks.slug, 'lightning'))
    .limit(1);
  if (existingLightning) {
    if (existingLightning.name !== 'Lightning Network' || existingLightning.status !== 'active') {
      conflict('existing lightning network does not match the canonical bounded seed.');
    }
  } else {
    await db.insert(networks).values({
      slug: 'lightning',
      name: 'Lightning Network',
      aliases: null,
      status: 'active',
    });
    networkCreated = true;
  }

  const [existingLightningInvoice] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.slug, 'lightning_invoice'))
    .limit(1);
  if (existingLightningInvoice) {
    if (
      existingLightningInvoice.name !== 'Lightning invoice' ||
      existingLightningInvoice.status !== 'active'
    ) {
      conflict('existing lightning_invoice method does not match the canonical bounded seed.');
    }
  } else {
    await db.insert(paymentMethods).values({
      slug: 'lightning_invoice',
      name: 'Lightning invoice',
      aliases: null,
      description: null,
      status: 'active',
    });
    paymentMethodCreated = true;
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      boundedRegistrySeed: true,
      assetCreated,
      networkCreated,
      paymentMethodCreated,
      registryEntriesRequired: 3,
      publicDataChanged: false,
      candidateDataExposed: false,
    }),
  );
}

await main();
