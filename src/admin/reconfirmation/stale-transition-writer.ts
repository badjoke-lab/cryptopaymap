import { createDatabase } from '../../db/client';
import { createDrizzleReconfirmationExpirationBackend } from './drizzle-backend';
import {
  createReconfirmationExpirationService,
  type ReconfirmationExpirationContext,
  type ReconfirmationExpirationInput,
} from './expiration';
import { databaseUrl, type ReconfirmationHttpEnvironment } from './http-common';

export async function writeStaleTransition(
  context: ReconfirmationExpirationContext,
  claimId: string,
  input: ReconfirmationExpirationInput,
  environment: ReconfirmationHttpEnvironment,
) {
  const database = createDatabase(databaseUrl(environment));
  const backend = createDrizzleReconfirmationExpirationBackend(database);
  return createReconfirmationExpirationService(backend).expire(context, { ...input, claimId });
}
