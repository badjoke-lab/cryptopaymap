from pathlib import Path

# Pre-apply P6-014 candidate-runner changes using the actual formatted source.
runner = Path('scripts/run-ops-p6-014-production-candidate-bootstrap.mjs')
text = runner.read_text()
old_routes = """  const routes = [
    ['/', 200, 'text/html'],
    ['/version.json', 200, 'application/json'],
    ['/data/manifest.json', 200, 'application/json'],
    ['/robots.txt', 200, 'text/plain'],
  ];"""
new_routes = """  const routes = [
    ['/', 200, 'text/html'],
    ['/version.json', 200, 'application/json'],
    ['/data/manifest.json', 200, 'application/json'],
    ['/robots.txt', 200, 'text/plain'],
    ['/admin/', 403, 'text/plain'],
  ];"""
if old_routes not in text:
    raise SystemExit('candidate routes anchor missing')
text = text.replace(old_routes, new_routes, 1)

old_observation = """    if (contentType !== expectedType) throw new Error(`external_type:${path}:${contentType}`);
    observations.push({
      path,
      status: response.status,
      contentType,
      bodyDigest: boundedHash(bytes),
    });"""
new_observation = """    if (contentType !== expectedType) throw new Error(`external_type:${path}:${contentType}`);
    if (path === '/admin/') {
      const cacheControl = response.headers.get('cache-control') ?? '';
      const robots = response.headers.get('x-robots-tag') ?? '';
      const contentOptions = response.headers.get('x-content-type-options') ?? '';
      if (cacheControl !== 'private, no-store') throw new Error('admin_access_cache_policy_missing');
      if (robots !== 'noindex, nofollow, noarchive') throw new Error('admin_access_robots_policy_missing');
      if (contentOptions !== 'nosniff') throw new Error('admin_access_content_policy_missing');
    }
    observations.push({
      path,
      status: response.status,
      contentType,
      bodyDigest: boundedHash(bytes),
    });"""
if old_observation not in text:
    raise SystemExit('candidate observation anchor missing')
text = text.replace(old_observation, new_observation, 1)
runner.write_text(text)

# Pre-apply P6-013 readiness-runner changes using stable structural anchors.
runner = Path('scripts/run-ops-p6-013-production-readiness-diagnostic.mjs')
text = runner.read_text()
old_secrets = """  'P6_08_PRODUCTION_TURNSTILE_SECRET_KEY',
  'P6_08_PRODUCTION_TURNSTILE_SITE_KEY',
];"""
new_secrets = """  'P6_08_PRODUCTION_TURNSTILE_SECRET_KEY',
  'P6_08_PRODUCTION_TURNSTILE_SITE_KEY',
  'P6_08_PRODUCTION_CF_ACCESS_TEAM_DOMAIN',
  'P6_08_PRODUCTION_CF_ACCESS_AUD',
];"""
if old_secrets not in text:
    raise SystemExit('readiness secrets anchor missing')
text = text.replace(old_secrets, new_secrets, 1)

marker_anchor = """  const markerMatches =
    markerStatus === 200 && validDigest(markerReleaseId) && markerReleaseId === expectedReleaseId;

  return {"""
marker_replacement = """  const markerMatches =
    markerStatus === 200 && validDigest(markerReleaseId) && markerReleaseId === expectedReleaseId;

  let adminAccess = {
    status: 0,
    cacheControl: null,
    robots: null,
    contentOptions: null,
    enforced: false,
  };
  try {
    const response = await fetchImpl(`https://${productionProject}.pages.dev/admin/`, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    const cacheControl = response.headers.get('cache-control');
    const robots = response.headers.get('x-robots-tag');
    const contentOptions = response.headers.get('x-content-type-options');
    adminAccess = {
      status: response.status,
      cacheControl,
      robots,
      contentOptions,
      enforced:
        response.status === 403 &&
        cacheControl === 'private, no-store' &&
        robots === 'noindex, nofollow, noarchive' &&
        contentOptions === 'nosniff',
    };
  } catch {}

  return {"""
if marker_anchor not in text:
    raise SystemExit('readiness marker/admin anchor missing')
text = text.replace(marker_anchor, marker_replacement, 1)

external_anchor = """    intendedDeployment: {
      baseUrl: `https://${productionProject}.pages.dev`,
      markerStatus,
      markerMatches,
      expectedReleaseDigest: digest(expectedReleaseId),
      observedReleaseDigest: validDigest(markerReleaseId) ? digest(markerReleaseId) : null,
    },
  };"""
external_replacement = """    intendedDeployment: {
      baseUrl: `https://${productionProject}.pages.dev`,
      markerStatus,
      markerMatches,
      expectedReleaseDigest: digest(expectedReleaseId),
      observedReleaseDigest: validDigest(markerReleaseId) ? digest(markerReleaseId) : null,
    },
    adminAccess,
  };"""
if external_anchor not in text:
    raise SystemExit('readiness external return anchor missing')
text = text.replace(external_anchor, external_replacement, 1)

blocker_anchor = """  if (external?.intendedDeployment?.markerMatches !== true)
    blockers.push('intended_release:not_observed');

  const uniqueBlockers"""
blocker_replacement = """  if (external?.intendedDeployment?.markerMatches !== true)
    blockers.push('intended_release:not_observed');
  if (external?.adminAccess?.enforced !== true) blockers.push('admin_access:not_enforced');

  const uniqueBlockers"""
if blocker_anchor not in text:
    raise SystemExit('readiness blocker anchor missing')
text = text.replace(blocker_anchor, blocker_replacement, 1)

fixture_anchor = """    intendedDeployment: {
      baseUrl: `https://${productionProject}.pages.dev`,
      markerStatus: 200,
      markerMatches: true,
      expectedReleaseDigest: digest(releaseId),
      observedReleaseDigest: digest(releaseId),
    },
  };"""
fixture_replacement = """    intendedDeployment: {
      baseUrl: `https://${productionProject}.pages.dev`,
      markerStatus: 200,
      markerMatches: true,
      expectedReleaseDigest: digest(releaseId),
      observedReleaseDigest: digest(releaseId),
    },
    adminAccess: {
      status: 403,
      cacheControl: 'private, no-store',
      robots: 'noindex, nofollow, noarchive',
      contentOptions: 'nosniff',
      enforced: true,
    },
  };"""
if fixture_anchor not in text:
    raise SystemExit('readiness fixture anchor missing')
text = text.replace(fixture_anchor, fixture_replacement, 1)

self_test_anchor = """    const wrongRelease = structuredClone(base.externalOverride);
    wrongRelease.intendedDeployment.markerMatches = false;"""
self_test_replacement = """    const adminUnavailable = structuredClone(base.externalOverride);
    adminUnavailable.adminAccess = {
      status: 503,
      cacheControl: 'private, no-store',
      robots: 'noindex, nofollow, noarchive',
      contentOptions: 'nosniff',
      enforced: false,
    };
    receipt = await executeProductionReadiness({ ...base, externalOverride: adminUnavailable });
    assert(
      receipt.blockers.includes('admin_access:not_enforced'),
      'Admin 503 must block production readiness',
    );

    const wrongRelease = structuredClone(base.externalOverride);
    wrongRelease.intendedDeployment.markerMatches = false;"""
if self_test_anchor not in text:
    raise SystemExit('readiness self-test anchor missing')
text = text.replace(self_test_anchor, self_test_replacement, 1)
runner.write_text(text)

# Remove runner sections from the generic patch; they are now pre-applied safely.
patch = Path('tmp-ops-p6-018-patch.py')
patch_text = patch.read_text()
for start_marker, end_marker, replacement in [
    ('# P6-014 candidate runner', '# P6-014 checker', '# P6-014 candidate runner pre-applied by anchor fixer\n\n'),
    ('# P6-013 readiness runner', '# P6-013 checker', '# P6-013 readiness runner pre-applied by anchor fixer\n\n'),
]:
    if start_marker in patch_text:
        start = patch_text.index(start_marker)
        end = patch_text.index(end_marker)
        patch_text = patch_text[:start] + replacement + patch_text[end:]
patch.write_text(patch_text)
