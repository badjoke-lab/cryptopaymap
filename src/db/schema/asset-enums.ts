import { pgEnum } from 'drizzle-orm/pg-core';

export const assetTypeValues = ['native', 'token', 'other'] as const;
export const assetStatusValues = ['active', 'deprecated'] as const;
export const assetAliasTypeValues = ['symbol', 'name', 'legacy', 'common'] as const;

export const assetTypeEnum = pgEnum('asset_type', assetTypeValues);
export const assetStatusEnum = pgEnum('asset_status', assetStatusValues);
export const assetAliasTypeEnum = pgEnum('asset_alias_type', assetAliasTypeValues);
