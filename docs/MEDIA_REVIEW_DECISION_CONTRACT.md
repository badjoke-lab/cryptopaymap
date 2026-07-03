# Media review decision contract

P3-10A defines the typed review boundary for operator-managed media.

## Core rules

- Media review uses the isolated `media:review` capability and a UUID idempotency key.
- Every decision pins the Media asset version, purpose, role, rights state, visibility, subject, and complete file set.
- Evidence and owner-verification media can only be approved for private review use.
- Public approval is limited to gallery candidates and canonical logos.
- Public approval requires confirmed target matching, cleared privacy review, publishable rights, alt text, display order, and reviewed JPEG or WebP display output.
- Original files remain non-public.
- Reject applies only to pending media.
- Restrict applies only to accepted public media.
- Supersede retires accepted public or restricted gallery media.
- Same idempotency key and same normalized request replays; changed content conflicts.
- Version or file-set drift conflicts instead of overwriting newer review work.

## Deferred from P3-10A

Database receipts, durable transactions, storage operations, protected queue and detail APIs, `/admin/media`, and public export release control are added in later deliveries.
