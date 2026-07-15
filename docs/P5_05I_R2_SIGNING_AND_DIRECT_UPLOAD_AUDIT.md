# P5-05I configured R2 signing and direct-upload audit

**Implementation item:** P5-05I  
**Status:** In progress  
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

## Validation

P5-05I adds:

- deterministic SigV4 URL and header tests;
- independent signature recomputation;
- object-path tampering rejection;
- strict environment configuration tests;
- expiry and private-key-scope rejection;
- executable synthetic direct-upload and private-intake audit;
- built HTML leakage checks for all R2 configuration names;
- full repository format, lint, Astro/TypeScript, schema, migration, unit, build, accessibility, staging, and screenshot workflows.

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
