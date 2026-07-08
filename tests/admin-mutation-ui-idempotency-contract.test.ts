import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mutationUiFiles = [
  'src/components/admin/DuplicateReviewDecisionForm.tsx',
  'src/components/admin/CandidatePromotionForm.tsx',
  'src/components/admin/CandidateExistingTargetForm.tsx',
  'src/components/admin/LocationCorrectionEditor.tsx',
  'src/components/admin/EvidenceReviewDetail.tsx',
  'src/components/admin/ReconfirmationDetail.tsx',
  'src/components/admin/MediaReviewDetail.tsx',
  'src/components/admin/ExportReleaseDetail.tsx',
] as const;

const idempotencyHeaderPattern = /['"]Idempotency-Key['"]\s*:\s*crypto\.randomUUID\(\)/;

describe('reachable Admin mutation UI idempotency contract', () => {
  for (const path of mutationUiFiles) {
    it(`${path} sends a generated UUID Idempotency-Key`, () => {
      const source = readFileSync(path, 'utf8');
      expect(source).toMatch(idempotencyHeaderPattern);
    });
  }
});
