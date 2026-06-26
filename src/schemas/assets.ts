import { z } from 'zod';
import { assetStatusValues, assetTypeValues } from '../db/schema/asset-enums';
import { publicSlugSchema } from './core';

export const assetTypeSchema = z.enum(assetTypeValues);
export const assetStatusSchema = z.enum(assetStatusValues);
export const assetSymbolSchema = z.string().trim().toUpperCase().min(1).max(16);

export const assetRegistryEntrySchema = z.object({
  slug: publicSlugSchema,
  symbol: assetSymbolSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(96)),
  assetType: assetTypeSchema,
  isStablecoin: z.boolean(),
  isWrapped: z.boolean(),
  defaultDecimals: z.number().int().min(0).max(255).nullable(),
  status: assetStatusSchema,
});

export type AssetRegistryEntry = z.infer<typeof assetRegistryEntrySchema>;
