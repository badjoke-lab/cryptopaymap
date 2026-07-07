import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const files = [
  '0020_snapshot.json.br.part01',
  '0020_snapshot.json.br.part02',
  '0020_snapshot.json.br.part03',
  '0020_snapshot.json.br.part04',
  '0020_snapshot.json.br.part05',
  '0020_snapshot.json.br.part06',
  '0020_snapshot.json.br.part07',
];
const parts = [];
for (const file of files) {
  parts.push(
    await readFile(new URL(`../drizzle/snapshot-artifacts/${file}`, import.meta.url)),
  );
}
const target = new URL('../drizzle/meta/0020_snapshot.json', import.meta.url);
const expected = '59edb250b4885049be03f489164c7afd5c93d1e9b9484b44e3c00712efca7d3e';
const snapshot = brotliDecompressSync(Buffer.concat(parts));
const actual = createHash('sha256').update(snapshot).digest('hex');
if (actual !== expected) throw new Error('Snapshot hash mismatch for 0020.');
JSON.parse(snapshot.toString('utf8'));
await writeFile(target, snapshot);
console.log('Materialized Drizzle snapshot 0020.');
