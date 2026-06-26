import {
  networkRegistryEntrySchema,
  type NetworkRegistryEntry,
} from '../schemas/network-registry';

const source = [
  { slug: 'bitcoin', name: 'Bitcoin', aliases: ['Bitcoin mainnet'], status: 'active' },
  { slug: 'lightning', name: 'Lightning Network', aliases: ['LN'], status: 'active' },
  { slug: 'ethereum', name: 'Ethereum', aliases: ['ERC20'], status: 'active' },
  { slug: 'base', name: 'Base', aliases: [], status: 'active' },
  { slug: 'tron', name: 'Tron', aliases: ['TRC20'], status: 'active' },
  { slug: 'solana', name: 'Solana', aliases: [], status: 'active' },
  { slug: 'xrpl', name: 'XRP Ledger', aliases: ['XRPL'], status: 'active' },
  { slug: 'polygon', name: 'Polygon PoS', aliases: ['Polygon'], status: 'active' },
  { slug: 'arbitrum', name: 'Arbitrum One', aliases: ['Arbitrum'], status: 'active' },
  {
    slug: 'bnb-smart-chain',
    name: 'BNB Smart Chain',
    aliases: ['BSC'],
    status: 'active',
  },
  { slug: 'avalanche-c', name: 'Avalanche C-Chain', aliases: ['Avalanche C'], status: 'active' },
  { slug: 'litecoin', name: 'Litecoin', aliases: [], status: 'active' },
  { slug: 'dogecoin', name: 'Dogecoin', aliases: [], status: 'active' },
  { slug: 'bitcoin-cash', name: 'Bitcoin Cash', aliases: [], status: 'active' },
] as const;

export const networkRegistry = source.map((entry) => networkRegistryEntrySchema.parse(entry));

export function normalizeNetworkLookup(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

export function findNetworkCandidates(value: string): NetworkRegistryEntry[] {
  const key = normalizeNetworkLookup(value);

  return networkRegistry.filter((network) =>
    [network.slug, network.name, ...network.aliases].some(
      (candidate) => normalizeNetworkLookup(candidate) === key,
    ),
  );
}

export function getNetworkBySlug(slug: string): NetworkRegistryEntry | undefined {
  return networkRegistry.find((network) => network.slug === slug);
}
