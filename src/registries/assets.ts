import { assetRegistryEntrySchema, type AssetRegistryEntry } from '../schemas/assets';

const source = [
  { slug: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', aliases: ['XBT'], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 8, status: 'active' },
  { slug: 'ethereum', symbol: 'ETH', name: 'Ether', aliases: ['Ethereum'], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 18, status: 'active' },
  { slug: 'tether', symbol: 'USDT', name: 'Tether USD', aliases: ['Tether'], assetType: 'token', isStablecoin: true, isWrapped: false, defaultDecimals: null, status: 'active' },
  { slug: 'usd-coin', symbol: 'USDC', name: 'USD Coin', aliases: [], assetType: 'token', isStablecoin: true, isWrapped: false, defaultDecimals: null, status: 'active' },
  { slug: 'solana', symbol: 'SOL', name: 'Solana', aliases: [], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 9, status: 'active' },
  { slug: 'xrp', symbol: 'XRP', name: 'XRP', aliases: [], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 6, status: 'active' },
  { slug: 'litecoin', symbol: 'LTC', name: 'Litecoin', aliases: [], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 8, status: 'active' },
  { slug: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', aliases: [], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 8, status: 'active' },
  { slug: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash', aliases: [], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 8, status: 'active' },
  { slug: 'bnb', symbol: 'BNB', name: 'BNB', aliases: ['Binance Coin'], assetType: 'native', isStablecoin: false, isWrapped: false, defaultDecimals: 18, status: 'active' },
] as const;

export const assetRegistry = source.map((entry) => assetRegistryEntrySchema.parse(entry));

export function normalizeAssetLookup(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

export function findAssetCandidates(value: string): AssetRegistryEntry[] {
  const key = normalizeAssetLookup(value);
  return assetRegistry.filter((asset) =>
    [asset.slug, asset.symbol, asset.name, ...asset.aliases].some(
      (candidate) => normalizeAssetLookup(candidate) === key,
    ),
  );
}

export function getAssetBySlug(slug: string): AssetRegistryEntry | undefined {
  return assetRegistry.find((asset) => asset.slug === slug);
}
