import { describe, expect, it } from 'vitest';

const mutationUiFileNames = [
  'DuplicateReviewDecisionForm.tsx',
  'CandidatePromotionForm.tsx',
  'CandidateExistingTargetForm.tsx',
  'LocationCorrectionEditor.tsx',
  'EvidenceReviewDetail.tsx',
  'ReconfirmationDetail.tsx',
  'MediaReviewDetail.tsx',
  'ExportReleaseDetail.tsx',
] as const;

const adminComponentSources = import.meta.glob('../src/components/admin/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const idempotencyHeaderPattern = /['"]Idempotency-Key['"]\s*:\s*crypto\.randomUUID\(\)/;

function sourceFor(fileName: string): string {
  const entry = Object.entries(adminComponentSources).find(([path]) => path.endsWith(`/${fileName}`));
  if (entry === undefined) throw new Error(`Missing Admin component source: ${fileName}`);
  return entry[1];
}

describe('reachable Admin mutation UI idempotency contract', () => {
  for (const fileName of mutationUiFileNames) {
    it(`${fileName} sends a generated UUID Idempotency-Key`, () => {
      expect(sourceFor(fileName)).toMatch(idempotencyHeaderPattern);
    });
  }
});
