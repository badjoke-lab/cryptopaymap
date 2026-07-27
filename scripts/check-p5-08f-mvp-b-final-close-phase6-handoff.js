import fs from "node:fs";

const required = [
  "docs/P5_08A_MVP_B_INTEGRATION_AUDIT_MATRIX.md",
  "docs/P5_08B_PUBLIC_INTAKE_PRIVATE_STATUS_AUDIT.md",
  "docs/P5_08C_PROTECTED_REVIEW_FINAL_DECISION_AUDIT.md",
  "docs/P5_08D_CANONICAL_APPLICATION_PUBLICATION_HANDOFF_AUDIT.md",
  "docs/P5_08E_PRIVACY_RETENTION_REPLAY_CONFLICT_PARTIAL_FAILURE_AUDIT.md",
  "docs/P5_08F_MVP_B_FINAL_CLOSE_PHASE6_HANDOFF.md",
  "scripts/check-p5-08a-mvp-b-integration-audit-matrix.js",
  "scripts/check-p5-08b-public-intake-private-status-audit.js",
  "scripts/check-p5-08c-protected-review-final-decision.js",
  "scripts/check-p5-08d-canonical-application-publication-handoff-audit.js",
  "scripts/check-p5-08e-privacy-retention-replay-conflict-partial-failure.js",
  ".github/workflows/p5-08a-mvp-b-integration-audit-matrix.yml",
  ".github/workflows/p5-08b-public-intake-private-status-audit.yml",
  ".github/workflows/p5-08c-protected-review-final-decision-audit.yml",
  ".github/workflows/p5-08d-canonical-application-publication-handoff-audit.yml",
  ".github/workflows/p5-08e-privacy-retention-replay-conflict-partial-failure-audit.yml",
];

for (const path of required) {
  if (!fs.existsSync(path)) throw new Error(`missing retained P5-08 evidence: ${path}`);
}

const doc = fs.readFileSync("docs/P5_08F_MVP_B_FINAL_CLOSE_PHASE6_HANDOFF.md", "utf8");
for (const marker of [
  "Suggest",
  "Payment Report",
  "Problem Report",
  "Business Claim",
  "Photos",
  "Cloudflare Access",
  "Capability allowlists",
  "Neon",
  "R2 and Media",
  "Export/release",
  "Publication",
  "Retention",
  "Failure recovery",
  "Privacy",
  "does not prove production deployment",
]) {
  if (!doc.includes(marker)) throw new Error(`missing P5-08F marker: ${marker}`);
}

const status = fs.readFileSync("docs/PROJECT_STATUS.md", "utf8");
for (const marker of ["P5-08A", "P5-08B", "P5-08C", "P5-08D", "P5-08E", "P5-08F", "Phase 6"]) {
  if (!status.includes(marker)) throw new Error(`missing project status marker: ${marker}`);
}

console.log("P5-08F final close and Phase 6 handoff audit passed");
