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
  return createReconfirmationExpirationService(
    createDrizzleReconfirmationExpirationBackend(
      createDatabase(databaseUrl(environment)),
    ),
  ).expire(context, { ...input, claimId });
}
