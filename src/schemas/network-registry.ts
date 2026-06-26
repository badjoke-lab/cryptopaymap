import { z } from 'zod';
import { publicSlugSchema } from './core';

export const networkRegistryEntrySchema = z.object({
  slug: publicSlugSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(96)),
  status: z.enum(['active', 'deprecated']),
});

export type NetworkRegistryEntry = z.infer<typeof networkRegistryEntrySchema>;
