# P5-05I configured R2 signing and direct-upload audit

**Implementation item:** P5-05I  
**Status:** Completed in PR #225  
**Last updated:** 2026-07-15

## Purpose

Configure the existing Photos upload-authorization boundary with a real Cloudflare R2 S3 SigV4 signer and prove one bounded synthetic direct upload plus private Photos intake.

P5-05I replaces the public runtime's arbitrary `PHOTO_UPLOAD_AUTHORIZER` environment object with explicit server-side R2 configuration. Test code may still inject an authorizer through a code-level dependency, but production Pages Function composition reads only strict environment values.

## Server configuration

The configured signer requires:

```text
CPM_R2_ACCOUNT_ID
CPM_R2_PHOTO_QUARANTINE_BUCKET
CPM_R2_ACCESS_KEY_ID
CPM_R2_SECRET_ACCESS_KEY
```

Validation rejects missing, malformed, whitespace-bearing, or unsupported values with one generic configuration error. The public client-configuration endpoint does not expose any of these values.

## Signed operation

The authorizer signs one operation:

```text
PUT https://<bucket>.<account>.r2.cloudflarestorage.com/quarantine/photos/v1/<reservation-uuid>
```

The signature uses:

```text
algorithm  AWS4-HMAC-SHA256
region     auto
service    s3
payload    UNSIGNED-PAYLOAD
expiry     1–900 seconds
```

Only an exact deterministic `quarantine/photos/v1/<uuid>` key is accepted. Public keys, arbitrary private paths, custom domains, non-HTTPS URLs, and expiries outside the reservation window are rejected.

The signed headers are:

- `content-type`;
- `host`;
- every required `x-amz-meta-*` private validation header.

The required metadata remains the P5-05C contract:

- schema version;
- reservation UUID;
- intake request UUID;
- target type and UUID;
- purpose;
- declared byte size.

Changing the object path, content type, metadata, expiry, credential scope, or HTTP operation invalidates the signature.

## Browser and CORS requirement

The browser continues to send only the exact returned `PUT` method and required headers. The quarantine bucket must separately allow the intended CryptoPayMap origin, `PUT`, `Content-Type`, and the required `x-amz-meta-*` headers through its R2 CORS policy. P5-05I documents and tests this contract but does not apply infrastructure configuration or expose a public bucket.

## Runtime composition

`createPhotoUploadAuthorizationHttpRuntimeFromEnvironment` now composes the R2 signer from strict environment configuration. A code-level authorizer dependency remains available only for deterministic unit and integration tests.

The private Photos intake runtime does not depend on R2 signing credentials after the browser has already uploaded the objects.

## Synthetic audit

The executable audit performs this bounded sequence with deterministic synthetic credentials and in-memory persistence:

```text
strict Photos authorization request
  ↓
deterministic private reservation
  ↓
R2 SigV4 HTTPS PUT authorization
  ↓
browser orchestration sends one exact Blob and required headers
  ↓
private Photos intake consumes the same reservation atomically
  ↓
privacy-safe audit result
```

The safe audit result contains only:

- pass/fail;
- private-quarantine scope;
- uploaded byte count;
- public Submission reference;
- reservation-consumed boolean;
- explicit false values for automatic processing, approval, and publication.

It rejects any result containing an access key, secret-key marker, signature parameter, status secret, request UUID, or reservation UUID.

## Completion result

P5-05I provides:

- a dependency-free Web Crypto AWS SigV4 signer for the Cloudflare R2 S3 endpoint;
- strict server-only R2 account, bucket, access-key, and secret-key configuration;
- one short-lived signed `PUT` for the deterministic private quarantine object only;
- exact binding of content type, host, and all private validation metadata headers;
- removal of arbitrary upload-authorizer environment injection from public runtime composition;
- independent signature recomputation and object-path tampering tests;
- bounded expiry and private-key-scope rejection;
- an executable synthetic browser-style direct upload followed by real private Photos intake and atomic reservation consumption;
- privacy-safe audit output and built-HTML leakage checks;
- no automatic object validation, image processing, Media approval, public copy, canonical mutation, export, or publication.

## Validation

Final implementation head `e60a5cb659111c0a182ee84afe0540de2be848da` passed all required workflows:

- Foundation validation;
- Migration drift;
- Staging review validation;
- Capture representative review screenshots.

Foundation validation passed formatting, lint, Astro and TypeScript, executable runtime schemas, migration history, all unit and component tests, static build, accessibility, Phase 1 files, and staging artifact checks.

## Explicit exclusions

This item does not automatically validate or process objects, approve Media, copy an object to public storage, mutate canonical records, activate exports, publish Media, deploy production infrastructure, or claim launch readiness.
