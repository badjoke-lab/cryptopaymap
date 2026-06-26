import {
  paymentMethodRecordSchema,
  paymentRouteRecordSchema,
  type PaymentMethodRecord,
  type PaymentRouteRecord,
} from '../schemas/payment-registry-records';

const routeSource = [
  {
    slug: 'direct_wallet',
    name: 'Direct wallet',
    description: 'The customer sends cryptocurrency from a wallet without a processor checkout layer.',
    status: 'active',
  },
  {
    slug: 'processor_checkout',
    name: 'Processor checkout',
    description: 'A payment processor presents and manages the cryptocurrency checkout flow.',
    status: 'active',
  },
] as const;

const methodSource = [
  {
    slug: 'onchain',
    name: 'On-chain transfer',
    aliases: ['on chain', 'blockchain transfer'],
    description: 'A standard transaction recorded on the selected network.',
    status: 'active',
  },
  {
    slug: 'lightning_invoice',
    name: 'Lightning invoice',
    aliases: ['LN invoice', 'bolt11'],
    description: 'A Lightning Network invoice presented for payment.',
    status: 'active',
  },
  {
    slug: 'lightning_nfc',
    name: 'Lightning NFC',
    aliases: ['LN NFC', 'NFC Lightning'],
    description: 'A Lightning payment initiated through a supported NFC interaction.',
    status: 'active',
  },
  {
    slug: 'wallet_qr',
    name: 'Wallet QR',
    aliases: ['wallet QR code', 'QR wallet'],
    description: 'A wallet address or payment request displayed as a QR code.',
    status: 'active',
  },
  {
    slug: 'processor_checkout',
    name: 'Processor checkout',
    aliases: ['crypto checkout', 'payment processor checkout'],
    description: 'A hosted or embedded checkout supplied by a payment processor.',
    status: 'active',
  },
  {
    slug: 'pos_terminal',
    name: 'POS terminal',
    aliases: ['point of sale terminal', 'crypto POS'],
    description: 'A physical point-of-sale device used to initiate the payment.',
    status: 'active',
  },
  {
    slug: 'invoice',
    name: 'Invoice',
    aliases: ['billing invoice'],
    description: 'Payment instructions supplied on a merchant or service invoice.',
    status: 'active',
  },
  {
    slug: 'payment_link',
    name: 'Payment link',
    aliases: ['pay link', 'checkout link'],
    description: 'A merchant-provided link opens the payment request or checkout.',
    status: 'active',
  },
] as const;

export const paymentRouteRegistry = routeSource.map((entry) => paymentRouteRecordSchema.parse(entry));
export const paymentMethodRegistry = methodSource.map((entry) =>
  paymentMethodRecordSchema.parse(entry),
);

export function normalizePaymentLookup(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

export function findPaymentRouteCandidates(value: string): PaymentRouteRecord[] {
  const key = normalizePaymentLookup(value);
  return paymentRouteRegistry.filter(
    (route) =>
      normalizePaymentLookup(route.slug) === key || normalizePaymentLookup(route.name) === key,
  );
}

export function findPaymentMethodCandidates(value: string): PaymentMethodRecord[] {
  const key = normalizePaymentLookup(value);
  return paymentMethodRegistry.filter((method) =>
    [method.slug, method.name, ...method.aliases].some(
      (candidate) => normalizePaymentLookup(candidate) === key,
    ),
  );
}
