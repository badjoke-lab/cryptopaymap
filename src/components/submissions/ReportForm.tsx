import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  browserReportValidationMessages,
  buildReportSubmissionIntakeFromBrowserForm,
  emptyReportBrowserFormValues,
  type ReportBrowserFormValues,
  type ReportSubmissionIntake,
} from '../../submissions/report-browser-contract';
import { FieldFrame, TextField } from '../ui/Field';
import { StatePanel } from '../ui/StatePanel';

const turnstileScriptId = 'cpm-turnstile-api';
const turnstileScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  theme: 'light';
  size: 'flexible';
  callback(token: string): void;
  'error-callback'(): void;
  'expired-callback'(): void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface ReportFormOption {
  value: string;
  label: string;
}

export interface ReportFormProps {
  siteKey: string;
  action: string;
  assets: ReportFormOption[];
  networks: ReportFormOption[];
  initialTargetType?: ReportBrowserFormValues['targetType'];
  initialTargetId?: string;
}

interface ReportReceipt {
  submissionReference: string;
  statusSecret: string;
  submittedAt: string;
}

interface ReportPublicError {
  error: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: ReportFormOption[];
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  onChange(value: string): void;
}

function SelectField({
  id,
  label,
  value,
  options,
  placeholder = 'Select an option',
  optional = false,
  hint,
  onChange,
}: SelectFieldProps) {
  return (
    <FieldFrame id={id} label={label} optional={optional} hint={hint}>
      <select
        id={id}
        className="min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink shadow-sm focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-50"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  optional?: boolean;
  hint?: string;
  rows?: number;
  onChange(value: string): void;
}

function TextAreaField({
  id,
  label,
  value,
  maxLength,
  optional = false,
  hint,
  rows = 4,
  onChange,
}: TextAreaFieldProps) {
  return (
    <FieldFrame id={id} label={label} optional={optional} hint={hint}>
      <textarea
        id={id}
        className="w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink shadow-sm focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-50"
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FieldFrame>
  );
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function responseMessage(errorCode: string, retryAfter: string | null): string {
  switch (errorCode) {
    case 'report_rate_limited':
      return retryAfter
        ? `Too many attempts. Try again after about ${retryAfter} seconds.`
        : 'Too many attempts. Please try again later.';
    case 'report_request_conflict':
      return 'This request reference was already used with different content. Please submit again.';
    case 'report_request_too_large':
      return 'The report is too large. Shorten the text or remove extra evidence detail.';
    case 'report_media_type_unsupported':
      return 'The report could not be sent in the expected format. Please reload and try again.';
    case 'report_request_invalid':
      return 'Some submitted details were not accepted. Review the form and try again.';
    default:
      return 'The report service is temporarily unavailable. Public data was not changed.';
  }
}

function loadTurnstileScript(onReady: () => void, onError: () => void): () => void {
  if (window.turnstile) {
    onReady();
    return () => {};
  }

  let script = document.getElementById(turnstileScriptId) as HTMLScriptElement | null;
  const handleLoad = () => onReady();
  const handleError = () => onError();

  if (script === null) {
    script = document.createElement('script');
    script.id = turnstileScriptId;
    script.src = turnstileScriptUrl;
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }

  script.addEventListener('load', handleLoad);
  script.addEventListener('error', handleError);
  return () => {
    script?.removeEventListener('load', handleLoad);
    script?.removeEventListener('error', handleError);
  };
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div>
        <p className="m-0 text-sm font-semibold text-brand-700">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

const targetTypeOptions: ReportFormOption[] = [
  { value: 'entity', label: 'Business or online service' },
  { value: 'location', label: 'Specific place or branch' },
  { value: 'claim', label: 'Specific payment acceptance claim' },
];

const reportKindOptions: ReportFormOption[] = [
  { value: 'payment_report', label: 'Payment result report' },
  { value: 'problem_report', label: 'Problem or correction report' },
];

const paymentResultOptions: ReportFormOption[] = [
  { value: 'successful', label: 'Payment succeeded' },
  { value: 'failed', label: 'Payment failed' },
];

const routeOptions: ReportFormOption[] = [
  { value: 'direct_wallet', label: 'Direct wallet' },
  { value: 'processor_checkout', label: 'Processor checkout' },
];

const paymentMethodOptions: ReportFormOption[] = [
  { value: 'onchain', label: 'On-chain transfer' },
  { value: 'lightning_invoice', label: 'Lightning invoice' },
  { value: 'lightning_nfc', label: 'Lightning NFC' },
  { value: 'wallet_qr', label: 'Wallet QR code' },
  { value: 'processor_checkout', label: 'Processor checkout' },
  { value: 'pos_terminal', label: 'Crypto POS terminal' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_link', label: 'Payment link' },
];

const paymentContextOptions: ReportFormOption[] = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'qr_code', label: 'QR code' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_link', label: 'Payment link' },
  { value: 'hosted_checkout', label: 'Hosted checkout' },
  { value: 'other', label: 'Other' },
];

const problemTypeOptions: ReportFormOption[] = [
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

export function ReportForm({
  siteKey,
  action,
  assets,
  networks,
  initialTargetType = 'entity',
  initialTargetId = '',
}: ReportFormProps) {
  const [values, setValues] = useState<ReportBrowserFormValues>(() =>
    emptyReportBrowserFormValues(todayDate(), initialTargetType, initialTargetId),
  );
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeState, setChallengeState] = useState<'loading' | 'ready' | 'error'>(
    siteKey && action ? 'loading' : 'error',
  );
  const [messages, setMessages] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error' | 'success'>(
    'idle',
  );
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [submitError, setSubmitError] = useState('');
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const update = <Key extends keyof ReportBrowserFormValues>(
    key: Key,
    value: ReportBrowserFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setMessages([]);
    if (submitState === 'error') {
      setSubmitState('idle');
      setSubmitError('');
    }
  };

  useEffect(() => {
    if (!siteKey || !action) {
      setChallengeState('error');
      return;
    }

    let active = true;
    const render = () => {
      if (!active || !window.turnstile || !turnstileContainerRef.current) return;
      if (widgetIdRef.current !== null) return;
      try {
        widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          size: 'flexible',
          callback(token) {
            if (!active) return;
            setChallengeToken(token);
            setChallengeState('ready');
          },
          'error-callback'() {
            if (!active) return;
            setChallengeToken(null);
            setChallengeState('error');
          },
          'expired-callback'() {
            if (!active) return;
            setChallengeToken(null);
            setChallengeState('ready');
          },
        });
        setChallengeState('ready');
      } catch {
        setChallengeState('error');
      }
    };

    const cleanupScript = loadTurnstileScript(render, () => {
      if (active) setChallengeState('error');
    });

    return () => {
      active = false;
      cleanupScript();
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, siteKey]);

  const resetChallenge = () => {
    setChallengeToken(null);
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessages([]);
    setSubmitError('');

    if (challengeToken === null) {
      setSubmitState('error');
      setSubmitError('Complete the verification challenge before submitting.');
      return;
    }

    let submission: ReportSubmissionIntake;
    try {
      submission = buildReportSubmissionIntakeFromBrowserForm(values);
    } catch (error) {
      setMessages(browserReportValidationMessages(error));
      setSubmitState('error');
      setSubmitError('Review the requirements before submitting.');
      return;
    }

    requestIdRef.current ??= crypto.randomUUID();
    setSubmitState('submitting');

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdRef.current,
        },
        body: JSON.stringify({ challengeToken, submission }),
      });
      const responseBody = (await response.json()) as ReportReceipt | ReportPublicError;

      if (response.status === 202 && 'submissionReference' in responseBody) {
        setReceipt(responseBody);
        setSubmitState('success');
        return;
      }

      const errorCode = 'error' in responseBody ? responseBody.error : 'report_unavailable';
      setSubmitState('error');
      setSubmitError(responseMessage(errorCode, response.headers.get('Retry-After')));
      if (response.status === 409) requestIdRef.current = null;
      resetChallenge();
    } catch {
      setSubmitState('error');
      setSubmitError('The request could not reach the report service. Please try again.');
      resetChallenge();
    }
  }

  if (receipt) {
    return (
      <StatePanel
        tone="success"
        title="Report received"
        description="Save both values below. The status secret is shown only in this receipt and is needed for private follow-up."
        action={
          <div className="grid gap-3 text-left">
            <p className="m-0 text-sm text-muted">Submission reference</p>
            <code className="break-all rounded-control bg-canvas px-3 py-2 text-sm text-ink">
              {receipt.submissionReference}
            </code>
            <p className="m-0 text-sm text-muted">Status secret</p>
            <code className="break-all rounded-control bg-canvas px-3 py-2 text-sm text-ink">
              {receipt.statusSecret}
            </code>
          </div>
        }
      />
    );
  }

  const isPayment = values.submissionType === 'payment_report';
  const processorRoute = values.routeType === 'processor_checkout';
  const isDuplicate = values.problemType === 'duplicate';
  const isWrongAddress = values.problemType === 'wrong_address';
  const correctionLabel =
    values.problemType === 'wrong_asset'
      ? 'Correct asset slug'
      : values.problemType === 'wrong_network'
        ? 'Correct network slug'
        : values.problemType === 'wrong_instructions'
          ? 'Correct payment instructions'
          : 'Proposed correction';
  const showSimpleCorrection = [
    'wrong_asset',
    'wrong_network',
    'wrong_instructions',
    'other',
  ].includes(values.problemType);

  return (
    <form className="grid gap-8" onSubmit={submit} noValidate>
      <Section eyebrow="1. Target" title="What record are you reporting?">
        <SelectField
          id="report-target-type"
          label="Target type"
          value={values.targetType}
          options={targetTypeOptions}
          onChange={(value) => update('targetType', value as ReportBrowserFormValues['targetType'])}
        />
        <TextField
          id="report-target-id"
          label="Target UUID"
          value={values.targetId}
          maxLength={64}
          required
          hint="Use the identifier from the CryptoPayMap record or report link."
          onChange={(event) => update('targetId', event.currentTarget.value)}
        />
        <SelectField
          id="report-kind"
          label="Report type"
          value={values.submissionType}
          options={reportKindOptions}
          onChange={(value) =>
            update('submissionType', value as ReportBrowserFormValues['submissionType'])
          }
        />
      </Section>

      {isPayment ? (
        <Section eyebrow="2. Payment" title="Describe the payment result">
          <SelectField
            id="payment-result"
            label="Result"
            value={values.paymentResult}
            options={paymentResultOptions}
            onChange={(value) =>
              update('paymentResult', value as ReportBrowserFormValues['paymentResult'])
            }
          />
          <TextField
            id="payment-date"
            label="Payment date"
            type="date"
            value={values.paymentDate}
            required
            onChange={(event) => update('paymentDate', event.currentTarget.value)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="payment-asset"
              label="Asset"
              value={values.assetSlug}
              options={assets}
              optional
              onChange={(value) => update('assetSlug', value)}
            />
            <SelectField
              id="payment-network"
              label="Network"
              value={values.networkSlug}
              options={networks}
              optional
              onChange={(value) => update('networkSlug', value)}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="payment-route"
              label="Route"
              value={values.routeType}
              options={routeOptions}
              optional
              onChange={(value) =>
                update('routeType', value as ReportBrowserFormValues['routeType'])
              }
            />
            <SelectField
              id="payment-method"
              label="Method"
              value={values.paymentMethod}
              options={paymentMethodOptions}
              optional
              onChange={(value) =>
                update('paymentMethod', value as ReportBrowserFormValues['paymentMethod'])
              }
            />
          </div>
          {processorRoute ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="processor-name"
                label="Processor name"
                value={values.processorName}
                maxLength={160}
                required
                onChange={(event) => update('processorName', event.currentTarget.value)}
              />
              <TextField
                id="processor-url"
                label="Processor website"
                type="url"
                value={values.processorWebsiteUrl}
                maxLength={2_048}
                optional
                onChange={(event) => update('processorWebsiteUrl', event.currentTarget.value)}
              />
            </div>
          ) : null}
          <SelectField
            id="payment-context"
            label="Payment context"
            value={values.paymentContext}
            options={paymentContextOptions}
            optional
            onChange={(value) =>
              update('paymentContext', value as ReportBrowserFormValues['paymentContext'])
            }
          />
          <TextAreaField
            id="observed-steps"
            label="What happened?"
            value={values.observedSteps}
            maxLength={2_000}
            optional
            hint="Describe the concrete steps, error, confirmation, or merchant response."
            onChange={(value) => update('observedSteps', value)}
          />
          <TextField
            id="private-transaction-url"
            label="Private transaction or receipt URL"
            type="url"
            value={values.privateTransactionUrl}
            maxLength={2_048}
            optional
            hint="Stored for protected review only. Do not use a link that exposes secrets publicly."
            onChange={(event) => update('privateTransactionUrl', event.currentTarget.value)}
          />
          <TextAreaField
            id="payment-notes"
            label="Additional notes"
            value={values.paymentNotes}
            maxLength={2_000}
            optional
            onChange={(value) => update('paymentNotes', value)}
          />
        </Section>
      ) : (
        <Section eyebrow="2. Problem" title="Describe the incorrect or problematic information">
          <SelectField
            id="problem-type"
            label="Problem category"
            value={values.problemType}
            options={problemTypeOptions}
            onChange={(value) =>
              update('problemType', value as ReportBrowserFormValues['problemType'])
            }
          />
          <TextField
            id="problem-observed-at"
            label="Observed date"
            type="date"
            value={values.problemObservedAt}
            required
            onChange={(event) => update('problemObservedAt', event.currentTarget.value)}
          />
          <TextAreaField
            id="problem-explanation"
            label="Explanation"
            value={values.explanation}
            maxLength={5_000}
            hint="State what is wrong, what you observed, and why the current record should be reviewed."
            onChange={(value) => update('explanation', value)}
          />
          {showSimpleCorrection ? (
            <TextAreaField
              id="correction-value"
              label={correctionLabel}
              value={values.correctionValue}
              maxLength={5_000}
              optional
              onChange={(value) => update('correctionValue', value)}
            />
          ) : null}
          {isWrongAddress ? (
            <div className="grid gap-5 rounded-control border border-border bg-canvas p-4">
              <p className="m-0 text-sm font-semibold text-ink">Proposed profile correction</p>
              <TextField
                id="correct-address"
                label="Address"
                value={values.addressLine}
                maxLength={500}
                optional
                onChange={(event) => update('addressLine', event.currentTarget.value)}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  id="correct-locality"
                  label="Locality"
                  value={values.locality}
                  maxLength={120}
                  optional
                  onChange={(event) => update('locality', event.currentTarget.value)}
                />
                <TextField
                  id="correct-region"
                  label="Region"
                  value={values.region}
                  maxLength={120}
                  optional
                  onChange={(event) => update('region', event.currentTarget.value)}
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  id="correct-postal-code"
                  label="Postal code"
                  value={values.postalCode}
                  maxLength={32}
                  optional
                  onChange={(event) => update('postalCode', event.currentTarget.value)}
                />
                <TextField
                  id="correct-country-code"
                  label="Country code"
                  value={values.countryCode}
                  maxLength={2}
                  optional
                  onChange={(event) => update('countryCode', event.currentTarget.value)}
                />
              </div>
              <TextField
                id="correct-website"
                label="Website"
                type="url"
                value={values.websiteUrl}
                maxLength={2_048}
                optional
                onChange={(event) => update('websiteUrl', event.currentTarget.value)}
              />
              <TextField
                id="correct-phone"
                label="Phone"
                value={values.phone}
                maxLength={64}
                optional
                onChange={(event) => update('phone', event.currentTarget.value)}
              />
              <TextAreaField
                id="correct-description"
                label="Description"
                value={values.description}
                maxLength={5_000}
                optional
                onChange={(value) => update('description', value)}
              />
              <TextAreaField
                id="correct-opening-hours"
                label="Opening hours"
                value={values.openingHours}
                maxLength={2_000}
                optional
                onChange={(value) => update('openingHours', value)}
              />
            </div>
          ) : null}
          {isDuplicate ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id="duplicate-target-type"
                label="Duplicate of target type"
                value={values.duplicateTargetType}
                options={targetTypeOptions}
                onChange={(value) =>
                  update(
                    'duplicateTargetType',
                    value as ReportBrowserFormValues['duplicateTargetType'],
                  )
                }
              />
              <TextField
                id="duplicate-target-id"
                label="Duplicate of target UUID"
                value={values.duplicateTargetId}
                maxLength={64}
                required
                onChange={(event) => update('duplicateTargetId', event.currentTarget.value)}
              />
            </div>
          ) : null}
          <TextField
            id="private-evidence-url"
            label="Restricted evidence URL"
            type="url"
            value={values.privateEvidenceUrl}
            maxLength={2_048}
            optional
            hint="Stored for protected review only. Strongly recommended for closure, privacy, or rights reports."
            onChange={(event) => update('privateEvidenceUrl', event.currentTarget.value)}
          />
        </Section>
      )}

      <Section eyebrow="3. Evidence and follow-up" title="Add supporting information">
        <TextField
          id="public-evidence-url"
          label="Public evidence URL"
          type="url"
          value={values.evidenceUrl}
          maxLength={2_048}
          optional
          hint="Use a public source that reviewers may inspect. Do not include private account links."
          onChange={(event) => update('evidenceUrl', event.currentTarget.value)}
        />
        <TextAreaField
          id="evidence-summary"
          label="Evidence summary"
          value={values.evidenceSummary}
          maxLength={1_000}
          optional
          onChange={(value) => update('evidenceSummary', value)}
        />
        <TextField
          id="contact-email"
          label="Contact email"
          type="email"
          value={values.contactEmail}
          maxLength={320}
          optional
          hint="Stored privately. Reviewers can contact you only when permission is checked below."
          onChange={(event) => update('contactEmail', event.currentTarget.value)}
        />
        <label className="flex items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={values.contactAllowed}
            onChange={(event) => update('contactAllowed', event.currentTarget.checked)}
          />
          Reviewers may contact me about this report.
        </label>
      </Section>

      <Section eyebrow="4. Review and submit" title="Confirm the private review terms">
        <label className="flex items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={values.privacyNoticeAccepted}
            onChange={(event) => update('privacyNoticeAccepted', event.currentTarget.checked)}
          />
          I have read the privacy notice and understand that the report remains private until reviewed.
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={values.submissionTermsAccepted}
            onChange={(event) => update('submissionTermsAccepted', event.currentTarget.checked)}
          />
          I accept the submission terms and confirm that this report is made in good faith.
        </label>
        <div ref={turnstileContainerRef} className="min-h-16" aria-label="Verification challenge" />
        {challengeState === 'error' ? (
          <p className="m-0 text-sm font-medium text-danger" role="alert">
            Verification is unavailable. Reload the page or try again later.
          </p>
        ) : null}
        {messages.length > 0 ? (
          <ul className="m-0 grid gap-1 pl-5 text-sm text-danger" role="alert">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        {submitError ? (
          <p className="m-0 text-sm font-medium text-danger" role="alert">
            {submitError}
          </p>
        ) : null}
        <button
          type="submit"
          className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitState === 'submitting' || challengeState === 'error'}
        >
          {submitState === 'submitting' ? 'Submitting report…' : 'Submit report for review'}
        </button>
        <p className="m-0 text-sm leading-6 text-muted">
          A report never changes public data automatically. Review, Evidence decisions, Claim changes, canonical correction, export, and publication remain separate operations.
        </p>
      </Section>
    </form>
  );
}
