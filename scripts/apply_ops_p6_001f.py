from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding='utf-8')
    if old not in content:
        raise RuntimeError(f'Expected text not found in {path}')
    target.write_text(content.replace(old, new, 1), encoding='utf-8')


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Expected regex match not found in {path}: {pattern[:80]}')
    target.write_text(updated, encoding='utf-8')


replace_exact(
    '.github/workflows/staging-review-deploy.yml',
    """            PUBLIC_TURNSTILE_ACTION: 'submission_intake',
          };
""",
    """            PUBLIC_TURNSTILE_ACTION: 'submission_intake',
            CPM_ADMIN_AUTH_MODE: 'derived_staging_service',
            CPM_ADMIN_SERVICE_MAX_CLOCK_SKEW_SECONDS: '90',
            CPM_ADMIN_DASHBOARD_SUBJECTS: '[\"staging-service:reviewer\"]',
            CPM_ADMIN_EXPORT_PUBLISH_ACTOR_IDS:
              '[\"cryptopaymap-service:staging-service:publisher\"]',
          };
""",
)
replace_exact(
    '.github/workflows/staging-review-deploy.yml',
    """              rateLimit: { maximumRequests: 5, windowSeconds: 600 },
""",
    """              rateLimit: { maximumRequests: 5, windowSeconds: 600 },
              adminAuthMode: 'derived_staging_service',
              adminServiceRoles: ['reviewer', 'publisher'],
""",
)

workflow = '.github/workflows/ops-p6-001e-configured-staging-p6-02-identity-admin.yml'
replace_exact(
    workflow,
    """      - 'tests/admin-access-verification.test.ts'
""",
    """      - 'tests/admin-access-verification.test.ts'
      - 'tests/admin-derived-service-auth.test.ts'
""",
)
replace_exact(
    workflow,
    """      - 'tests/admin-access-verification.test.ts'
  workflow_dispatch:
""",
    """      - 'tests/admin-access-verification.test.ts'
      - 'tests/admin-derived-service-auth.test.ts'
  workflow_dispatch:
""",
)
replace_exact(
    workflow,
    """      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID: ${{ secrets.CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID }}
      CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET: ${{ secrets.CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET }}
      CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID: ${{ secrets.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID }}
      CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET: ${{ secrets.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET }}
""",
    """      CPM_REVIEW_SECRET_SEED_BASE64URL: ${{ secrets.CPM_REVIEW_SECRET_SEED_BASE64URL }}
""",
)
replace_exact(
    workflow,
    """        run: npx vitest run tests/admin-access-identity.test.ts tests/admin-access-verification.test.ts
""",
    """        run: npx vitest run tests/admin-access-identity.test.ts tests/admin-access-verification.test.ts tests/admin-derived-service-auth.test.ts
""",
)
replace_exact(
    workflow,
    """          npx vitest run tests/admin-access-identity.test.ts tests/admin-access-verification.test.ts
""",
    """          npx vitest run tests/admin-access-identity.test.ts tests/admin-access-verification.test.ts tests/admin-derived-service-auth.test.ts
""",
)
replace_exact(
    workflow,
    """      - name: Write bounded configured P6-02 receipt
""",
    """      - name: Derive bounded staging Admin service credentials
        working-directory: source
        run: |
          set -euo pipefail
          trap 'rm -f ../p6-02-derived-secrets.json' EXIT
          node scripts/derive-suggest-review-secrets.mjs ../p6-02-derived-secrets.json
          node <<'NODE'
          const { appendFileSync, readFileSync } = require('node:fs');
          const values = JSON.parse(readFileSync('../p6-02-derived-secrets.json', 'utf8'));
          const keys = [
            'CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL',
            'CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL',
          ];
          for (const key of keys) {
            const value = values[key];
            if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} missing`);
            console.log(`::add-mask::${value}`);
            appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
          }
          NODE

      - name: Write bounded configured P6-02 receipt
""",
)

script = 'scripts/run-ops-p6-001e-configured-staging-identity-admin.ts'
replace_exact(script, "import { createHash } from 'node:crypto';", "import { createHash, createHmac } from 'node:crypto';")
replace_exact(script, "  'cf_authorization',\n", "  'cf_authorization',\n  'x-cpm-admin-signature',\n")
replace_regex(
    script,
    r"async function cloudflareApi\(token, accountId, path\) \{.*?\n\}\n\nfunction safeLocationClass",
    """function inspectControlPlane(credentials) {
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return {
      status: 'failed',
      mode: 'derived_staging_service',
      externalControlPlaneRequired: false,
      error: 'missing_derived_service_credentials',
      missing,
    };
  }
  return {
    status: 'passed',
    mode: 'derived_staging_service',
    externalControlPlaneRequired: false,
    credentialSource: 'existing_review_seed_hkdf',
    roleCount: 2,
    roleDigest: boundedHash(['reviewer', 'publisher']),
  };
}

function safeLocationClass""",
)
replace_regex(
    script,
    r"function serviceHeaders\(clientId, clientSecret, extra = \{\}\) \{.*?\n\}\n\nexport async function evaluateConfiguredStagingIdentityAdmin",
    """function serviceHeaders(role, keyBase64Url, path, method, extra = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = [
    'cryptopaymap-staging-admin-v1',
    role,
    timestamp,
    method,
    path,
  ].join('\\n');
  const signature = createHmac('sha256', Buffer.from(keyBase64Url, 'base64url'))
    .update(message)
    .digest('base64url');
  return {
    'X-CPM-Admin-Role': role,
    'X-CPM-Admin-Timestamp': timestamp,
    'X-CPM-Admin-Signature': signature,
    ...extra,
  };
}

async function inspectPositiveJourneys(baseUrl, credentials) {
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return { status: 'failed', error: 'missing_service_identity_credentials', missing };
  }
  const dashboardPath = '/admin/api/dashboard';
  const publicationPath = '/admin/api/export-activate';
  const reviewerDashboard = await requestSummary(
    baseUrl,
    dashboardPath,
    'GET',
    serviceHeaders('reviewer', credentials.reviewerKeyBase64Url, dashboardPath, 'GET'),
  );
  const reviewerPublication = await requestSummary(
    baseUrl,
    publicationPath,
    'POST',
    serviceHeaders('reviewer', credentials.reviewerKeyBase64Url, publicationPath, 'POST', {
      'Content-Type': 'application/json',
      'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
    }),
  );
  const publisherDashboard = await requestSummary(
    baseUrl,
    dashboardPath,
    'GET',
    serviceHeaders('publisher', credentials.publisherKeyBase64Url, dashboardPath, 'GET'),
  );
  const publisherPublication = await requestSummary(
    baseUrl,
    publicationPath,
    'POST',
    serviceHeaders('publisher', credentials.publisherKeyBase64Url, publicationPath, 'POST', {
      'Content-Type': 'application/json',
      'Idempotency-Key': '22222222-2222-4222-8222-222222222222',
    }),
  );
  const passed =
    reviewerDashboard.status === 200 &&
    reviewerDashboard.cacheControlSafe &&
    reviewerDashboard.noPrivateLeakage &&
    reviewerPublication.status === 403 &&
    reviewerPublication.cacheControlSafe &&
    publisherDashboard.status === 403 &&
    publisherDashboard.cacheControlSafe &&
    publisherPublication.status === 400 &&
    publisherPublication.cacheControlSafe &&
    publisherPublication.noPrivateLeakage;
  return {
    status: passed ? 'passed' : 'failed',
    reviewerDashboard,
    reviewerPublication,
    publisherDashboard,
    publisherPublication,
    identityDigests: {
      reviewer: boundedHash('staging-service:reviewer'),
      publisher: boundedHash('staging-service:publisher'),
    },
  };
}

export async function evaluateConfiguredStagingIdentityAdmin""",
)
replace_exact(
    script,
    """  const controlPlane = await inspectControlPlane(
    input.cloudflareApiToken,
    input.cloudflareAccountId,
  );
""",
    """  const controlPlane = inspectControlPlane(input.credentials);
""",
)
replace_exact(script, "    const clientId = headers.get('CF-Access-Client-Id');\n", "    const role = headers.get('X-CPM-Admin-Role');\n")
replace_exact(script, "    if (!clientId || headers.has('Cf-Access-Authenticated-User-Email')) {\n", "    if (!role || headers.has('Cf-Access-Authenticated-User-Email')) {\n")
replace_exact(script, "if (clientId === 'reviewer-client') {", "if (role === 'reviewer') {")
replace_exact(script, "if (clientId === 'publisher-client') {", "if (role === 'publisher') {")
replace_exact(
    script,
    """      cloudflareApiToken: 'token',
      cloudflareAccountId: 'account',
      credentials: {
        reviewerClientId: 'reviewer-client',
        reviewerClientSecret: 'reviewer-secret',
        publisherClientId: 'publisher-client',
        publisherClientSecret: 'publisher-secret',
      },
""",
    """      credentials: {
        reviewerKeyBase64Url: Buffer.alloc(32, 17).toString('base64url'),
        publisherKeyBase64Url: Buffer.alloc(32, 23).toString('base64url'),
      },
""",
)
replace_exact(
    script,
    """      cloudflareApiToken: '',
      cloudflareAccountId: '',
      credentials: {
        reviewerClientId: '',
        reviewerClientSecret: '',
        publisherClientId: '',
        publisherClientSecret: '',
      },
""",
    """      credentials: {
        reviewerKeyBase64Url: '',
        publisherKeyBase64Url: '',
      },
""",
)
replace_exact(
    script,
    """    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
    credentials: {
      reviewerClientId: process.env.CPM_STAGING_ACCESS_REVIEWER_CLIENT_ID ?? '',
      reviewerClientSecret: process.env.CPM_STAGING_ACCESS_REVIEWER_CLIENT_SECRET ?? '',
      publisherClientId: process.env.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_ID ?? '',
      publisherClientSecret: process.env.CPM_STAGING_ACCESS_PUBLISHER_CLIENT_SECRET ?? '',
    },
""",
    """    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
    credentials: {
      reviewerKeyBase64Url: process.env.CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL ?? '',
      publisherKeyBase64Url: process.env.CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL ?? '',
    },
""",
)

section = """

## Configured staging derived service authentication

Configured staging uses `CPM_ADMIN_AUTH_MODE=derived_staging_service`. Reviewer and publisher
HMAC keys are derived from the existing review seed with separate HKDF labels and synchronized
only to the Pages preview environment. Each request carries a role, timestamp, and HMAC signature;
the signature is verified with WebCrypto inside a bounded clock window. Unverified email headers,
missing signatures, stale signatures, and cross-role signatures fail closed. Production and the
default mode remain Cloudflare Access with issuer, audience, and signature validation. No raw key
or request signature may be retained in logs, receipts, artifacts, or repository files.
"""
for path in [
    'docs/ADMIN_ACCESS_CONFIGURATION.md',
    'docs/OPS_P6_001E_CONFIGURED_STAGING_P6_02_IDENTITY_ADMIN.md',
    'docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md',
]:
    target = ROOT / path
    content = target.read_text(encoding='utf-8')
    if '## Configured staging derived service authentication' not in content:
        target.write_text(content + section, encoding='utf-8')

status_path = ROOT / 'docs/PROJECT_STATUS.md'
status = status_path.read_text(encoding='utf-8')
marker = 'OPS-P6-001F is implementing a staging-only derived service authentication boundary'
if marker not in status:
    status_path.write_text(
        marker + ' while retaining Cloudflare Access as the production/default mode. No production, DNS, canonical data, or public release activation is changed.\n\n' + status,
        encoding='utf-8',
    )

print('OPS-P6-001F remaining integration migration applied.')
