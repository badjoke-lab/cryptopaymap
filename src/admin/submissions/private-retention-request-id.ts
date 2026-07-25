import { z } from 'zod';

function uuidFromDigest(bytes: Uint8Array): string {
  const value = bytes.slice(0, 16);
  value[6] = ((value[6] ?? 0) & 0x0f) | 0x80;
  value[8] = ((value[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return z
    .uuid()
    .parse(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    );
}

async function deterministicUuid(label: string): Promise<string> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label)),
  );
  return uuidFromDigest(digest);
}

export function privateRetentionRunId(effectiveAt: string): Promise<string> {
  return deterministicUuid(
    `private-retention-run-v1:${z.iso.datetime({ offset: true }).parse(effectiveAt)}`,
  );
}

export function privateRetentionItemId(
  policy: string,
  referenceType: string,
  referenceId: string,
): Promise<string> {
  return deterministicUuid(
    `private-retention-item-v1:${policy}:${referenceType}:${z.uuid().parse(referenceId)}`,
  );
}
