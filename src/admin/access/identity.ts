import { z } from 'zod';

const verifiedAccessPayloadSchema = z
  .object({
    sub: z.string().trim().min(1).max(200),
    email: z.email().nullable().optional(),
    iss: z.url().optional(),
    aud: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

export interface AdminAccessIdentity {
  actorId: string;
  actorType: 'human' | 'system';
  subject: string;
  email: string | null;
}

export class AdminAccessIdentityError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('The verified Cloudflare Access identity payload is invalid.');
    this.name = 'AdminAccessIdentityError';
    this.issues = issues;
  }
}

export function parseVerifiedAdminAccessIdentity(payload: unknown): AdminAccessIdentity {
  const result = verifiedAccessPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new AdminAccessIdentityError(
      result.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? '$' : issue.path.map(String).join('.');
        return `${path}: ${issue.message}`;
      }),
    );
  }

  const email = result.data.email ?? null;
  return Object.freeze({
    actorId: `cloudflare-access:${result.data.sub}`,
    actorType: email === null ? 'system' : 'human',
    subject: result.data.sub,
    email,
  });
}
