function uuidFromBytes(bytes: Uint8Array): string {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function scheduledReconfirmationRequestId(
  runId: string,
  claimId: string,
): Promise<string> {
  const payload = new TextEncoder().encode(`cryptopaymap:reconfirmation:${runId}:${claimId}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}
