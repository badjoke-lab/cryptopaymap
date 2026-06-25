import { describe, expect, it } from 'vitest';
import { foundationPlaceSchema, paymentMethodSchema, routeTypeSchema } from '../src/schemas/core';

const validPlace = {
  id: 'foundation-example-place',
  slug: 'example-coffee',
  name: 'Example Coffee',
  status: 'confirmed',
  asset: 'BTC',
  network: 'lightning',
  route: 'direct_wallet',
  lastConfirmed: '2026-06-01',
  howToPay: 'Ask staff to display a Lightning invoice and scan the QR code.',
};

describe('runtime schemas', () => {
  it('accepts a complete public place sample', () => {
    expect(foundationPlaceSchema.safeParse(validPlace).success).toBe(true);
  });

  it('rejects an incomplete place sample', () => {
    expect(
      foundationPlaceSchema.safeParse({ ...validPlace, network: '', howToPay: '' }).success,
    ).toBe(false);
  });

  it('keeps route and payment method separate', () => {
    expect(routeTypeSchema.safeParse('direct_wallet').success).toBe(true);
    expect(routeTypeSchema.safeParse('lightning_invoice').success).toBe(false);
    expect(paymentMethodSchema.safeParse('lightning_invoice').success).toBe(true);
  });
});
