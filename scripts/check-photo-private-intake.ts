import { quarantineUploadReservations } from '../src/db/schema';
import { createPhotoPrivateIntakeService } from '../src/submissions/photo-intake-service';

if (quarantineUploadReservations.id.name !== 'id') {
  throw new Error('Quarantine reservation schema is not exported.');
}
if (typeof createPhotoPrivateIntakeService !== 'function') {
  throw new Error('Photo private intake service is not executable.');
}

console.log('Photo private intake schema and service checks passed.');
