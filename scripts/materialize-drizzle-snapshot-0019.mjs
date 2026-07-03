import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const encoded = await readFile(
  new URL('../drizzle/snapshot-artifacts/0019_snapshot.json.br.b64', import.meta.url),
  'utf8',
);
const snapshot = brotliDecompressSync(Buffer.from(encoded.trim(), 'base64'));
const actualSha256 = createHash('sha256').update(snapshot).digest('hex');
const expectedSha256 = '314de9adff825dca5d32508d1423e883feafaf7fe0639c1bd1aa1f456d950960';

if (actualSha256 !== expectedSha256) {
  throw new Error(
    `Drizzle snapshot hash mismatch for 0019_overrated_rumiko_fujikawa: expected ${expectedSha256}, received ${actualSha256}.`,
  );
}

JSON.parse(snapshot.toString('utf8'));
await writeFile(new URL('../drizzle/meta/0019_snapshot.json', import.meta.url), snapshot);
console.log('Materialized Drizzle snapshot 0019_overrated_rumiko_fujikawa.');
