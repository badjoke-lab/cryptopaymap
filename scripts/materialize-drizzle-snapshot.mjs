import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const compressedUrl = new URL(
  '../drizzle/snapshot-artifacts/0014_snapshot.json.gz',
  import.meta.url,
);
const snapshotUrl = new URL('../drizzle/meta/0014_snapshot.json', import.meta.url);
const expectedSha256 = 'ceabb777cc98f01fa6b129a00e8b2c931d25f02806aeb559a18c6d8be1fbf951';

const compressed = await readFile(compressedUrl);
const snapshot = gunzipSync(compressed);
const actualSha256 = createHash('sha256').update(snapshot).digest('hex');

if (actualSha256 !== expectedSha256) {
  throw new Error(
    `Candidate promotion snapshot hash mismatch: expected ${expectedSha256}, received ${actualSha256}.`,
  );
}

JSON.parse(snapshot.toString('utf8'));
await writeFile(snapshotUrl, snapshot);
console.log('Materialized Drizzle snapshot 0014_clean_stardust.');
