import { readFileSync } from "node:fs";

const files = {
  workflow: readFileSync(
    ".github/workflows/ops-p6-001i-configured-staging-p6-05-public-export-release.yml",
    "utf8",
  ),
  procedure: readFileSync(
    "docs/OPS_P6_001I_CONFIGURED_STAGING_P6_05_PUBLIC_EXPORT_RELEASE.md",
    "utf8",
  ),
  executor: readFileSync(
    "scripts/run-ops-p6-001i-configured-staging-public-export-release.mjs",
    "utf8",
  ),
  repositoryContract: readFileSync(
    "scripts/check-p6-05-configured-public-export-release-evidence.js",
    "utf8",
  ),
  deployment: readFileSync(
    ".github/workflows/staging-review-deploy.yml",
    "utf8",
  ),
  publication: readFileSync(
    "src/admin/export-release/publication-contract.ts",
    "utf8",
  ),
  activation: readFileSync("src/admin/export-release/activation-r2.ts", "utf8"),
  notFoundPage: readFileSync("src/pages/404.astro", "utf8"),
};

const expectations = [
  [files.workflow, "EXECUTE_CONFIGURED_STAGING_P6_05"],
  [files.workflow, "p6-05-public-export-release-receipt.json"],
  [files.workflow, "Enforce configured P6-05 acceptance"],
  [files.workflow, "CLOUDFLARE_API_TOKEN"],
  [files.workflow, "CLOUDFLARE_ACCOUNT_ID"],
  [files.workflow, "'src/pages/404.astro'"],
  [files.procedure, "production branch: `staging-review`"],
  [
    files.procedure,
    "exact project platform hostname: `cryptopaymap-staging.pages.dev`",
  ],
  [files.procedure, "exactly `staging.cryptopaymap.com` may remain attached"],
  [
    files.procedure,
    "Every other hostname remains disallowed and fails closed.",
  ],
  [files.procedure, "Preview deployments are never rollback targets."],
  [files.procedure, "top-level `404.html`"],
  [files.procedure, "authenticated historical release"],
  [files.procedure, "Historical releases are never reused"],
  [files.procedure, "Leave the exact candidate active"],
  [files.executor, "EXECUTE_CONFIGURED_STAGING_P6_05"],
  [files.executor, "staging-review"],
  [files.executor, "cryptopaymap-staging.pages.dev"],
  [files.executor, "staging.cryptopaymap.com"],
  [files.executor, "const priorP606ReceiptPath ="],
  [files.executor, "p6-06-domain-cutover-rollback-receipt.json"],
  [files.executor, "/p6-05-release.json"],
  [files.executor, "/rollback"],
  [files.executor, "async function markerVisible("],
  [files.executor, "async function activateRelease("],
  [files.executor, "already_visible"],
  [files.executor, "race_converged"],
  [files.executor, "rollback"],
  [files.executor, "cloudflare_api_400_8000039"],
  [files.executor, "candidateActivation"],
  [files.executor, "baselineActivation"],
  [files.executor, "candidateRestoration"],
  [files.executor, "unrecognized_production_deployment"],
  [files.executor, "staging:review:build"],
  [files.executor, ".pages.dev"],
  [files.executor, "platformDomainPresent"],
  [files.executor, "platformDomainMatches"],
  [files.executor, "customDomains"],
  [files.executor, "function readPriorP606Topology(statusRoot, commit, now)"],
  [files.executor, "authenticated_prior"],
  [files.executor, "expired_prior_proof"],
  [files.executor, "current_existing_candidate"],
  [files.executor, "expired_prior_revalidated"],
  [files.executor, "function evaluateProjectTopology("],
  [files.executor, "approvedCustomDomainPresent"],
  [files.executor, "priorP606State"],
  [files.executor, "priorP606ReceiptDigest"],
  [files.executor, "platformDomainPresent"],
  [files.executor, "platformDomainMatches"],
  [files.executor, "/__p6_05_missing__"],
  [files.executor, "function validP6ReleaseMarker(marker)"],
  [files.executor, "releaseMarker("],
  [files.executor, "const historical = []"],
  [files.executor, "historical.push({"],
  [files.executor, "recognized, historical, unrecognized"],
  [files.executor, "historicalCount: 0"],
  [files.executor, "historicalCount: classified.historical.length"],
  [files.executor, "candidateRestored"],
  [files.executor, "activeKind"],
  [files.notFoundPage, "import BaseLayout from '../layouts/BaseLayout.astro'"],
  [files.notFoundPage, "Page not found"],
  [
    files.repositoryContract,
    "P6-05 configured public export and release evidence contract passed.",
  ],
  [files.deployment, "--branch review"],
  [files.publication, "state: 'published' | 'replayed'"],
  [files.activation, "pointer_conflict"],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001I contract marker is missing: ${marker}`);
  }
}

const forbidden = [
  "postgresql://",
  "CLOUDFLARE_API_TOKEN=",
  "CLOUDFLARE_ACCOUNT_ID=",
  "X-Auth-Key:",
  "X-Amz-Signature=",
];
for (const [name, content] of Object.entries(files)) {
  for (const marker of forbidden) {
    if (content.includes(marker)) {
      throw new Error(
        `OPS-P6-001I ${name} contains forbidden material: ${marker}`,
      );
    }
  }
}

if (/--branch\s+review\b/.test(files.executor)) {
  throw new Error(
    "OPS-P6-001I executor must not treat the review preview branch as production.",
  );
}
if (
  !files.executor.includes("project?.production_branch === productionBranch")
) {
  throw new Error(
    "OPS-P6-001I executor must fail closed on the Pages production branch.",
  );
}
if (!files.executor.includes("platformDomainPresent &&")) {
  throw new Error(
    "OPS-P6-001I executor must require the exact Pages platform domain.",
  );
}
if (!files.executor.includes("platformDomainMatches &&")) {
  throw new Error(
    "OPS-P6-001I executor must require the project subdomain to match.",
  );
}
if (
  !files.executor.includes(
    "customDomains.length === 0 || authenticatedExactCustomDomain",
  )
) {
  throw new Error(
    "OPS-P6-001I executor must allow only bootstrap absence or one authenticated staging domain.",
  );
}
if (!files.executor.includes("customDomains.length === 1")) {
  throw new Error(
    "OPS-P6-001I executor must reject extra or ambiguous custom domains.",
  );
}
if (
  !files.executor.includes("customDomains[0] === approvedStagingCustomDomain")
) {
  throw new Error(
    "OPS-P6-001I executor must require the exact approved staging hostname.",
  );
}
if (!files.executor.includes("authenticated_prior")) {
  throw new Error(
    "OPS-P6-001I executor must authenticate prior P6-06 evidence.",
  );
}
if (!files.executor.includes("expired_prior_proof")) {
  throw new Error(
    "OPS-P6-001I executor must classify expired prior P6-06 only as historical proof.",
  );
}
if (!files.executor.includes("current_existing_candidate")) {
  throw new Error(
    "OPS-P6-001I expired-proof recovery must require a fresh exact-main P6-06 diagnostic.",
  );
}
if (!files.executor.includes("expired_prior_revalidated")) {
  throw new Error(
    "OPS-P6-001I must retain an explicit expired-proof recovery classification.",
  );
}
if (!files.executor.includes("checks?.rollback")) {
  throw new Error("OPS-P6-001I executor must require prior rollback proof.");
}
if (!files.executor.includes("checks?.externalRollback")) {
  throw new Error(
    "OPS-P6-001I executor must require prior external rollback proof.",
  );
}
if (!files.executor.includes("checks?.finalRestore")) {
  throw new Error(
    "OPS-P6-001I executor must require prior final restore proof.",
  );
}
if (!files.executor.includes("if (validP6ReleaseMarker(marker))")) {
  throw new Error(
    "OPS-P6-001I executor must authenticate retained release markers.",
  );
}
if (!files.executor.includes("marker.sourceCommit")) {
  throw new Error(
    "OPS-P6-001I executor must separate exact-current and historical releases.",
  );
}
if (
  !(
    files.executor.includes("recognized.push") &&
    files.executor.includes("historical.push")
  )
) {
  throw new Error(
    "OPS-P6-001I executor must not reuse historical releases as exact-current.",
  );
}
if (!files.executor.includes("bootstrapTopology")) {
  throw new Error(
    "OPS-P6-001I self-test must cover the no-domain bootstrap topology.",
  );
}
if (!files.executor.includes("authenticatedTopology")) {
  throw new Error(
    "OPS-P6-001I self-test must cover the authenticated staging domain.",
  );
}
if (!files.executor.includes("expiredRevalidatedTopology")) {
  throw new Error(
    "OPS-P6-001I self-test must cover expired prior proof with a fresh diagnostic.",
  );
}
if (!files.executor.includes("expiredUnrevalidatedTopology")) {
  throw new Error(
    "OPS-P6-001I self-test must reject expired prior proof without a fresh diagnostic.",
  );
}
if (!files.executor.includes("unauthenticatedTopology")) {
  throw new Error(
    "OPS-P6-001I self-test must reject an unauthenticated custom domain.",
  );
}
if (!files.executor.includes("extraDomainTopology")) {
  throw new Error(
    "OPS-P6-001I self-test must reject an additional custom domain.",
  );
}
if (!files.executor.includes("unconverged_8000039_not_rejected")) {
  throw new Error(
    "OPS-P6-001I must reject 8000039 without exact-marker convergence.",
  );
}
if (!files.executor.includes("alreadyVisible")) {
  throw new Error(
    "OPS-P6-001I self-test must cover already-visible activation.",
  );
}
if (!files.executor.includes("normalRollback")) {
  throw new Error(
    "OPS-P6-001I self-test must cover normal rollback activation.",
  );
}
if (!files.executor.includes("raceConverged")) {
  throw new Error(
    "OPS-P6-001I self-test must cover propagation-race convergence.",
  );
}

if (/['"]cryptopaymap\.com['"]/.test(files.executor)) {
  throw new Error(
    "OPS-P6-001I executor must not permit the CryptoPayMap apex hostname.",
  );
}
if (files.executor.includes("www.cryptopaymap.com")) {
  throw new Error(
    "OPS-P6-001I executor must not permit the CryptoPayMap www hostname.",
  );
}

console.log(
  "OPS-P6-001I configured staging public export/release contract check passed.",
);
