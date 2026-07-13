import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  browserReportValidationMessages,
  buildReportSubmissionIntakeFromBrowserForm,
  emptyReportBrowserFormValues,
  type ReportBrowserFormValues,
  type ReportSubmissionIntake,
} from '../../submissions/report-browser-contract';
import { StatePanel } from '../ui/StatePanel';
import { FormSection, type ReportFormOption } from './ReportFormControls';
import {
  EvidenceAndContactFields,
  PaymentReportFields,
  ProblemReportFields,
  ReportTargetFields,
} from './ReportFormFields';

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

export type { ReportFormOption } from './ReportFormControls';

export interface ReportFormProps {
  submissionType: ReportBrowserFormValues['submissionType'];
  siteKey: string;
  action: string;
  assets: ReportFormOption[];
  networks: ReportFormOption[];
  initialTargetType?: ReportBrowserFormValues['targetType'] | undefined;
  initialTargetId?: string | undefined;
}

interface ReportReceipt {
  submissionReference: string;
  statusSecret: string;
  submittedAt: string;
}

interface ReportPublicError {
  error: string;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function responseMessage(errorCode: string, retryAfter: string | null): string {
  if (errorCode === 'report_rate_limited') {
    return retryAfter
      ? `Too many attempts. Try again after about ${retryAfter} seconds.`
      : 'Too many attempts. Please try again later.';
  }
  if (errorCode === 'report_request_conflict') {
    return 'This request reference was already used with different content. Please submit again.';
  }
  if (errorCode === 'report_request_too_large') {
    return 'The report is too large. Shorten the text or remove extra evidence detail.';
  }
  if (errorCode === 'report_media_type_unsupported') {
    return 'The report could not be sent in the expected format. Please reload and try again.';
  }
  if (errorCode === 'report_request_invalid') {
    return 'Some submitted details were not accepted. Review the form and try again.';
  }
  return 'The report service is temporarily unavailable. Public data was not changed.';
}

function loadTurnstileScript(onReady: () => void, onError: () => void): () => void {
  if (window.turnstile) {
    onReady();
    return () => {};
  }

  let script = document.getElementById(turnstileScriptId) as HTMLScriptElement | null;
  if (script === null) {
    script = document.createElement('script');
    script.id = turnstileScriptId;
    script.src = turnstileScriptUrl;
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }

  const handleLoad = () => onReady();
  const handleError = () => onError();
  script.addEventListener('load', handleLoad);
  script.addEventListener('error', handleError);
  return () => {
    script?.removeEventListener('load', handleLoad);
    script?.removeEventListener('error', handleError);
  };
}

export function ReportForm({
  submissionType,
  siteKey,
  action,
  assets,
  networks,
  initialTargetType = 'entity',
  initialTargetId = '',
}: ReportFormProps) {
  const [values, setValues] = useState<ReportBrowserFormValues>(() => {
    const initialValues = emptyReportBrowserFormValues(
      todayDate(),
      initialTargetType,
      initialTargetId,
    );
    initialValues.submissionType = submissionType;
    return initialValues;
  });
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeState, setChallengeState] = useState<'loading' | 'ready' | 'error'>(
    siteKey && action ? 'loading' : 'error',
  );
  const [messages, setMessages] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error'>('idle');
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
    setSubmitError('');
    if (submitState === 'error') setSubmitState('idle');
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

  const formLabel = submissionType === 'payment_report' ? 'Payment report' : 'Problem report';

  if (receipt) {
    return (
      <StatePanel
        tone="success"
        title={`${formLabel} received`}
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

  const fieldProps = { values, assets, networks, update };
  return (
    <form className="grid gap-8" onSubmit={submit} noValidate>
      <ReportTargetFields {...fieldProps} />
      {submissionType === 'payment_report' ? (
        <PaymentReportFields {...fieldProps} />
      ) : (
        <ProblemReportFields {...fieldProps} />
      )}
      <EvidenceAndContactFields {...fieldProps} />
      <FormSection eyebrow="4. Review and submit" title="Confirm the private review terms">
        <label className="flex items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={values.privacyNoticeAccepted}
            onChange={(event) => update('privacyNoticeAccepted', event.currentTarget.checked)}
          />
          I have read the privacy notice and understand that the report remains private until
          reviewed.
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
        <div ref={turnstileContainerRef} className="min-h-16" />
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
          {submitState === 'submitting' ? `Submitting ${formLabel.toLowerCase()}…` : `Submit ${formLabel.toLowerCase()} for review`}
        </button>
        <p className="m-0 text-sm leading-6 text-muted">
          A report never changes public data automatically. Review, Evidence decisions, Claim
          changes, canonical correction, export, and publication remain separate operations.
        </p>
      </FormSection>
    </form>
  );
}
