from pathlib import Path

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

patch = Path('tmp-ops-p6-018-patch.py')
patch_text = patch.read_text()
start = patch_text.index('# P6-014 candidate runner')
end = patch_text.index('# P6-014 checker')
patch.write_text(patch_text[:start] + '# P6-014 candidate runner pre-applied by anchor fixer\n\n' + patch_text[end:])
