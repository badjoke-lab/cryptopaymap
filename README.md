# CryptoPayMap

Minimal docs for maintainers and contributors.

## Commands

```bash
# validate existing place data & business rules
pnpm run cpm:validate

# validate intake submissions (owner/community/report)
pnpm run cpm:validate:submissions

# fuzz payment aliases
pnpm run cpm:fuzz:payments

# no Japanese in code
pnpm run cpm:lint:nocodeja
