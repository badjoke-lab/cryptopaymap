import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/p5-07f-integrate.mjs';
let source = readFileSync(path, 'utf8');
const replacements = [
  [
    '    photoParentMediaDecisionIds: scenario.photoParentMediaDecisionIds,',
    '    photoParentMediaDecisionIds: scenario.photoParentMediaDecisionIds ?? [],',
  ],
  [
    '    for (const photoParentMediaDecisionIds of [undefined, [mediaDecisionIdA, mediaDecisionIdA]]) {',
    '    for (const photoParentMediaDecisionIds of [[], [mediaDecisionIdA, mediaDecisionIdA]]) {',
  ],
];
for (const [before, after] of replacements) {
  if (!source.includes(after)) {
    if (!source.includes(before)) throw new Error(`P5-07F type fix marker is missing: ${before}`);
    source = source.replace(before, after);
  }
}
writeFileSync(path, source);
