# Data Model v2 (CryptoPayMap)

## Verification Status (source of truth)
- `owner` → UI: **Owner Verified**
- `community` → **Community Verified**
- `directory` → **Directory Listed** (auto-imported, no media/summary)
- `unverified` → **Unverified**

## Required Fields
`id, name, lat, lng, verification.status`

## Optional Meta
- `verification.last_checked` (ISO8601)
- `verification.last_verified` (when owner/community approved)
- `verification.sources[]` (type/name/rule/url/snippet/when)
- `verification.submitted_by` (owner/self/third-party/unknown)

## Media Rules
- owner: images ≤ 8, caption ≤ 600
- community: images ≤ 4, caption ≤ 300
- directory/unverified: **no images / no captions**
- images = external URLs only (no repo storage)

## Profile
Displayed **only for owner/community**.
