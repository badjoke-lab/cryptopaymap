import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import { quarantineUploadReservations } from '../db/schema';
import type {
  PhotoUploadReservationPersistence,
  PhotoUploadReservationRecord,
} from './photo-upload-authorization';

type DatabaseBatchInput = Parameters<CryptoPayMapDatabase['batch']>[0];

function record(row: typeof quarantineUploadReservations.$inferSelect): PhotoUploadReservationRecord {
  return {
    id: row.id,
    intakeRequestId: row.intakeRequestId,
    purpose: row.purpose,
    expiresAt: row.expiresAt.toISOString(),
    consumedBySubmissionId: row.consumedBySubmissionId,
    consumedAt: row.consumedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createDrizzlePhotoUploadReservationPersistence(
  database: CryptoPayMapDatabase,
): PhotoUploadReservationPersistence {
  async function readByIntakeRequestId(intakeRequestId: string) {
    const rows = await database
      .select()
      .from(quarantineUploadReservations)
      .where(eq(quarantineUploadReservations.intakeRequestId, intakeRequestId))
      .orderBy(asc(quarantineUploadReservations.id));
    return rows.map(record);
  }

  return {
    readByIntakeRequestId,

    async createReservations(command) {
      const intakeRequestId = command.reservations[0]?.intakeRequestId;
      if (intakeRequestId === undefined) {
        return { insertedCount: 0, reservations: [] };
      }
      if (
        command.reservations.some(
          (reservation) => reservation.intakeRequestId !== intakeRequestId,
        )
      ) {
        throw new Error('Reservation creation must use one intake request ID.');
      }

      const reservationIds = command.reservations.map((reservation) => reservation.id);
      const expectedCount = reservationIds.length;
      const lock = database.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${intakeRequestId}, 0))`,
      );
      const guard = database.select({
        guard: sql<number>`1 / case when
          not exists (
            select 1 from ${quarantineUploadReservations}
            where ${quarantineUploadReservations.intakeRequestId} = ${intakeRequestId}
          )
          or (
            (select count(*) from ${quarantineUploadReservations}
              where ${quarantineUploadReservations.intakeRequestId} = ${intakeRequestId}) = ${expectedCount}
            and
            (select count(*) from ${quarantineUploadReservations}
              where ${quarantineUploadReservations.intakeRequestId} = ${intakeRequestId}
                and ${inArray(quarantineUploadReservations.id, reservationIds)}) = ${expectedCount}
          )
          then 1 else 0 end`,
      });
      const insert = database
        .insert(quarantineUploadReservations)
        .values(
          command.reservations.map((reservation) => ({
            id: reservation.id,
            intakeRequestId: reservation.intakeRequestId,
            purpose: reservation.purpose,
            expiresAt: reservation.expiresAt,
            consumedBySubmissionId: null,
            consumedAt: null,
            createdAt: reservation.createdAt,
          })),
        )
        .onConflictDoNothing({ target: quarantineUploadReservations.id })
        .returning({ id: quarantineUploadReservations.id });

      const results = (await database.batch([
        lock,
        guard,
        insert,
      ] as unknown as DatabaseBatchInput)) as unknown[] | readonly unknown[];
      const insertedRows = (results[2] ?? []) as Array<{ id: string }>;
      return {
        insertedCount: insertedRows.length,
        reservations: await readByIntakeRequestId(intakeRequestId),
      };
    },
  };
}
