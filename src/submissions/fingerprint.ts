import type { CommonSubmissionIntake, SubmissionJsonValue } from './contract';

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalizeJson(value: SubmissionJsonValue): SubmissionJsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeJson);

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalizeJson(child)] as const);
  return Object.fromEntries(entries) as Record<string, SubmissionJsonValue>;
}

export function canonicalSubmissionIntakeString(intake: CommonSubmissionIntake): string {
  return JSON.stringify(canonicalizeJson(intake as unknown as SubmissionJsonValue));
}

export async function fingerprintSubmissionIntake(intake: CommonSubmissionIntake): Promise<string> {
  const canonical = canonicalSubmissionIntakeString(intake);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return bytesToHex(new Uint8Array(digest));
}
