# Submission → Patch → PR (Overview)

**Input:** GitHub Issue Forms (Owner / Community / Report)  
**Normalize:** `src/normalizeSubmission.ts`  
**Validate:** Ajv with `place.schema.json`  
**Outputs:**  
- `inbox/submissions/issue-<n>.json` (patch)  
- `inbox/rejects/issue-<n>.json` (rejected lines, if any)

## Flow
1. User opens an Issue (label: owner|community|report).
2. Workflow `ingest-submission.yml` triggers.
3. `scripts/issue_intake.ts`:
   - Parse Issue body blocks.
   - Call `normalize*()` with `chains.meta.json`.
   - Write patch JSON (+ rejects JSON if present).
   - Open a PR with those files.
4. CI `validate-places.yml`:
   - Existing dataset validation (`scripts/validate.ts`).
   - Submissions validation (`scripts/validate_submissions.ts`).
   - No-Japanese-in-code guard.
5. Reviewer merges patch into the right place file after manual checks.

## Rules Recap
- Chains must resolve to schema enum ids (`bitcoin|lightning|evm-mainnet|...`).
- `lightning` requires `asset=BTC` (others dropped).
- `method`: auto (`lightning` or `onchain`).
- `preferred` order: BTC:lightning > BTC:bitcoin > ETH:evm-mainnet > others.
- Evidence → `verification.sources[]` with typed heuristics.
- Directory/Unverified must not have `media.*`.
- `payment.preferred ⊆ payment.accepts`.

## Dev Commands
- `pnpm run cpm:validate:submissions` — normalize & validate fixtures
- `pnpm run cpm:validate` — dataset rules
- `pnpm run cpm:lint:nocodeja` — Japanese text guard
