import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function read(path) {
  return readFileSync(path, 'utf8');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const reportContract = read('src/submissions/report-contract.ts');
for (const kind of ['asset', 'network', 'instructions', 'location_profile', 'other']) {
  assert.ok(
    reportContract.includes(`kind: z.literal('${kind}')`),
    `Problem Report correction kind ${kind} must remain explicit.`,
  );
}
assert.match(reportContract, /wrong_asset: \['asset'\]/);
assert.match(reportContract, /wrong_network: \['network'\]/);
assert.match(reportContract, /wrong_instructions: \['instructions'\]/);
assert.match(reportContract, /wrong_address: \['location_profile'\]/);

const locationApplication = read(
  'src/admin/submissions/problem-location-correction-application.ts',
);
assert.match(locationApplication, /correction\.countryCode !== null/);
assert.match(locationApplication, /correction\.latitude !== null/);
assert.match(locationApplication, /correction\.longitude !== null/);
assert.match(
  locationApplication,
  /Country and coordinate changes require a separate canonical correction boundary\./,
);
assert.doesNotMatch(locationApplication, /acceptanceClaims/);
assert.doesNotMatch(locationApplication, /claimAssets/);

const acceptanceClaims = read('src/db/schema/acceptance-claims.ts');
assert.match(acceptanceClaims, /howToPay: text\('how_to_pay'\)/);
assert.match(acceptanceClaims, /claimStatus} <> 'confirmed' or \(\$\{table\.howToPay}/);

const claimAssets = read('src/db/schema/claim-assets.ts');
for (const field of ['assetId', 'networkId', 'paymentMethodId', 'contractAddress', 'isPrimary']) {
  assert.match(claimAssets, new RegExp(`${field}:`));
}
assert.match(claimAssets, /claim_assets_primary_per_claim_unique/);

const provenance = read('src/db/schema/source-provenance.ts');
assert.match(provenance, /'acceptance_claim'/);
assert.match(provenance, /'claim_asset'/);
assert.match(provenance, /'correction'/);
assert.match(provenance, /fieldPath: varchar\('field_path'/);

const problemApplicationFiles = [
  ...walk('src/admin/submissions'),
  ...walk('functions/admin/api'),
].filter((path) => /problem.*application|report-applications/.test(path));
const claimAssetSetOwner =
  'src/admin/submissions/drizzle-problem-claim-asset-replacement-application-backend.ts';
for (const path of problemApplicationFiles) {
  const source = read(path);
  if (path !== claimAssetSetOwner) {
    assert.doesNotMatch(
      source,
      /update\(claimAssets\)|delete\(claimAssets\)|insert\(claimAssets\)/,
      `${path} must not mutate Claim Assets outside the dedicated set owner.`,
    );
  }
  if (!path.endsWith('problem-location-correction-application.ts')) {
    assert.doesNotMatch(
      source,
      /latitude:|longitude:|countryCode:/,
      `${path} must not introduce Location identity mutation through an unrelated Problem application.`,
    );
  }
}

const claimAssetOwnerSource = read(claimAssetSetOwner);
assert.match(claimAssetOwnerSource, /pg_advisory_xact_lock/);
assert.match(claimAssetOwnerSource, /delete\(claimAssets\)/);
assert.match(claimAssetOwnerSource, /insert\(claimAssets\)/);
assert.doesNotMatch(claimAssetOwnerSource, /update\(claimAssets\)/);
assert.match(claimAssetOwnerSource, /problem_claim_assets_replaced/);

const audit = read('docs/P5_07D3_REMAINING_CORRECTION_OWNER_AUDIT.md');
assert.match(audit, /P5-07D4/);
assert.match(audit, /guarded Claim instruction correction transaction/);
assert.match(audit, /complete Claim Asset set/);
assert.match(audit, /never generic field mutation/);

const status = read('docs/PROJECT_STATUS.md');
assert.match(status, /P5-07D3/);
assert.match(status, /P5-07D4/);

console.log('P5-07D3 remaining correction owner audit passed.');
