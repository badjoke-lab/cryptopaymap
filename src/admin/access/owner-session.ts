const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const OWNER_SESSION_COOKIE_NAME = '__Host-cpm_admin_session';
export const OWNER_SESSION_DEFAULT_TTL_SECONDS = 4 * 60 * 60;

interface OwnerSessionPayload {
  v: 1;
  sub: string;
  iat: number;
  exp: number;
  nonce: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid Base64URL value.');
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveSessionKey(ownerSecretBase64Url: string): Promise<CryptoKey> {
  const ownerSecret = base64UrlDecode(ownerSecretBase64Url);
  const sourceKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(ownerSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const derived = await crypto.subtle.sign(
    'HMAC',
    sourceKey,
    textEncoder.encode('cryptopaymap-admin-owner-session-key-v1'),
  );
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function randomNonce(): string {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  return base64UrlEncode(nonce);
}

export async function verifyOwnerLoginSecret(
  submitted: string,
  expectedBase64Url: string,
): Promise<boolean> {
  try {
    const submittedBytes = base64UrlDecode(submitted.trim());
    const expectedBytes = base64UrlDecode(expectedBase64Url);
    if (submittedBytes.length !== expectedBytes.length) return false;

    const challenge = textEncoder.encode('cryptopaymap-admin-owner-login-v1');
    const expectedKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(expectedBytes),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const submittedKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(submittedBytes),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expectedMac = new Uint8Array(await crypto.subtle.sign('HMAC', expectedKey, challenge));
    const submittedMac = new Uint8Array(await crypto.subtle.sign('HMAC', submittedKey, challenge));
    let difference = 0;
    for (let index = 0; index < expectedMac.length; index += 1) {
      const expectedByte = expectedMac[index];
      const submittedByte = submittedMac[index];
      if (expectedByte === undefined || submittedByte === undefined) return false;
      difference |= expectedByte ^ submittedByte;
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export async function issueOwnerSession(
  ownerSecretBase64Url: string,
  subject: string,
  ttlSeconds = OWNER_SESSION_DEFAULT_TTL_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: OwnerSessionPayload = {
    v: 1,
    sub: subject,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    nonce: randomNonce(),
  };
  const payloadEncoded = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signingKey = await deriveSessionKey(ownerSecretBase64Url);
  const signature = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    textEncoder.encode(`v1.${payloadEncoded}`),
  );
  return `${payloadEncoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyOwnerSession(
  token: string,
  ownerSecretBase64Url: string,
  expectedSubject: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<OwnerSessionPayload> {
  const [payloadEncoded, signatureEncoded, extra] = token.split('.');
  if (!payloadEncoded || !signatureEncoded || extra !== undefined) {
    throw new Error('Invalid owner session.');
  }
  const signingKey = await deriveSessionKey(ownerSecretBase64Url);
  const valid = await crypto.subtle.verify(
    'HMAC',
    signingKey,
    toArrayBuffer(base64UrlDecode(signatureEncoded)),
    textEncoder.encode(`v1.${payloadEncoded}`),
  );
  if (!valid) throw new Error('Invalid owner session signature.');

  const parsed = JSON.parse(
    textDecoder.decode(base64UrlDecode(payloadEncoded)),
  ) as Partial<OwnerSessionPayload>;
  if (
    parsed.v !== 1 ||
    parsed.sub !== expectedSubject ||
    !Number.isInteger(parsed.iat) ||
    !Number.isInteger(parsed.exp) ||
    typeof parsed.nonce !== 'string' ||
    parsed.nonce.length < 16 ||
    (parsed.iat as number) > nowSeconds + 60 ||
    (parsed.exp as number) <= nowSeconds ||
    (parsed.exp as number) - (parsed.iat as number) > 12 * 60 * 60
  ) {
    throw new Error('Invalid owner session payload.');
  }
  return parsed as OwnerSessionPayload;
}

export function readOwnerSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === OWNER_SESSION_COOKIE_NAME) return rest.join('=') || null;
  }
  return null;
}

export function createOwnerSessionCookie(token: string, ttlSeconds: number): string {
  return `${OWNER_SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${ttlSeconds}; Secure; HttpOnly; SameSite=Strict`;
}

export function clearOwnerSessionCookie(): string {
  return `${OWNER_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
}

export function isSameOriginAdminMutation(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return true;
  }
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
