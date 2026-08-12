from pathlib import Path
p = Path('scripts/evaluate-ops-p6-012-production-authorization.mjs')
s = p.read_text()
old = """function boundedInt(value, min, max) {\n  const parsed = Number.parseInt(String(value), 10);\n  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;\n}\n"""
new = """function boundedInt(value, min, max) {\n  const raw = String(value).trim();\n  if (!/^\\d+$/.test(raw)) return null;\n  const parsed = Number(raw);\n  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;\n}\n"""
assert old in s
s = s.replace(old, new, 1)
anchor = """    receipt = evaluateProductionAuthorization({ ...base, confirmation: 'WRONG' });\n    assert(receipt.blockers.includes('confirmation:invalid'), 'wrong confirmation must fail');\n"""
assert anchor in s
addition = anchor + """\n    receipt = evaluateProductionAuthorization({ ...base, executionWindowMinutes: '30abc' });\n    assert(receipt.blockers.includes('execution_window:invalid'), 'non-numeric execution window must fail');\n\n    receipt = evaluateProductionAuthorization({ ...base, authorizationTtlMinutes: '30m' });\n    assert(receipt.blockers.includes('authorization_ttl:invalid'), 'non-numeric TTL must fail');\n"""
s = s.replace(anchor, addition, 1)
p.write_text(s)
