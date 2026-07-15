# P5-05I configured R2 signing and direct-upload audit

**Implementation item:** P5-05I  
**Status:** In progress  
**Last updated:** 2026-07-15

## Purpose

Configure the existing Photos upload-authorization boundary with a real Cloudflare R2 S3 SigV4 signer and prove one bounded synthetic direct upload plus private Photos intake.

## Required result

- short-lived HTTPS `PUT` authorization for only the deterministic private quarantine key;
- exact `content-type` and required `x-amz-meta-*` header binding;
- strict account, bucket, access-key, and secret-key environment configuration;
- no arbitrary production authorizer injection;
- deterministic signing tests and malformed-configuration rejection;
- a synthetic upload/intake audit with privacy-safe receipts;
- no credential, signed-URL, file-byte, contact, or status-secret logging.

## Explicit exclusions

This item does not automatically validate or process objects, approve Media, copy an object to public storage, mutate canonical records, activate exports, publish Media, deploy production infrastructure, or claim launch readiness.
