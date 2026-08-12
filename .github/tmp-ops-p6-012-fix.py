from pathlib import Path

p = Path('scripts/evaluate-ops-p6-012-production-authorization.mjs')
s = p.read_text()
s = s.replace(
    "import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';",
    "import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';",
    1,
)
s = s.replace("  const { mkdirSync } = await import('node:fs');\n", "", 1)
p.write_text(s)
