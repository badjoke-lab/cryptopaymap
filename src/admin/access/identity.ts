import { z } from 'zod';

const accessSubjectSchema = z.string().trim().min(1).max(200);
const serviceTokenCommonNameSchema = z
  .string()
  .trim()
  .min(8)
  .max(256)
  .regex(
    /^[A-Za-z0-9._:-]+\.access$/,
    'Use the verified Cloudflare Access service-token common name.',
  );

const verifiedAccessPayloadSchema = z
  .object({
    sub: z.string().max(200),
    email: z.email().nullable().optional(),
    common_name: z.string().nullable().optional(),
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

function identityError(issue: string): AdminAccessIdentityError {
  return new AdminAccessIdentityError([issue]);
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

  const subjectResult = accessSubjectSchema.safeParse(result.data.sub);
  if (subjectResult.success) {
    const email = result.data.email ?? null;
    return Object.freeze({
      actorId: `cloudflare-access:${subjectResult.data}`,
      actorType: email === null ? 'system' : 'human',
      subject: subjectResult.data,
      email,
    });
  }

  if (result.data.sub !== '') {
    throw identityError('sub: The verified Access subject is invalid.');
  }
  if (result.data.email !== undefined && result.data.email !== null) {
    throw identityError('email: A service-token identity must not contain a user email address.');
  }

  const commonNameResult = serviceTokenCommonNameSchema.safeParse(result.data.common_name);
  if (!commonNameResult.success) {
    throw identityError(
      'common_name: An empty Access subject requires a verified service-token common name.',
    );
  }

  const serviceSubject = `service-token:${commonNameResult.data}`;
  return Object.freeze({
    actorId: `cloudflare-access:${serviceSubject}`,
    actorType: 'system',
    subject: serviceSubject,
    email: null,
  });
}
