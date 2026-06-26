import { z } from 'zod';
import {
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../db/schema';
import { publicSlugSchema } from './core';

export const paymentRegistryStatusSchema = z.enum(paymentRegistryStatusValues);
export const paymentRouteSlugSchema = z.enum(routeTypeValues);
export const paymentMethodSlugSchema = z.enum(paymentMethodValues);

export const paymentRouteRegistryEntrySchema = z.object({
  slug: paymentRouteSlugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  status: paymentRegistryStatusSchema,
});

export const paymentMethodRegistryEntrySchema = z.object({
  slug: publicSlugSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(96)),
  description: z.string().trim().min(1).max(500),
  status: paymentRegistryStatusSchema,
});

export type PaymentRouteRegistryEntry = z.infer<typeof paymentRouteRegistryEntrySchema>;
export type PaymentMethodRegistryEntry = z.infer<typeof paymentMethodRegistryEntrySchema>;
