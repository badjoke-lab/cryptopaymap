import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('./backfill-chipotle-official-place-profiles-staging.ts', import.meta.url);
const temporaryUrl = new URL('./.tmp-backfill-chipotle-incomplete-profiles-staging.ts', import.meta.url);

let source = await readFile(sourceUrl, 'utf8');

function replaceOnce(oldValue, newValue, label) {
  if (!source.includes(oldValue)) throw new Error(`Chipotle backfill patch target changed: ${label}`);
  source = source.replace(oldValue, newValue);
}

replaceOnce(
  `      canonicalLocationId: sourceCandidates.canonicalLocationId,\n      sourceRecordId: sourceRecords.id,`,
  `      canonicalLocationId: sourceCandidates.canonicalLocationId,\n      locationVisibility: locations.visibility,\n      currentPhone: locations.phone,\n      currentDescription: locations.description,\n      currentOpeningHours: locations.openingHours,\n      currentAmenities: locations.amenities,\n      sourceRecordId: sourceRecords.id,`,
  'selected canonical profile fields',
);

replaceOnce(
  `    .from(sourceCandidates)\n    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))`,
  `    .from(sourceCandidates)\n    .innerJoin(locations, eq(locations.id, sourceCandidates.canonicalLocationId))\n    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))`,
  'canonical location join',
);

replaceOnce(
  `  const targets = rows\n    .filter((row) => row.relationship === 'origin')\n    .filter((row) => record(row.rawPayload).sourceSystem === SOURCE_SYSTEM)\n    .slice(0, MAX_RECORDS);`,
  `  const targets = rows\n    .filter((row) => row.relationship === 'origin')\n    .filter((row) => record(row.rawPayload).sourceSystem === SOURCE_SYSTEM)\n    .filter((row) => row.locationVisibility === 'public')\n    .filter((row) =>\n      typeof row.currentPhone !== 'string' || row.currentPhone.trim().length < 1 ||\n      typeof row.currentDescription !== 'string' || row.currentDescription.trim().length < 30 ||\n      typeof row.currentOpeningHours !== 'string' || row.currentOpeningHours.trim().length < 1 ||\n      !Array.isArray(row.currentAmenities) || row.currentAmenities.length < 1\n    )\n    .slice(0, MAX_RECORDS);`,
  'incomplete public profile selection',
);

replaceOnce(
  `  if (targets.length < 1) throw new Error('No promoted Chipotle official location records found for profile backfill.');`,
  `  if (targets.length < 1) {\n    console.log(JSON.stringify({ target: TARGET, merchant: 'Chipotle', incompleteProfiles: 0, noOp: true }));\n    return;\n  }`,
  'empty target no-op',
);

await writeFile(temporaryUrl, source, 'utf8');
try {
  execFileSync('npx', ['tsx', fileURLToPath(temporaryUrl)], {
    stdio: 'inherit',
    env: process.env,
  });
} finally {
  await rm(temporaryUrl, { force: true });
}
