import { describe, expect, it } from 'vitest';
import {
  parseAmenitiesFormValue,
  parseSocialLinksFormValue,
  reviewOnlySocialValues,
  serializeAmenitiesFormValue,
  serializeSocialLinksFormValue,
} from '../src/admin/promotion/practical-profile-form';

describe('practical profile Promotion form parsing', () => {
  it('normalizes amenity lines and comma-delimited values deterministically', () => {
    expect(parseAmenitiesFormValue('wifi\noutdoor-seating, wifi\n  parking ')).toEqual({
      value: ['wifi', 'outdoor-seating', 'parking'],
      error: null,
    });
    expect(serializeAmenitiesFormValue(['wifi', 'outdoor-seating'])).toBe(
      'wifi\noutdoor-seating',
    );
    expect(parseAmenitiesFormValue('')).toEqual({ value: undefined, error: null });
  });

  it('rejects overlong amenity values', () => {
    const result = parseAmenitiesFormValue('a'.repeat(81));
    expect(result.value).toBeUndefined();
    expect(result.error).toContain('80 characters');
  });

  it('parses canonical HTTPS social-link lines and rejects duplicates', () => {
    expect(
      parseSocialLinksFormValue(
        'instagram | https://social.example.test/cafe | @cafe\nx | https://x.example.test/cafe |',
      ),
    ).toEqual({
      value: [
        {
          platform: 'instagram',
          url: 'https://social.example.test/cafe',
          handle: '@cafe',
        },
        { platform: 'x', url: 'https://x.example.test/cafe', handle: null },
      ],
      error: null,
    });

    const duplicate = parseSocialLinksFormValue(
      'x | https://x.example.test/cafe | @cafe\nx | https://x.example.test/cafe | @other',
    );
    expect(duplicate.value).toBeUndefined();
    expect(duplicate.error).toContain('duplicates');
  });

  it('rejects non-HTTPS canonical social links and malformed line shapes', () => {
    expect(parseSocialLinksFormValue('x | http://x.example.test/cafe | @cafe').error).toBeTruthy();
    expect(parseSocialLinksFormValue('x only').error).toContain('must use');
  });

  it('prefills only canonical-eligible HTTPS links and keeps source-only values separate', () => {
    const links = [
      {
        platform: 'instagram',
        url: 'https://social.example.test/cafe',
        handle: '@cafe',
      },
      { platform: 'x', url: null, handle: '@cafe' },
      { platform: 'facebook', url: 'http://legacy.example.test/cafe', handle: null },
    ];

    expect(serializeSocialLinksFormValue(links)).toBe(
      'instagram | https://social.example.test/cafe | @cafe',
    );
    expect(reviewOnlySocialValues(links)).toEqual([
      'x: @cafe',
      'facebook: http://legacy.example.test/cafe',
    ]);
  });
});
