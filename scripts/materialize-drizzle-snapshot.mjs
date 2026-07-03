import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const snapshots = [
  {
    compressedPath: '../drizzle/snapshot-artifacts/0014_snapshot.json.gz',
    snapshotPath: '../drizzle/meta/0014_snapshot.json',
    expectedSha256: 'ceabb777cc98f01fa6b129a00e8b2c931d25f02806aeb559a18c6d8be1fbf951',
    label: '0014_clean_stardust',
  },
  {
    compressedPath: '../drizzle/snapshot-artifacts/0019_snapshot.json.gz',
    snapshotPath: '../drizzle/meta/0019_snapshot.json',
    expectedSha256: '314de9adff825dca5d32508d1423e883feafaf7fe0639c1bd1aa1f456d950960',
    label: '0019_overrated_rumiko_fujikawa',
  },
];

for (const snapshotConfig of snapshots) {
  const compressedUrl = new URL(snapshotConfig.compressedPath, import.meta.url);
  const snapshotUrl = new URL(snapshotConfig.snapshotPath, import.meta.url);
  const compressed = await readFile(compressedUrl);
  const snapshot = gunzipSync(compressed);
  const actualSha256 = createHash('sha256').update(snapshot).digest('hex');

  if (actualSha256 !== snapshotConfig.expectedSha256) {
    throw new Error(
      `Drizzle snapshot hash mismatch for ${snapshotConfig.label}: expected ${snapshotConfig.expectedSha256}, received ${actualSha256}.`,
    );
  }

  JSON.parse(snapshot.toString('utf8'));
  await writeFile(snapshotUrl, snapshot);
  console.log(`Materialized Drizzle snapshot ${snapshotConfig.label}.`);
}
