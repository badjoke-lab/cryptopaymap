import { z } from 'zod';
import {
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../db/schema';

export const paymentRegistryStatusSchema = z.enum(paymentRegistryStatusValues);
export const paymentRouteSlugSchema = z.enum(routeTypeValues);
export const paymentMethodSlugSchema = z.enum(paymentMethodValues);
