import { z } from 'zod';
import { issueSubmissionStatusSecret, type IssuedSubmissionStatusSecret } from './status-secret';

export interface SubmissionStatusSecretProvider {
  issueForRequest(requestId: string): Promise<IssuedSubmissionStatusSecret>;
}

const requestIdSchema = z.uuid();
const minimumKeyLength = 32;
const domain = 'cryptopaymap:submission-status:v1:';

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function createHmacSubmissionStatusSecretProvider(
  secretKey: Uint8Array,
): SubmissionStatusSecretProvider {
  if (secretKey.byteLength < minimumKeyLength) {
    throw new Error(`Submission status HMAC key must be at least ${minimumKeyLength} bytes.`);
  }

  const keyMaterial = copyArrayBuffer(secretKey);
  const keyPromise = crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return {
    async issueForRequest(requestId) {
      const parsedRequestId = requestIdSchema.parse(requestId);
      const key = await keyPromise;
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${domain}${parsedRequestId}`),
      );
      const entropy = new Uint8Array(signature);
      return issueSubmissionStatusSecret(entropy);
    },
  };
}
