import type { SQL } from 'drizzle-orm';
import { submissionRetentionItems } from '../db/schema';

declare module 'drizzle-orm' {
  /**
   * The retention exclusion helper accepts either a concrete UUID or a UUID
   * column expression. Keep this overload scoped to the retention reference
   * column so the rest of Drizzle's equality checks remain strict.
   */
  export function eq(left: typeof submissionRetentionItems.referenceId, right: unknown): SQL;
}
