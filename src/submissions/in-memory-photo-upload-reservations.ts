import type {
  CreatePhotoUploadReservationCommand,
  PhotoUploadReservationPersistence,
  PhotoUploadReservationRecord,
} from './photo-upload-authorization';

function exactIds(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

export function createInMemoryPhotoUploadReservationPersistence(): PhotoUploadReservationPersistence & {
  list(): PhotoUploadReservationRecord[];
  markConsumed(reservationId: string, submissionId?: string, consumedAt?: Date): void;
} {
  const reservations = new Map<string, PhotoUploadReservationRecord>();

  function byRequest(intakeRequestId: string): PhotoUploadReservationRecord[] {
    return [...reservations.values()]
      .filter((reservation) => reservation.intakeRequestId === intakeRequestId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((reservation) => structuredClone(reservation));
  }

  return {
    async readByIntakeRequestId(intakeRequestId) {
      return byRequest(intakeRequestId);
    },

    async createReservations(command: CreatePhotoUploadReservationCommand) {
      const intakeRequestId = command.reservations[0]?.intakeRequestId;
      if (intakeRequestId === undefined) {
        return { insertedCount: 0, reservations: [] };
      }
      if (
        command.reservations.some((reservation) => reservation.intakeRequestId !== intakeRequestId)
      ) {
        throw new Error('Reservation creation must use one intake request ID.');
      }

      const existing = byRequest(intakeRequestId);
      const expectedIds = command.reservations.map((reservation) => reservation.id);
      if (existing.length > 0) {
        if (
          !exactIds(
            existing.map((reservation) => reservation.id),
            expectedIds,
          )
        ) {
          throw new Error('Reservation request conflicts with existing private state.');
        }
        return { insertedCount: 0, reservations: existing };
      }

      for (const reservation of command.reservations) {
        reservations.set(reservation.id, {
          id: reservation.id,
          intakeRequestId: reservation.intakeRequestId,
          purpose: reservation.purpose,
          expiresAt: reservation.expiresAt.toISOString(),
          consumedBySubmissionId: null,
          consumedAt: null,
          createdAt: reservation.createdAt.toISOString(),
        });
      }
      return {
        insertedCount: command.reservations.length,
        reservations: byRequest(intakeRequestId),
      };
    },

    list() {
      return [...reservations.values()].map((reservation) => structuredClone(reservation));
    },

    markConsumed(reservationId, submissionId = crypto.randomUUID(), consumedAt = new Date()) {
      const reservation = reservations.get(reservationId);
      if (reservation === undefined) throw new Error('Reservation does not exist.');
      reservations.set(reservationId, {
        ...reservation,
        consumedBySubmissionId: submissionId,
        consumedAt: consumedAt.toISOString(),
      });
    },
  };
}
