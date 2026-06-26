import { z } from 'zod';
import {
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../db/schema';

export const paymentRouteRecordSchema = z.object({
  slug: z.enum(routeTypeValues),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  status: z.enum(paymentRegistryStatusValues),
});

export const paymentMethodRecordSchema = z.object({
  slug: z.enum(paymentMethodValues),
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(96)),
  description: z.string().trim().min(1).max(500),
  status: z.enum(paymentRegistryStatusValues),
});

export type PaymentRouteRecord = z.infer<typeof paymentRouteRecordSchema>;
export type PaymentMethodRecord = z.infer<typeof paymentMethodRecordSchema>;
