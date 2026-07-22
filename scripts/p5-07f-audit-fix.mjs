import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/p5-07f-integrate.mjs';
let source = readFileSync(path, 'utf8');
const before = "  'publication remains pending',";
const after = "  'Publication remains pending',";
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('P5-07F audit marker is missing.');
  source = source.replace(before, after);
  writeFileSync(path, source);
}
