from pathlib import Path


def replace_one(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# P6-014 runner imports production machine-file materializer.
replace_one(
    "scripts/run-ops-p6-014-production-candidate-bootstrap.mjs",
    "import { pathToFileURL } from 'node:url';\n",
    "import { pathToFileURL } from 'node:url';\n"
    "import {\n"
    "  canonicalOrigin,\n"
    "  materializeProductionMachineFiles,\n"
    "  validateProductionMachineFiles,\n"
    "} from './materialize-production-machine-files.mjs';\n",
)

replace_one(
    "scripts/run-ops-p6-014-production-candidate-bootstrap.mjs",
    "    identity = materializeMachineMetadata(root, commit);\n    digests.push(publicTreeDigest(root));",
    "    identity = materializeMachineMetadata(root, commit);\n"
    "    materializeProductionMachineFiles(root);\n"
    "    validateProductionMachineFiles(root);\n"
    "    digests.push(publicTreeDigest(root));",
)

replace_one(
    "scripts/run-ops-p6-014-production-candidate-bootstrap.mjs",
    "    ['/robots.txt', 200, 'text/plain'],\n    ['/admin/', 403, 'text/plain'],",
    "    ['/robots.txt', 200, 'text/plain'],\n"
    "    ['/llms.txt', 200, 'text/plain'],\n"
    "    ['/ai.txt', 200, 'text/plain'],\n"
    "    ['/sitemap.xml', 200, 'application/xml'],\n"
    "    ['/admin/', 403, 'text/plain'],",
)

replace_one(
    "scripts/run-ops-p6-014-production-candidate-bootstrap.mjs",
    "    if (path === '/admin/') {\n",
    "    const bodyText = new TextDecoder().decode(bytes);\n"
    "    if (path === '/robots.txt') {\n"
    "      if (\n"
    "        !bodyText.includes('Allow: /') ||\n"
    "        !bodyText.includes('Disallow: /admin/') ||\n"
    "        !bodyText.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`)\n"
    "      )\n"
    "        throw new Error('external_robots_contract_mismatch');\n"
    "    }\n"
    "    if (path === '/llms.txt') {\n"
    "      if (!bodyText.includes('# CryptoPayMap') || !bodyText.includes('/data/manifest.json'))\n"
    "        throw new Error('external_llms_contract_mismatch');\n"
    "    }\n"
    "    if (path === '/ai.txt') {\n"
    "      if (!bodyText.includes('Project: CryptoPayMap') || !bodyText.includes('reviewed public records only'))\n"
    "        throw new Error('external_ai_contract_mismatch');\n"
    "    }\n"
    "    if (path === '/sitemap.xml') {\n"
    "      if (\n"
    "        !bodyText.includes(`<loc>${canonicalOrigin}/</loc>`) ||\n"
    "        bodyText.includes('/admin/') ||\n"
    "        bodyText.includes('/404.html')\n"
    "      )\n"
    "        throw new Error('external_sitemap_contract_mismatch');\n"
    "    }\n"
    "    if (path === '/admin/') {\n",
)

replace_one(
    "scripts/run-ops-p6-014-production-candidate-bootstrap.mjs",
    "    const first = materializeMachineMetadata(dist, 'a'.repeat(40));\n    const digest = publicTreeDigest(dist);",
    "    const first = materializeMachineMetadata(dist, 'a'.repeat(40));\n"
    "    const machine = materializeProductionMachineFiles(dist);\n"
    "    const machineValidation = validateProductionMachineFiles(dist);\n"
    "    assert(machine.routeCount === 1, 'fixture sitemap must contain the public home route');\n"
    "    assert(machineValidation.sitemap === 'passed', 'fixture sitemap must validate');\n"
    "    const digest = publicTreeDigest(dist);",
)

# Contract checker knows about the dedicated materializer and public boundary doc.
replace_one(
    "scripts/check-ops-p6-014-production-candidate-bootstrap.mjs",
    "  doc: readFileSync(\n    'docs/OPS_P6_014_CONFIGURED_PRODUCTION_CANDIDATE_BOOTSTRAP.md',\n    'utf8',\n  ).toLowerCase(),\n};",
    "  doc: readFileSync(\n"
    "    'docs/OPS_P6_014_CONFIGURED_PRODUCTION_CANDIDATE_BOOTSTRAP.md',\n"
    "    'utf8',\n"
    "  ).toLowerCase(),\n"
    "  machine: readFileSync('scripts/materialize-production-machine-files.mjs', 'utf8').toLowerCase(),\n"
    "  machineDoc: readFileSync(\n"
    "    'docs/OPS_P6_021_PRODUCTION_MACHINE_READABLE_FILES.md',\n"
    "    'utf8',\n"
    "  ).toLowerCase(),\n"
    "};",
)

replace_one(
    "scripts/check-ops-p6-014-production-candidate-bootstrap.mjs",
    "console.log('OPS-P6-014 configured production candidate bootstrap contract passed.');",
    "expectIncludes('runner', files.runner, [\n"
    "  'materializeproductionmachinefiles',\n"
    "  \"['/llms.txt', 200, 'text/plain']\",\n"
    "  \"['/ai.txt', 200, 'text/plain']\",\n"
    "  \"['/sitemap.xml', 200, 'application/xml']\",\n"
    "  'external_robots_contract_mismatch',\n"
    "  'external_llms_contract_mismatch',\n"
    "  'external_ai_contract_mismatch',\n"
    "  'external_sitemap_contract_mismatch',\n"
    "]);\n"
    "expectIncludes('machine materializer', files.machine, [\n"
    "  'robots.txt',\n"
    "  'llms.txt',\n"
    "  'ai.txt',\n"
    "  'sitemap.xml',\n"
    "  'disallow: /admin/',\n"
    "  'reviewed public records only',\n"
    "  \"!route.startswith('/admin/')\",\n"
    "]);\n"
    "expectIncludes('machine documentation', files.machineDoc, [\n"
    "  'production machine-readable launch files',\n"
    "  '`/robots.txt`',\n"
    "  '`/llms.txt`',\n"
    "  '`/ai.txt`',\n"
    "  '`/sitemap.xml`',\n"
    "  'staging:review:build',\n"
    "  'global `disallow: /`',\n"
    "  'candidate records',\n"
    "]);\n\n"
    "console.log('OPS-P6-014 configured production candidate bootstrap contract passed.');",
)

# Workflow path filters and contract/preflight self-test.
replace_one(
    ".github/workflows/ops-p6-014-configured-production-candidate-bootstrap.yml",
    "      - 'scripts/run-ops-p6-014-production-candidate-bootstrap.mjs'\n",
    "      - 'scripts/run-ops-p6-014-production-candidate-bootstrap.mjs'\n"
    "      - 'scripts/materialize-production-machine-files.mjs'\n"
    "      - 'docs/OPS_P6_021_PRODUCTION_MACHINE_READABLE_FILES.md'\n",
)

replace_one(
    ".github/workflows/ops-p6-014-configured-production-candidate-bootstrap.yml",
    "      - name: Run production candidate bootstrap self-test\n        run: node scripts/run-ops-p6-014-production-candidate-bootstrap.mjs --self-test\n",
    "      - name: Run production candidate bootstrap self-test\n"
    "        run: node scripts/run-ops-p6-014-production-candidate-bootstrap.mjs --self-test\n\n"
    "      - name: Run production machine-readable files self-test\n"
    "        run: node scripts/materialize-production-machine-files.mjs --self-test\n",
)

replace_one(
    ".github/workflows/ops-p6-014-configured-production-candidate-bootstrap.yml",
    "          node scripts/run-ops-p6-014-production-candidate-bootstrap.mjs --self-test\n\n      - name: Inspect protected production environment before mutation",
    "          node scripts/run-ops-p6-014-production-candidate-bootstrap.mjs --self-test\n"
    "          node scripts/materialize-production-machine-files.mjs --self-test\n\n"
    "      - name: Inspect protected production environment before mutation",
)
