function uuidFromBytes(bytes: Uint8Array): string {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function deterministicScheduledUuid(payload: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)),
  );
  const bytes = digest.slice(0, 16);
  const versionByte = bytes[6];
  const variantByte = bytes[8];
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error('The scheduled reconfirmation digest was incomplete.');
  }
  bytes[6] = (versionByte & 0x0f) | 0x80;
  bytes[8] = (variantByte & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}

export function scheduledReconfirmationRunId(effectiveAt: string): Promise<string> {
  return deterministicScheduledUuid(`cryptopaymap:reconfirmation:run:${effectiveAt}`);
}

export function scheduledReconfirmationRequestId(
  runId: string,
  claimId: string,
): Promise<string> {
  return deterministicScheduledUuid(`cryptopaymap:reconfirmation:claim:${runId}:${claimId}`);
}
