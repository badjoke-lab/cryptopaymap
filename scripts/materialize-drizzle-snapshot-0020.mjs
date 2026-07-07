import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const names = [
  'part01',
  'part02',
  'part03',
  'part04',
  'part05',
  'part06',
  'part07',
  'part08',
];
const parts = await Promise.all(
  names.map((name) =>
    readFile(
      new URL(`../drizzle/snapshot-artifacts/0020_snapshot.json.br.hex.${name}`, import.meta.url),
      'utf8',
    ),
  ),
);
const targetUrl = new URL('../drizzle/meta/0020_snapshot.json', import.meta.url);
const expected = '59edb250b4885049be03f489164c7afd5c93d1e9b9484b44e3c00712efca7d3e';
const snapshot = brotliDecompressSync(Buffer.from(parts.join('').trim(), 'hex'));
const actual = createHash('sha256').update(snapshot).digest('hex');

if (actual !== expected) {
  throw new Error('Snapshot hash mismatch for 0020.');
}

JSON.parse(snapshot.toString('utf8'));
await writeFile(targetUrl, snapshot);
console.log('Materialized Drizzle snapshot 0020.');
