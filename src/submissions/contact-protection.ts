import { z } from 'zod';

export const protectedSubmissionContactSchema = z
  .object({
    encryptedEmail: z.string().min(1).max(20_000),
    emailHash: z.string().regex(/^[a-f0-9]{64}$/),
    retentionUntil: z.date().nullable(),
  })
  .strict();

export type ProtectedSubmissionContact = z.infer<typeof protectedSubmissionContactSchema>;

export interface SubmissionContactProtector {
  protectEmail(email: string, receivedAt: Date): Promise<ProtectedSubmissionContact>;
}
