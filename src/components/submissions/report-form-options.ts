import type { ReportFormOption } from './ReportFormControls';

export const targetTypeOptions: ReportFormOption[] = [
  { value: 'entity', label: 'Business or online service' },
  { value: 'location', label: 'Specific place or branch' },
  { value: 'claim', label: 'Specific payment acceptance claim' },
];
export const reportKindOptions: ReportFormOption[] = [
  { value: 'payment_report', label: 'Payment result report' },
  { value: 'problem_report', label: 'Problem or correction report' },
];
export const paymentResultOptions: ReportFormOption[] = [
  { value: 'successful', label: 'Payment succeeded' },
  { value: 'failed', label: 'Payment failed' },
];
export const routeOptions: ReportFormOption[] = [
  { value: 'direct_wallet', label: 'Direct wallet' },
  { value: 'processor_checkout', label: 'Processor checkout' },
];
export const paymentMethodOptions: ReportFormOption[] = [
  { value: 'onchain', label: 'On-chain transfer' },
  { value: 'lightning_invoice', label: 'Lightning invoice' },
  { value: 'lightning_nfc', label: 'Lightning NFC' },
  { value: 'wallet_qr', label: 'Wallet QR code' },
  { value: 'processor_checkout', label: 'Processor checkout' },
  { value: 'pos_terminal', label: 'Crypto POS terminal' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_link', label: 'Payment link' },
];
export const paymentContextOptions: ReportFormOption[] = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'qr_code', label: 'QR code' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_link', label: 'Payment link' },
  { value: 'hosted_checkout', label: 'Hosted checkout' },
  { value: 'other', label: 'Other' },
];
export const problemTypeOptions: ReportFormOption[] = [
  { value: 'no_longer_accepts_crypto', label: 'No longer accepts crypto' },
  { value: 'business_closed', label: 'Business appears closed' },
  { value: 'payment_failed', label: 'Payment failed' },
  { value: 'wrong_asset', label: 'Wrong asset' },
  { value: 'wrong_network', label: 'Wrong network' },
  { value: 'wrong_instructions', label: 'Wrong payment instructions' },
  { value: 'wrong_address', label: 'Wrong address or profile details' },
  { value: 'duplicate', label: 'Duplicate record' },
  { value: 'unauthorized_image', label: 'Unauthorized image or rights issue' },
  { value: 'privacy_issue', label: 'Privacy issue' },
  { value: 'other', label: 'Other problem' },
];
