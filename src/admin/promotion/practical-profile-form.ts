import { canonicalLocationSocialLinkSchema } from '../../schemas/canonical-identity';

export interface PracticalProfileParseResult<T> {
  value: T | undefined;
  error: string | null;
}

export function parseAmenitiesFormValue(raw: string): PracticalProfileParseResult<string[]> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { value: undefined, error: null };

  const values = trimmed
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
  const normalized = [...new Set(values)];

  if (normalized.length > 100) {
    return { value: undefined, error: 'Amenities must contain 100 entries or fewer.' };
  }
  const invalid = normalized.find((value) => value.length > 80);
  if (invalid) {
    return { value: undefined, error: 'Each amenity must be 80 characters or fewer.' };
  }
  return { value: normalized, error: null };
}

export function serializeAmenitiesFormValue(values: readonly string[] | null | undefined): string {
  return values?.join('\n') ?? '';
}

export function parseSocialLinksFormValue(
  raw: string,
): PracticalProfileParseResult<Array<{ platform: string; url: string; handle: string | null }>> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { value: undefined, error: null };

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 30) {
    return { value: undefined, error: 'Social links must contain 30 entries or fewer.' };
  }

  const links: Array<{ platform: string; url: string; handle: string | null }> = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 2 || parts.length > 3) {
      return {
        value: undefined,
        error: `Social link line ${index + 1} must use: platform | https://url | optional handle.`,
      };
    }
    const candidate = {
      platform: parts[0] ?? '',
      url: parts[1] ?? '',
      handle: (parts[2] ?? '').length === 0 ? null : (parts[2] ?? ''),
    };
    const parsed = canonicalLocationSocialLinkSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        value: undefined,
        error: `Social link line ${index + 1} is invalid: ${parsed.error.issues[0]?.message ?? 'invalid value'}`,
      };
    }
    const key = `${parsed.data.platform}:${parsed.data.url}`;
    if (seen.has(key)) {
      return {
        value: undefined,
        error: `Social link line ${index + 1} duplicates an earlier platform and URL.`,
      };
    }
    seen.add(key);
    links.push(parsed.data);
  }

  return { value: links, error: null };
}

export function serializeSocialLinksFormValue(
  links:
    | readonly { platform: string; url: string | null; handle: string | null }[]
    | null
    | undefined,
): string {
  return (links ?? [])
    .filter((link): link is { platform: string; url: string; handle: string | null } =>
      Boolean(link.url?.startsWith('https://')),
    )
    .map((link) => `${link.platform} | ${link.url} | ${link.handle ?? ''}`)
    .join('\n');
}

export function reviewOnlySocialValues(
  links:
    | readonly { platform: string; url: string | null; handle: string | null }[]
    | null
    | undefined,
): string[] {
  return (links ?? [])
    .filter((link) => !link.url?.startsWith('https://'))
    .map((link) => `${link.platform}: ${link.url ?? link.handle ?? 'unavailable'}`);
}
