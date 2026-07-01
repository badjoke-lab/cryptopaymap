# Evidence review persistence

**Implementation item:** P3-08B  
**Status:** Repository persistence implementation

## Durable decision record

`evidence_review_decisions` stores one replayable audit record for every committed Evidence review request. The record preserves:

- request and reviewer identity;
- Evidence and Claim identities;
- disposition, finding, and explicit Claim action;
- resulting Evidence status and Claim status;
- preserved Claim visibility;
- linked verification event when Claim state changes;
- reviewed Evidence and Claim versions;
- the exact accepted Evidence ID set reviewed before the decision;
- summaries, reason codes, review dates, ending reason, and normalized request fingerprint.

Database constraints enforce the valid disposition, finding, action, result-status, transition, event-link, and optional-field combinations.

## Rejected verification event

The verification-event enum now includes `rejected`. A rejected event transitions a candidate Claim to rejected, remains a status-only event, and requires decision Evidence.

## Atomic backend

The Drizzle backend:

1. replays an identical prior request or rejects changed content for the same request ID;
2. loads the current Claim, reviewed Evidence, and accepted Evidence set;
3. uses the P3-08A projection engine to calculate and validate the result;
4. rechecks the Evidence row, Claim row, and exact accepted Evidence set with transactional guards;
5. updates Evidence and optional Claim state;
6. inserts the verification event and Evidence relationship when Claim state changes;
7. inserts the durable review decision receipt;
8. commits all statements in one Neon batch.

A row-version, accepted-set, foreign-key, uniqueness, or check-constraint conflict rolls back the complete operation.

## Migration

Migration `0015_bored_lyja.sql` adds the decision enums, durable table, indexes, constraints, and the rejected verification-event enum value. The generated Drizzle snapshot and journal entry are committed with the migration.

## Exclusions

- no protected Evidence queue or reviewer workspace yet;
- no public export or visibility change;
- no automatic review decision;
- no live database transaction verification claim;
- no live Cloudflare Access verification claim.
