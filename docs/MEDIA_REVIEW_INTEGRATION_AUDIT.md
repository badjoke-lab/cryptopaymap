# Media review integration audit

**Implementation item:** P3-10F  
**Status:** Repository complete

## Scope

This audit verifies the complete repository path established by P3-10A through P3-10F:

```text
protected queue
→ exact Media detail and complete file set
→ state-aware reviewer action
→ decision authorization and validation
→ storage preflight or revocation
→ guarded database persistence
→ durable decision receipt
→ public derivative publication or removal
```

## Authorization boundary

- Queue, detail, preview, and decision routes require a verified administration identity.
- The exact actor ID must be present in `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS`.
- Media reads and mutations use only the isolated `media:review` capability.
- Decision requests require an `Idempotency-Key` UUID.
- Missing policy, database, or storage configuration fails closed.

## Review-state boundary

The reviewer UI and decision contract expose only these actions:

| Current state | Allowed actions |
|---|---|
| Pending Evidence or owner-verification Media | Approve private, reject |
| Pending public-gallery candidate or canonical logo | Approve public, reject |
| Accepted public gallery or canonical logo | Restrict, supersede |
| Accepted restricted gallery or canonical logo | Supersede |
| Rejected or superseded Media | No further action |

The server-side decision contract remains authoritative even if a client sends a different action.

## Exact-state guards

A decision pins:

- Media asset ID and `updated_at`
- review status
- purpose and role
- rights status
- visibility
- exact subject type and ID
- complete file set
- each file ID, variant, storage scope, storage key, MIME type, content hash, and dimensions
- active public cover uniqueness when applicable

A changed Media asset or file set produces a conflict rather than silently applying the decision.

## Storage boundary

### Before public approval

- Originals, Evidence, owner proof, candidates, and staged derivatives remain private.
- Selected display and thumbnail derivatives must use deterministic private keys.
- The private object is checked for existence, MIME type, and content hash before durable approval.

### Public approval

- The database transaction records the accepted Media state, decision receipt, and exact file transitions.
- After committed or replayed approval, only selected derivatives are copied to deterministic public keys.
- A partial publication is cleaned up.
- A failed publication can be retried by replaying the same request ID without creating another decision receipt.

### Restriction and supersession

- Public objects are revoked before the durable restriction or supersession decision.
- A revocation failure blocks the database mutation.
- File rows return to deterministic private scope and keys in the guarded database batch.

## Protected preview boundary

The reviewer UI requests a preview by Media file ID only.

The endpoint:

- resolves the storage key from private database state
- rejects invalid IDs before querying storage
- chooses the private or public binding from the stored scope
- rechecks object key, byte size, MIME type, and content hash
- returns `private, no-store` and `noindex` headers
- never places a private storage key in the request URL

## Durable persistence

Migration `0017_glorious_toxin.sql` creates durable `media_review_decisions` receipts with:

- request identity and fingerprint
- actor and action
- expected state and complete file snapshot
- resulting review, purpose, rights, and visibility state
- selected public file IDs
- rights, attribution, and decision metadata
- database constraints for each action shape

The Media asset update, file transitions, guards, and decision receipt are executed in one database batch.

## Protected routes and pages

### Routes

- `GET /admin/api/media`
- `GET /admin/api/media-detail?mediaAssetId=<uuid>`
- `GET /admin/api/media-file?fileId=<uuid>`
- `POST /admin/api/media-decision?mediaAssetId=<uuid>`

### Pages

- `/admin/media/`
- `/admin/media/detail/?id=<uuid>`

## Automated verification

The repository validates:

- authorization and policy parsing
- decision schemas and replay behavior
- durable schema and migration drift
- exact-state and file-set guards
- storage plans and deterministic keys
- R2 metadata verification
- publication cleanup and revocation behavior
- queue and detail workspace contracts
- queue, detail, preview, and decision HTTP mappings
- reviewer UI request payloads
- exact UI action matrix
- built protected pages and leakage markers
- end-to-end queue, detail, approval, replay, publication, restriction, and revocation flow

## Deferred live verification

The repository implementation does not claim that these deployment tasks are complete:

- Cloudflare Access policy configuration
- `CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS` production value
- private and public R2 bucket bindings
- live R2 metadata and object-copy behavior
- live Neon migration and transaction verification
- production content-security-policy verification
- production reviewer-device and browser testing

These remain deployment and production verification work and do not block the repository handoff to P3-11.

## Handoff

P3-10 is repository-complete. P3-11 may rely on Media records only when the export layer independently confirms:

- accepted review status
- public visibility
- publishable rights
- approved public-purpose value
- valid public derivative rows
- public object availability according to the release workflow

The Media review decision alone must not bypass public export validation or release controls.
