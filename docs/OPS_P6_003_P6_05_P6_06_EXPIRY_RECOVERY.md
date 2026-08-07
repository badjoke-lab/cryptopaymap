# OPS-P6-003 — P6-05/P6-06 expiry recovery

Issue #373 covers the recovery path used when both configured-staging P6-05 and P6-06 evidence have expired.

The recovery path treats the prior accepted P6-06 receipt as historical proof only. P6-05 can reuse the existing approved staging hostname only after a fresh exact-main P6-06 read-only diagnostic confirms one safe candidate with no exception. P6-06 continuity can then renew only after current P6-01 through P6-05 evidence and fresh external DNS, TLS, route, Admin-boundary, and release-identity checks pass.

This recovery path does not authorize production and does not perform DNS, Pages custom-domain, R2, database, or production-cutover mutations.
