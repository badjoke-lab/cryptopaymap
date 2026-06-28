import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import { AdminDashboardAuthorizationError } from './authorization';

const protectedAdminIdentitySchema = z
  .object({
    actorId: z.string().trim().min(1).max(220),
    actorType: z.enum(['human', 'system']),
    subject: z.string().trim().min(1).max(200),
    email: z.email().max(320).nullable(),
  })
  .strict()
  .superRefine((identity, context) => {
    if (identity.actorId !== `cloudflare-access:${identity.subject}`) {
      context.addIssue({
        code: 'custom',
        path: ['actorId'],
        message: 'The actor identifier does not match the verified subject.',
      });
    }
    if ((identity.email === null) !== (identity.actorType === 'system')) {
      context.addIssue({
        code: 'custom',
        path: ['actorType'],
        message: 'The actor type does not match the verified identity shape.',
      });
    }
  });

export function readProtectedAdminIdentity(value: unknown): AdminAccessIdentity {
  const result = protectedAdminIdentitySchema.safeParse(value);
  if (!result.success) {
    throw new AdminDashboardAuthorizationError(
      'denied',
      'A verified administration identity is required.',
    );
  }
  return result.data;
}
