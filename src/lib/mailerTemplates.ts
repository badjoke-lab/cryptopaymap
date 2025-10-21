// src/lib/mailerTemplates.ts
// CryptoPayMap — English email templates (Owner / Community / Report)
// Actions:
//   - 'receipt'           -> user & ops (owner/community/report)
//   - 'approved'          -> user        (owner/community)
//   - 'rejected'          -> user        (owner/community)
//   - 'report_resolution' -> user        (report)
// Audience: 'user' | 'ops'

export type Kind = 'owner' | 'community' | 'report';
export type Action = 'receipt' | 'approved' | 'rejected' | 'report_resolution';
export type Audience = 'user' | 'ops';

export interface MailPayload {
  ref: string;
  when?: string;
  approved_on?: string;
  reviewed_on?: string;
  handled_on?: string;

  // business/place info (owner/community)
  Business?: string;
  Country?: string;
  City?: string;
  Category?: string;
  AcceptedRaw?: string;
  ImagesCount?: number;

  // community-only
  EvidenceCount?: number;

  // links
  public_url?: string;
  owner_verify_url?: string; // show to user & ops when available (owner only)

  // rejection
  reason?: string;
  needed_fields?: string;

  // report
  SubmitterName?: string;
  SubmitterEmail?: string;
  issue_type?: string;
  place_ref?: string;
  description?: string;
  images_count?: number;

  // resolution
  resolutionEN?: 'Resolved' | 'Rejected' | 'Duplicate';
  resolution_detail?: string;
}

export interface MailContent {
  subject: string;
  text: string; // plain text
}

const divider = '────────────────────────';
const footer =
  `${divider}
CryptoPayMap Operations Team
cryptopaymap.app@gmail.com`; // Footer: team label + ops email only

const kindEN = (k: Kind) =>
  k === 'owner' ? 'Owner Submission' : k === 'community' ? 'Community Submission' : 'Report';

function ensure(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function greetUser(p: MailPayload): string {
  const name = p.Business || p.SubmitterName || 'User';
  return `Dear ${name},`;
}

/* =========================
 * USER — OWNER/COMMUNITY
 * ========================= */
function ocUserReceipt(kind: Exclude<Kind, 'report'>, p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  // fix: avoid "Submission Submission"
  const subject = `[CryptoPayMap] ${kindEN(kind)} Received (Ref: ${p.ref})`;
  const lines = [
    greetUser(p),
    '',
    // slightly more natural phrasing
    `Thank you for your ${kindEN(kind)} to CryptoPayMap.`,
    'Your request has been received with the following details:',
    '',
    divider,
    `Reference ID: ${p.ref}`,
    `Submission Type: ${kindEN(kind)}`,
    `Received On: ${p.when ?? '—'}`,
    `Business Name: ${p.Business ?? '—'}`,
    `Location: ${p.Country ?? '—'} / ${p.City ?? '—'}`,
    `Category: ${p.Category ?? '—'}`,
    `Accepted Currencies: ${p.AcceptedRaw ?? '—'}`,
    `Image Count: ${p.ImagesCount ?? 0}`,
    kind === 'community' ? `Evidence Images: ${p.EvidenceCount ?? 0}` : null,
    kind === 'owner' && p.owner_verify_url ? `Owner Verification URL: ${p.owner_verify_url}` : null,
    divider,
    '',
    'Our team will review your submission. Once approved, it will appear on CryptoPayMap.',
    '',
    'This is an automated message. If you did not submit this request,',
    'please contact cryptopaymap.app@gmail.com.',
    '',
    footer,
  ].filter(Boolean) as string[];
  return { subject, text: lines.join('\n') };
}

function ocUserApproved(kind: Exclude<Kind, 'report'>, p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  const subject = `[CryptoPayMap] Your ${kindEN(kind)} Has Been Approved (Ref: ${p.ref})`;
  const lines = [
    greetUser(p),
    '',
    `Your ${kindEN(kind)} has been reviewed and approved. Details below:`,
    '',
    divider,
    `Reference ID: ${p.ref}`,
    `Approved On: ${p.approved_on ?? '—'}`,
    `Business Name: ${p.Business ?? '—'}`,
    `Location: ${p.Country ?? '—'} / ${p.City ?? '—'}`,
    `Category: ${p.Category ?? '—'}`,
    `Public URL: ${p.public_url ?? '—'}`,
    divider,
    '',
    'If you need to request corrections or updates, please submit a new request via the form.',
    '',
    footer,
  ];
  return { subject, text: lines.join('\n') };
}

function ocUserRejected(kind: Exclude<Kind, 'report'>, p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  const subject = `[CryptoPayMap] Your ${kindEN(kind)} Was Not Approved (Ref: ${p.ref})`;
  const lines = [
    greetUser(p),
    '',
    `After reviewing your ${kindEN(kind)}, we’re sorry to inform you it was not approved.`,
    '',
    divider,
    `Reference ID: ${p.ref}`,
    `Reviewed On: ${p.reviewed_on ?? '—'}`,
    `Reason: ${p.reason ?? '—'}`,
    `Required Fixes: ${p.needed_fields ?? '—'}`,
    divider,
    '',
    'Please correct the items above and resubmit your application via the form.',
    '',
    footer,
  ];
  return { subject, text: lines.join('\n') };
}

/* =========================
 * OPS — OWNER/COMMUNITY
 * ========================= */
function ocOpsReceipt(kind: Exclude<Kind, 'report'>, p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  const subject = `[OPS] New ${kind} submission received (${p.ref})`;
  const lines = [
    `Ref: ${p.ref}`,
    `When: ${p.when ?? '—'}`,
    `Submitter: ${p.SubmitterName ?? '—'}${p.SubmitterEmail ? ` <${p.SubmitterEmail}>` : ''}`,
    `Business/Place: ${p.Business ?? '—'}`,
    `Country/City: ${p.Country ?? '—'} / ${p.City ?? '—'}`,
    `Category: ${p.Category ?? '—'}`,
    `Accepted (raw): ${p.AcceptedRaw ?? '—'}`,
    `Images count: ${p.ImagesCount ?? 0}`,
    kind === 'owner' && p.owner_verify_url ? `Owner verification URL: ${p.owner_verify_url}` : null,
    kind === 'community' ? `Evidence count: ${p.EvidenceCount ?? 0}` : null,
  ].filter(Boolean) as string[];
  return { subject, text: lines.join('\n') };
}

/* =========================
 * USER — REPORT
 * ========================= */
function reportUserReceipt(p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  const subject = `[CryptoPayMap] Report Received (Ref: ${p.ref})`;
  const lines = [
    `Dear ${p.SubmitterName ?? 'User'},`,
    '',
    'We have received your report. Details below:',
    '',
    divider,
    `Reference ID: ${p.ref}`,
    `Received On: ${p.when ?? '—'}`,
    `Report Type: ${p.issue_type ?? '—'}`,
    `Target Place ID: ${p.place_ref ?? '—'}`,
    `Description: ${p.description ?? '—'}`,
    `Image Count: ${p.images_count ?? 0}`,
    divider,
    '',
    'Our team will review the issue and contact you if necessary.',
    '',
    footer,
  ];
  return { subject, text: lines.join('\n') };
}

/* =========================
 * OPS — REPORT
 * ========================= */
function reportOpsReceipt(p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  const subject = `[OPS] New report received (${p.ref})`;
  const lines = [
    `Ref: ${p.ref}`,
    `When: ${p.when ?? '—'}`,
    `Submitter: ${p.SubmitterName ?? '—'}${p.SubmitterEmail ? ` <${p.SubmitterEmail}>` : ''}`,
    `Issue: ${p.issue_type ?? '—'}`,
    `Target place_ref: ${p.place_ref ?? '—'}`,
    `Description: ${p.description ?? '—'}`,
    `Images count: ${p.images_count ?? 0}`,
  ];
  return { subject, text: lines.join('\n') };
}

/* =========================
 * USER — REPORT RESOLUTION
 * ========================= */
function reportUserResolution(p: MailPayload): MailContent {
  ensure(p.ref, 'ref required');
  const subject = `[CryptoPayMap] Report Resolution – ${p.resolutionEN ?? 'Resolved'} (Ref: ${p.ref})`;
  const lines = [
    `Dear ${p.SubmitterName ?? 'User'},`,
    '',
    `Your report (Ref: ${p.ref}) has been processed. Result below:`,
    '',
    divider,
    `Reference ID: ${p.ref}`,
    `Result: ${p.resolutionEN ?? 'Resolved'}`,
    `Handled On: ${p.handled_on ?? '—'}`,
    `Details: ${p.resolution_detail ?? '—'}`,
    `Related Page: ${p.public_url ?? '—'}`,
    divider,
    '',
    'Thank you for helping improve CryptoPayMap.',
    '',
    footer,
  ];
  return { subject, text: lines.join('\n') };
}

/* =========================
 * PUBLIC API
 * ========================= */
export function buildMail(
  audience: Audience,
  kind: Kind,
  action: Action,
  payload: MailPayload
): MailContent {
  // Compatibility guards
  if (action === 'approved' || action === 'rejected') {
    if (kind === 'report') throw new Error(`${action} is not valid for kind=report`);
    if (audience !== 'user') throw new Error(`${action} is only sent to user audience`);
  }
  if (action === 'report_resolution') {
    if (kind !== 'report') throw new Error('report_resolution is only valid for kind=report');
    if (audience !== 'user') throw new Error('report_resolution is only sent to user audience');
  }

  // Router
  if (kind === 'owner' || kind === 'community') {
    if (action === 'receipt') {
      return audience === 'ops'
        ? ocOpsReceipt(kind, payload)
        : ocUserReceipt(kind, payload);
    }
    if (action === 'approved') return ocUserApproved(kind, payload);
    if (action === 'rejected') return ocUserRejected(kind, payload);
  } else {
    // report
    if (action === 'receipt') {
      return audience === 'ops' ? reportOpsReceipt(payload) : reportUserReceipt(payload);
    }
    if (action === 'report_resolution') {
      return reportUserResolution(payload);
    }
  }

  throw new Error(`Unsupported combination: audience=${audience}, kind=${kind}, action=${action}`);
}

/* =========================
 * Example usage
 * =========================
 *
 * import { buildMail } from '@/lib/mailerTemplates';
 * import { sendMail } from '@/lib/mailer';
 *
 * // User (Owner) — receipt
 * const receiptUser = buildMail('user', 'owner', 'receipt', {
 *   ref: 'owner-20251021-0001',
 *   when: '2025-10-21 14:32:55 JST',
 *   Business: 'South Pole Coffee',
 *   Country: 'Antarctica',
 *   City: 'McMurdo Station',
 *   Category: 'Cafe',
 *   AcceptedRaw: 'BTC, USDT',
 *   ImagesCount: 2,
 *   owner_verify_url: 'https://…/verify/owner-20251021-0001' // optional
 * });
 * await sendMail({ to: submitterEmail, subject: receiptUser.subject, text: receiptUser.text });
 *
 * // OPS (Owner) — receipt
 * const receiptOps = buildMail('ops', 'owner', 'receipt', {
 *   ref: 'owner-20251021-0001',
 *   when: '2025-10-21 14:32:55 JST',
 *   Business: 'South Pole Coffee',
 *   Country: 'Antarctica',
 *   City: 'McMurdo Station',
 *   Category: 'Cafe',
 *   AcceptedRaw: 'BTC, USDT',
 *   ImagesCount: 2,
 *   SubmitterName: 'Alice',
 *   SubmitterEmail: 'owner@example.com',
 *   owner_verify_url: 'https://…/verify/owner-20251021-0001'
 * });
 * await sendMail({ to: 'cryptopaymap.app@gmail.com', subject: receiptOps.subject, text: receiptOps.text });
 */
