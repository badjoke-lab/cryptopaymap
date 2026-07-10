export const cloudflareConnectingIpHeaderName = 'CF-Connecting-IP' as const;

export class SubmissionEdgeIdentityError extends Error {
  constructor() {
    super('Submission edge identity is unavailable.');
    this.name = 'SubmissionEdgeIdentityError';
  }
}

function parseCanonicalIpv4(value: string): string | null {
  const segments = value.split('.');
  if (segments.length !== 4) return null;

  const canonical: string[] = [];
  for (const segment of segments) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(segment)) return null;
    const octet = Number(segment);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    canonical.push(String(octet));
  }
  return canonical.join('.');
}

function parseCanonicalIpv6(value: string): string | null {
  if (!value.includes(':') || value.includes('[') || value.includes(']') || value.includes('%')) {
    return null;
  }

  try {
    const parsed = new URL(`http://[${value}]/`);
    const hostname = parsed.hostname;
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) return null;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function readTrustedCloudflareEdgeIdentity(request: Request): string {
  const raw = request.headers.get(cloudflareConnectingIpHeaderName);
  if (raw === null || raw.length === 0 || raw.length > 64) {
    throw new SubmissionEdgeIdentityError();
  }

  const ipv4 = parseCanonicalIpv4(raw);
  if (ipv4 !== null) return ipv4;

  const ipv6 = parseCanonicalIpv6(raw);
  if (ipv6 !== null) return ipv6;

  throw new SubmissionEdgeIdentityError();
}
