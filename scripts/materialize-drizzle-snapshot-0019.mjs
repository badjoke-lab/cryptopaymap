import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const parts = await Promise.all(
  Array.from({ length: 14 }, (_, index) =>
    readFile(
      new URL(
        `../drizzle/snapshot-artifacts/0019_snapshot.json.br.hex.part${String(
          index + 1,
        ).padStart(2, '0')}`,
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
const snapshot = brotliDecompressSync(Buffer.from(parts.join('').trim(), 'hex'));
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
