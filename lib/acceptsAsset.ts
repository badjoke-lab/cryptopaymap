const ASSET_ALIAS_MAP: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  eth: "ETH",
  usdt: "USDT",
  tether: "USDT",
};

export const normalizeAcceptsAsset = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return ASSET_ALIAS_MAP[normalized] ?? normalized.toUpperCase();
};

export const getAcceptsAssetLabel = (asset: string): string => {
  switch (asset) {
    case "BTC":
      return "Bitcoin";
    case "ETH":
      return "Ethereum";
    case "USDT":
      return "Tether";
    default:
      return asset;
  }
};
