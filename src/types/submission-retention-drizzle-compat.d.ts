import type { SQL, SQLWrapper } from 'drizzle-orm';

declare module 'drizzle-orm' {
  /**
   * Retention exclusion queries compare a UUID column with another UUID column
   * expression. Keep the overload expression-based so regular value checks
   * continue to use Drizzle's existing strict overloads.
   */
  export function eq(left: SQLWrapper, right: unknown): SQL;
}
