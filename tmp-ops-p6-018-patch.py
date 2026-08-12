from pathlib import Path

# P6-014 candidate runner
path = Path('scripts/run-ops-p6-014-production-candidate-bootstrap.mjs')
text = path.read_text()
old = "  const routes = [\n    ['/', 200, 'text/html'],\n    ['/version.json', 200, 'application/json'],\n    ['/data/manifest.json', 200, 'application/json'],\n    ['/robots.txt', 200, 'text/plain'],\n  ];"
new = "  const routes = [\n    ['/', 200, 'text/html'],\n    ['/version.json', 200, 'application/json'],\n    ['/data/manifest.json', 200, 'application/json'],\n    ['/robots.txt', 200, 'text/plain'],\n    ['/admin/', 403, 'text/plain'],\n  ];"
if old not in text: raise SystemExit('p6-014 route anchor missing')
text = text.replace(old, new, 1)
old = "    if (contentType !== expectedType) throw new Error(`external_type:${path}:${contentType}`);\n    observations.push({ path, status: response.status, contentType, bodyDigest: boundedHash(bytes) });"
new = "    if (contentType !== expectedType) throw new Error(`external_type:${path}:${contentType}`);\n    if (path === '/admin/') {\n      const cacheControl = response.headers.get('cache-control') ?? '';\n      const robots = response.headers.get('x-robots-tag') ?? '';\n      const contentOptions = response.headers.get('x-content-type-options') ?? '';\n      if (cacheControl !== 'private, no-store') throw new Error('admin_access_cache_policy_missing');\n      if (robots !== 'noindex, nofollow, noarchive') throw new Error('admin_access_robots_policy_missing');\n      if (contentOptions !== 'nosniff') throw new Error('admin_access_content_policy_missing');\n    }\n    observations.push({ path, status: response.status, contentType, bodyDigest: boundedHash(bytes) });"
if old not in text: raise SystemExit('p6-014 admin header anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-014 checker
path = Path('scripts/check-ops-p6-014-production-candidate-bootstrap.mjs')
text = path.read_text()
old = "  'canonicalhostmutation: false',\n  \"method: 'get'\","
new = "  'canonicalhostmutation: false',\n  \"['/admin/', 403, 'text/plain']\",\n  'admin_access_cache_policy_missing',\n  \"method: 'get'\","
if old not in text: raise SystemExit('p6-014 checker runner anchor missing')
text = text.replace(old, new, 1)
old = "  'p6_08_production_turnstile_site_key',\n  'config/production-authorization/production-candidate-bootstrap-receipt.json',"
new = "  'p6_08_production_turnstile_site_key',\n  'p6_08_production_cf_access_team_domain',\n  'p6_08_production_cf_access_aud',\n  'cpm_admin_auth_mode',\n  'cloudflare_access',\n  'cf_access_team_domain',\n  'cf_access_aud',\n  'config/production-authorization/production-candidate-bootstrap-receipt.json',"
if old not in text: raise SystemExit('p6-014 checker workflow anchor missing')
text = text.replace(old, new, 1)
old = "  'synthetic staging review data is not materialized',\n]);"
new = "  'synthetic staging review data is not materialized',\n  'cloudflare access',\n  'unauthenticated',\n  '`/admin/`',\n  '403',\n]);"
if old not in text: raise SystemExit('p6-014 checker doc anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-014 workflow
path = Path('.github/workflows/ops-p6-014-configured-production-candidate-bootstrap.yml')
text = path.read_text()
old = "      P6_08_PRODUCTION_TURNSTILE_SITE_KEY: ${{ secrets.P6_08_PRODUCTION_TURNSTILE_SITE_KEY }}\n    steps:"
new = "      P6_08_PRODUCTION_TURNSTILE_SITE_KEY: ${{ secrets.P6_08_PRODUCTION_TURNSTILE_SITE_KEY }}\n      P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN: ${{ secrets.P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN }}\n      P6_08_PRODUCTION_CF_ACCESS_AUD: ${{ secrets.P6_08_PRODUCTION_CF_ACCESS_AUD }}\n    steps:"
if old not in text: raise SystemExit('p6-014 workflow env anchor missing')
text = text.replace(old, new, 1)
old = "            P6_08_PRODUCTION_TURNSTILE_SECRET_KEY\n            P6_08_PRODUCTION_TURNSTILE_SITE_KEY\n          )"
new = "            P6_08_PRODUCTION_TURNSTILE_SECRET_KEY\n            P6_08_PRODUCTION_TURNSTILE_SITE_KEY\n            P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN\n            P6_08_PRODUCTION_CF_ACCESS_AUD\n          )"
if old not in text: raise SystemExit('p6-014 workflow required anchor missing')
text = text.replace(old, new, 1)
old = "          const values = {\n            DATABASE_URL: process.env.P6_08_PRODUCTION_DATABASE_URL,\n            CPM_REVIEW_SECRET_SEED_BASE64URL: process.env.P6_08_PRODUCTION_REVIEW_SECRET_SEED_BASE64URL,\n            ...derived,"
new = "          const {\n            CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL: _reviewerKey,\n            CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL: _publisherKey,\n            ...productionDerived\n          } = derived;\n          const values = {\n            DATABASE_URL: process.env.P6_08_PRODUCTION_DATABASE_URL,\n            CPM_REVIEW_SECRET_SEED_BASE64URL: process.env.P6_08_PRODUCTION_REVIEW_SECRET_SEED_BASE64URL,\n            ...productionDerived,"
if old not in text: raise SystemExit('p6-014 workflow derived anchor missing')
text = text.replace(old, new, 1)
old = "            PUBLIC_TURNSTILE_ACTION: 'submission_intake',\n          };"
new = "            PUBLIC_TURNSTILE_ACTION: 'submission_intake',\n            CPM_ADMIN_AUTH_MODE: 'cloudflare_access',\n            CF_ACCESS_TEAM_DOMAIN: process.env.P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN,\n            CF_ACCESS_AUD: process.env.P6_08_PRODUCTION_CF_ACCESS_AUD,\n          };"
if old not in text: raise SystemExit('p6-014 workflow access values anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-014 doc
path = Path('docs/OPS_P6_014_CONFIGURED_PRODUCTION_CANDIDATE_BOOTSTRAP.md')
text = path.read_text()
old = "- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;\n- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`."
new = "- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;\n- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`;\n- `P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN`;\n- `P6_08_PRODUCTION_CF_ACCESS_AUD`."
if old not in text: raise SystemExit('p6-014 doc inputs anchor missing')
text = text.replace(old, new, 1)
old = "Staging/test Turnstile keys or staging-derived identities are not treated as production readiness."
if old in text:
    text = text.replace(old, old + "\n\nProduction Admin uses `CPM_ADMIN_AUTH_MODE=cloudflare_access` with the protected Cloudflare Access team domain and audience. Staging-derived Admin HMAC keys are deliberately not installed as production Admin credentials.", 1)
else:
    # P6-014 wording differs; insert after raw-values paragraph.
    anchor = "Raw values are never written to the repository, retained receipt, summary, or artifact."
    if anchor not in text: raise SystemExit('p6-014 doc access insertion anchor missing')
    text = text.replace(anchor, anchor + "\n\nProduction Admin uses `CPM_ADMIN_AUTH_MODE=cloudflare_access` with the protected Cloudflare Access team domain and audience. Staging-derived Admin HMAC keys are deliberately not installed as production Admin credentials.", 1)
old = "- safe Pages topology with no custom domains."
new = "- safe Pages topology with no custom domains;\n- unauthenticated `/admin/` returns exactly 403, not 200/redirect/503, with `private, no-store`, `noindex, nofollow, noarchive`, and `nosniff` security headers."
if old not in text: raise SystemExit('p6-014 doc verification anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-013 readiness runner
path = Path('scripts/run-ops-p6-013-production-readiness-diagnostic.mjs')
text = path.read_text()
old = "  'P6_08_PRODUCTION_TURNSTILE_SECRET_KEY',\n  'P6_08_PRODUCTION_TURNSTILE_SITE_KEY',\n];"
new = "  'P6_08_PRODUCTION_TURNSTILE_SECRET_KEY',\n  'P6_08_PRODUCTION_TURNSTILE_SITE_KEY',\n  'P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN',\n  'P6_08_PRODUCTION_CF_ACCESS_AUD',\n];"
if old not in text: raise SystemExit('p6-013 secrets anchor missing')
text = text.replace(old, new, 1)
old = "  const markerMatches =\n    markerStatus === 200 && validDigest(markerReleaseId) && markerReleaseId === expectedReleaseId;\n\n  return {"
new = "  const markerMatches =\n    markerStatus === 200 && validDigest(markerReleaseId) && markerReleaseId === expectedReleaseId;\n\n  let adminAccess = { status: 0, cacheControl: null, robots: null, contentOptions: null, enforced: false };\n  try {\n    const response = await fetchImpl(`https://${productionProject}.pages.dev/admin/`, {\n      cache: 'no-store',\n      redirect: 'manual',\n      signal: AbortSignal.timeout(20_000),\n    });\n    const cacheControl = response.headers.get('cache-control');\n    const robots = response.headers.get('x-robots-tag');\n    const contentOptions = response.headers.get('x-content-type-options');\n    adminAccess = {\n      status: response.status,\n      cacheControl,\n      robots,\n      contentOptions,\n      enforced:\n        response.status === 403 &&\n        cacheControl === 'private, no-store' &&\n        robots === 'noindex, nofollow, noarchive' &&\n        contentOptions === 'nosniff',\n    };\n  } catch {}\n\n  return {"
if old not in text: raise SystemExit('p6-013 admin collect anchor missing')
text = text.replace(old, new, 1)
old = "    intendedDeployment: {\n      baseUrl: `https://${productionProject}.pages.dev`,\n      markerStatus,\n      markerMatches,\n      expectedReleaseDigest: digest(expectedReleaseId),\n      observedReleaseDigest: validDigest(markerReleaseId) ? digest(markerReleaseId) : null,\n    },\n  };"
new = "    intendedDeployment: {\n      baseUrl: `https://${productionProject}.pages.dev`,\n      markerStatus,\n      markerMatches,\n      expectedReleaseDigest: digest(expectedReleaseId),\n      observedReleaseDigest: validDigest(markerReleaseId) ? digest(markerReleaseId) : null,\n    },\n    adminAccess,\n  };"
if old not in text: raise SystemExit('p6-013 external return anchor missing')
text = text.replace(old, new, 1)
old = "  if (external?.intendedDeployment?.markerMatches !== true) blockers.push('intended_release:not_observed');\n\n  const uniqueBlockers"
new = "  if (external?.intendedDeployment?.markerMatches !== true) blockers.push('intended_release:not_observed');\n  if (external?.adminAccess?.enforced !== true) blockers.push('admin_access:not_enforced');\n\n  const uniqueBlockers"
if old not in text: raise SystemExit('p6-013 blocker anchor missing')
text = text.replace(old, new, 1)
old = "    intendedDeployment: {\n      baseUrl: `https://${productionProject}.pages.dev`,\n      markerStatus: 200,\n      markerMatches: true,\n      expectedReleaseDigest: digest(releaseId),\n      observedReleaseDigest: digest(releaseId),\n    },\n  };"
new = "    intendedDeployment: {\n      baseUrl: `https://${productionProject}.pages.dev`,\n      markerStatus: 200,\n      markerMatches: true,\n      expectedReleaseDigest: digest(releaseId),\n      observedReleaseDigest: digest(releaseId),\n    },\n    adminAccess: {\n      status: 403,\n      cacheControl: 'private, no-store',\n      robots: 'noindex, nofollow, noarchive',\n      contentOptions: 'nosniff',\n      enforced: true,\n    },\n  };"
if old not in text: raise SystemExit('p6-013 fixture external anchor missing')
text = text.replace(old, new, 1)
old = "    const wrongRelease = structuredClone(base.externalOverride);\n    wrongRelease.intendedDeployment.markerMatches = false;"
new = "    const adminUnavailable = structuredClone(base.externalOverride);\n    adminUnavailable.adminAccess = { status: 503, cacheControl: 'private, no-store', robots: 'noindex, nofollow, noarchive', contentOptions: 'nosniff', enforced: false };\n    receipt = await executeProductionReadiness({ ...base, externalOverride: adminUnavailable });\n    assert(receipt.blockers.includes('admin_access:not_enforced'), 'Admin 503 must block production readiness');\n\n    const wrongRelease = structuredClone(base.externalOverride);\n    wrongRelease.intendedDeployment.markerMatches = false;"
if old not in text: raise SystemExit('p6-013 self-test anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-013 checker
path = Path('scripts/check-ops-p6-013-production-readiness-diagnostic.mjs')
text = path.read_text()
old = "  'p6_08_production_turnstile_site_key',\n  'pages_project:missing_or_inaccessible',"
new = "  'p6_08_production_turnstile_site_key',\n  'p6_08_production_cf_access_team_domain',\n  'p6_08_production_cf_access_aud',\n  'admin_access:not_enforced',\n  '/admin/',\n  'pages_project:missing_or_inaccessible',"
if old not in text: raise SystemExit('p6-013 checker runner anchor missing')
text = text.replace(old, new, 1)
old = "  'production-specific runtime inputs',\n  'does not create the production pages project',"
new = "  'production-specific runtime inputs',\n  'cloudflare access',\n  'unauthenticated',\n  '`/admin/`',\n  '403',\n  'does not create the production pages project',"
if old not in text: raise SystemExit('p6-013 checker doc anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-013 workflow
path = Path('.github/workflows/ops-p6-013-configured-production-readiness-diagnostic.yml')
text = path.read_text()
old = "      P6_08_PRODUCTION_TURNSTILE_SITE_KEY: ${{ secrets.P6_08_PRODUCTION_TURNSTILE_SITE_KEY }}\n    steps:"
new = "      P6_08_PRODUCTION_TURNSTILE_SITE_KEY: ${{ secrets.P6_08_PRODUCTION_TURNSTILE_SITE_KEY }}\n      P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN: ${{ secrets.P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN }}\n      P6_08_PRODUCTION_CF_ACCESS_AUD: ${{ secrets.P6_08_PRODUCTION_CF_ACCESS_AUD }}\n    steps:"
if old not in text: raise SystemExit('p6-013 workflow env anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

# P6-013 doc
path = Path('docs/OPS_P6_013_CONFIGURED_PRODUCTION_READINESS_DIAGNOSTIC.md')
text = path.read_text()
old = "- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;\n- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`."
new = "- `P6_08_PRODUCTION_TURNSTILE_SECRET_KEY`;\n- `P6_08_PRODUCTION_TURNSTILE_SITE_KEY`;\n- `P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN`;\n- `P6_08_PRODUCTION_CF_ACCESS_AUD`."
if old not in text: raise SystemExit('p6-013 doc inputs anchor missing')
text = text.replace(old, new, 1)
anchor = "Staging/test Turnstile keys or staging-derived identities are not treated as production readiness."
if anchor not in text: raise SystemExit('p6-013 doc access anchor missing')
text = text.replace(anchor, anchor + "\n\nProduction Admin must be configured in `cloudflare_access` mode with the protected Cloudflare Access team domain and audience. Readiness performs an unauthenticated request to `/admin/` and requires exactly 403 with private/no-store/noindex/nosniff security headers. A 503 configuration-unavailable response is not launch-ready.", 1)
old = "- candidate Pages release marker missing or not matching the P6-05 candidate release."
new = "- candidate Pages release marker missing or not matching the P6-05 candidate release;\n- production Admin `/admin/` not enforcing unauthenticated 403 with the required security headers."
if old not in text: raise SystemExit('p6-013 doc decision anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)
