import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SuggestSubmissionIntake } from '../../submissions/suggest-contract';
import {
  browserSuggestValidationMessages,
  buildSuggestSubmissionIntakeFromBrowserForm,
  emptySuggestBrowserFormValues,
  type SuggestBrowserFormValues,
} from '../../submissions/suggest-browser-contract';
import { Button } from '../ui/Button';
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

export interface SuggestFormOption {
  value: string;
  label: string;
}

export interface SuggestFormProps {
  siteKey: string;
  action: string;
  assets: SuggestFormOption[];
  networks: SuggestFormOption[];
}

interface SuggestReceipt {
  submissionReference: string;
  statusSecret: string;
  submittedAt: string;
}

interface SuggestPublicError {
  error: string;
}

interface NativeSelectProps {
  id: string;
  label: string;
  value: string;
  options: SuggestFormOption[];
  placeholder?: string;
  optional?: boolean;
  onChange(value: string): void;
}

const relationshipOptions: SuggestFormOption[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'employee', label: 'Employee' },
  { value: 'owner_or_authorized_representative', label: 'Owner or authorized representative' },
  { value: 'payment_provider', label: 'Payment provider' },
  { value: 'independent_researcher', label: 'Independent researcher' },
  { value: 'other', label: 'Other' },
];

const routeOptions: SuggestFormOption[] = [
  { value: 'direct_wallet', label: 'Direct wallet' },
  { value: 'processor_checkout', label: 'Processor checkout' },
];

const paymentMethodOptions: SuggestFormOption[] = [
  { value: 'onchain', label: 'On-chain transfer' },
  { value: 'lightning_invoice', label: 'Lightning invoice' },
  { value: 'lightning_nfc', label: 'Lightning NFC' },
  { value: 'wallet_qr', label: 'Wallet QR code' },
  { value: 'processor_checkout', label: 'Processor checkout' },
  { value: 'pos_terminal', label: 'Crypto POS terminal' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment_link', label: 'Payment link' },
];

function NativeSelect({
  id,
  label,
  value,
  options,
  placeholder = 'Select an option',
  optional = false,
  onChange,
}: NativeSelectProps) {
  return (
    <FieldFrame id={id} label={label} optional={optional}>
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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function responseMessage(errorCode: string, retryAfter: string | null): string {
  switch (errorCode) {
    case 'suggest_rate_limited':
      return retryAfter
        ? `Too many attempts. Try again after about ${retryAfter} seconds.`
        : 'Too many attempts. Please try again later.';
    case 'suggest_request_conflict':
      return 'This request reference was already used with different content. Please submit again.';
    case 'suggest_request_too_large':
      return 'The submission is too large. Shorten the text or remove extra evidence detail.';
    case 'suggest_media_type_unsupported':
      return 'The submission could not be sent in the expected format. Please reload and try again.';
    case 'suggest_request_invalid':
      return 'Some submitted details were not accepted. Review the form and try again.';
    default:
      return 'The submission service is temporarily unavailable. Your public data was not changed.';
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

export function SuggestForm({ siteKey, action, assets, networks }: SuggestFormProps) {
  const [values, setValues] = useState<SuggestBrowserFormValues>(() =>
    emptySuggestBrowserFormValues(todayDate()),
  );
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeState, setChallengeState] = useState<'loading' | 'ready' | 'error'>(
    siteKey && action ? 'loading' : 'error',
  );
  const [messages, setMessages] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error' | 'success'>(
    'idle',
  );
  const [receipt, setReceipt] = useState<SuggestReceipt | null>(null);
  const [submitError, setSubmitError] = useState('');
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const update = <Key extends keyof SuggestBrowserFormValues>(
    key: Key,
    value: SuggestBrowserFormValues[Key],
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

    let submission: SuggestSubmissionIntake;
    try {
      submission = buildSuggestSubmissionIntakeFromBrowserForm(values);
    } catch (error) {
      setMessages(browserSuggestValidationMessages(error));
      setSubmitState('error');
      setSubmitError('Review the highlighted requirements before submitting.');
      return;
    }

    requestIdRef.current ??= crypto.randomUUID();
    setSubmitState('submitting');

    try {
      const response = await fetch('/api/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdRef.current,
        },
        body: JSON.stringify({ challengeToken, submission }),
      });
      const responseBody = (await response.json()) as SuggestReceipt | SuggestPublicError;

      if (response.status === 202 && 'submissionReference' in responseBody) {
        setReceipt(responseBody);
        setSubmitState('success');
        return;
      }

      const errorCode = 'error' in responseBody ? responseBody.error : 'suggest_unavailable';
      setSubmitState('error');
      setSubmitError(responseMessage(errorCode, response.headers.get('Retry-After')));
      if (response.status === 409) requestIdRef.current = null;
      resetChallenge();
    } catch {
      setSubmitState('error');
      setSubmitError('The request could not reach the submission service. Please try again.');
      resetChallenge();
    }
  }

  if (receipt) {
    return (
      <StatePanel
        tone="success"
        title="Suggestion received"
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

  const isPhysical = values.suggestionKind === 'physical_place';
  const processorRoute = values.routeType === 'processor_checkout';
  const configurationUnavailable = !siteKey || !action;
  const step = (physical: string, online: string) => (isPhysical ? physical : online);

  return (
    <form className="grid gap-8" onSubmit={submit} noValidate>
      <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div>
          <p className="m-0 text-sm font-semibold text-brand-700">1. What are you suggesting?</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Business or service</h2>
        </div>
        <NativeSelect
          id="suggestion-kind"
          label="Suggestion type"
          value={values.suggestionKind}
          options={[
            { value: 'physical_place', label: 'Physical place' },
            { value: 'online_service', label: 'Online service' },
          ]}
          onChange={(value) =>
            update('suggestionKind', value as SuggestBrowserFormValues['suggestionKind'])
          }
        />
        <TextField
          id="business-name"
          label="Name"
          value={values.name}
          maxLength={160}
          autoComplete="organization"
          onChange={(event) => update('name', event.currentTarget.value)}
        />
        <TextField
          id="website-url"
          label="Official HTTPS website"
          hint={
            isPhysical ? 'Optional, but useful for verification.' : 'Required for online services.'
          }
          optional={isPhysical}
          type="url"
          value={values.websiteUrl}
          onChange={(event) => update('websiteUrl', event.currentTarget.value)}
        />
        <TextField
          id="country-code"
          label="Country code"
          hint="Two-letter ISO code, for example JP or US."
          value={values.countryCode}
          maxLength={2}
          autoCapitalize="characters"
          onChange={(event) => update('countryCode', event.currentTarget.value)}
        />
      </section>

      {isPhysical ? (
        <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div>
            <p className="m-0 text-sm font-semibold text-brand-700">2. Place details</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Where is it?</h2>
          </div>
          <TextField
            id="address-line"
            label="Street address"
            hint="An address is required in this form version."
            value={values.addressLine}
            maxLength={500}
            autoComplete="street-address"
            onChange={(event) => update('addressLine', event.currentTarget.value)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id="locality"
              label="City or locality"
              optional
              value={values.locality}
              maxLength={120}
              autoComplete="address-level2"
              onChange={(event) => update('locality', event.currentTarget.value)}
            />
            <TextField
              id="region"
              label="Region or state"
              optional
              value={values.region}
              maxLength={120}
              autoComplete="address-level1"
              onChange={(event) => update('region', event.currentTarget.value)}
            />
          </div>
          <TextField
            id="postal-code"
            label="Postal code"
            optional
            value={values.postalCode}
            maxLength={32}
            autoComplete="postal-code"
            onChange={(event) => update('postalCode', event.currentTarget.value)}
          />
        </section>
      ) : null}

      <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div>
          <p className="m-0 text-sm font-semibold text-brand-700">
            {step('3', '2')}. Payment details
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">How can someone pay?</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Unknown details may be left blank, but at least one concrete payment detail is required.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <NativeSelect
            id="asset"
            label="Asset"
            optional
            options={assets}
            placeholder="Unknown"
            value={values.assetSlug}
            onChange={(value) => update('assetSlug', value)}
          />
          <NativeSelect
            id="network"
            label="Network"
            optional
            options={networks}
            placeholder="Unknown"
            value={values.networkSlug}
            onChange={(value) => update('networkSlug', value)}
          />
          <NativeSelect
            id="route-type"
            label="Payment route"
            optional
            options={routeOptions}
            placeholder="Unknown"
            value={values.routeType}
            onChange={(value) =>
              update('routeType', value as SuggestBrowserFormValues['routeType'])
            }
          />
          <NativeSelect
            id="payment-method"
            label="Payment method"
            optional
            options={paymentMethodOptions}
            placeholder="Unknown"
            value={values.paymentMethod}
            onChange={(value) =>
              update('paymentMethod', value as SuggestBrowserFormValues['paymentMethod'])
            }
          />
        </div>
        {processorRoute ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id="processor-name"
              label="Payment processor"
              value={values.processorName}
              maxLength={160}
              onChange={(event) => update('processorName', event.currentTarget.value)}
            />
            <TextField
              id="processor-url"
              label="Processor website"
              optional
              type="url"
              value={values.processorWebsiteUrl}
              onChange={(event) => update('processorWebsiteUrl', event.currentTarget.value)}
            />
          </div>
        ) : null}
        <FieldFrame
          id="how-to-pay"
          label="How to pay"
          hint="Describe what the customer selects, scans, or asks staff to do."
          optional
        >
          <textarea
            id="how-to-pay"
            className="min-h-28 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink shadow-sm placeholder:text-muted/70 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-50"
            value={values.howToPay}
            maxLength={1_000}
            onChange={(event) => update('howToPay', event.currentTarget.value)}
          />
        </FieldFrame>
        <TextField
          id="restrictions"
          label="Restrictions"
          hint="For example: selected plans, region limits, minimum amount, or new purchases only."
          optional
          value={values.restrictions}
          maxLength={1_000}
          onChange={(event) => update('restrictions', event.currentTarget.value)}
        />
        <TextField
          id="category-slug"
          label="Category slug"
          hint="Optional lowercase category, for example cafe, vpn, hosting, or travel."
          optional
          value={values.categorySlug}
          maxLength={64}
          onChange={(event) => update('categorySlug', event.currentTarget.value)}
        />
        <TextField
          id="observed-at"
          label="When did you observe this?"
          type="date"
          value={values.observedAt}
          onChange={(event) => update('observedAt', event.currentTarget.value)}
        />
      </section>

      <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div>
          <p className="m-0 text-sm font-semibold text-brand-700">
            {step('4', '3')}. Evidence and contact
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Help reviewers verify it</h2>
        </div>
        <TextField
          id="evidence-url"
          label="Evidence URL"
          hint="Use a public HTTP or HTTPS page that supports the payment claim."
          optional
          type="url"
          value={values.evidenceUrl}
          onChange={(event) => update('evidenceUrl', event.currentTarget.value)}
        />
        <TextField
          id="evidence-summary"
          label="Evidence summary"
          optional
          value={values.evidenceSummary}
          maxLength={1_000}
          onChange={(event) => update('evidenceSummary', event.currentTarget.value)}
        />
        <NativeSelect
          id="relationship"
          label="Your relationship to this business or service"
          options={relationshipOptions}
          value={values.relationship}
          onChange={(value) =>
            update('relationship', value as SuggestBrowserFormValues['relationship'])
          }
        />
        <TextField
          id="contact-email"
          label="Contact email"
          hint="Optional. Stored privately and never placed in public export data."
          optional
          type="email"
          autoComplete="email"
          value={values.contactEmail}
          onChange={(event) => update('contactEmail', event.currentTarget.value)}
        />
        {values.contactEmail.trim() ? (
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-ink">
            <input
              className="mt-1 size-5"
              type="checkbox"
              checked={values.contactAllowed}
              onChange={(event) => update('contactAllowed', event.currentTarget.checked)}
            />
            CryptoPayMap may contact me about this submission.
          </label>
        ) : null}
      </section>

      <section className="grid gap-5 rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div>
          <p className="m-0 text-sm font-semibold text-brand-700">
            {step('5', '4')}. Review and submit
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Confirm the submission terms</h2>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 size-5"
            type="checkbox"
            checked={values.privacyNoticeAccepted}
            onChange={(event) => update('privacyNoticeAccepted', event.currentTarget.checked)}
          />
          I have read the{' '}
          <a className="font-semibold text-brand-700" href="/privacy">
            Privacy notice
          </a>
          .
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 size-5"
            type="checkbox"
            checked={values.submissionTermsAccepted}
            onChange={(event) => update('submissionTermsAccepted', event.currentTarget.checked)}
          />
          I agree to the{' '}
          <a className="font-semibold text-brand-700" href="/terms">
            submission terms
          </a>{' '}
          and understand that submissions are reviewed before public data changes.
        </label>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Verification</p>
          <div
            ref={turnstileContainerRef}
            className="min-h-16 w-full overflow-hidden rounded-control"
          />
          {challengeState === 'loading' ? (
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              Loading verification…
            </p>
          ) : null}
          {challengeState === 'error' ? (
            <p className="mt-2 text-sm font-medium text-danger" role="alert">
              Verification is unavailable. Reload the page or try again later.
            </p>
          ) : null}
        </div>

        {messages.length > 0 ? (
          <div className="rounded-control border border-danger/30 bg-danger/5 p-4" role="alert">
            <p className="m-0 font-semibold text-danger">Check these details</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {submitError ? (
          <p
            className="m-0 rounded-control border border-danger/30 bg-danger/5 p-4 text-sm font-medium text-danger"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          loading={submitState === 'submitting'}
          disabled={
            configurationUnavailable || challengeState === 'error' || challengeToken === null
          }
        >
          Submit suggestion
        </Button>
        <p className="m-0 text-xs leading-5 text-muted">
          A submission creates private review material only. It does not automatically publish or
          change a CryptoPayMap record.
        </p>
      </section>
    </form>
  );
}
