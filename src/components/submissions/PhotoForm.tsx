import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  browserPhotoValidationMessages,
  buildPhotosSubmissionIntakeFromBrowserForm,
  buildPhotoUploadAuthorizationFromBrowserForm,
  emptyPhotoBrowserFormValues,
  parsePhotoUploadReceipt,
  type PhotoBrowserFormValues,
  type PhotoBrowserMediaValues,
  type PhotoSubmissionIntake,
  type PhotoUploadAuthorization,
  type PhotoUploadedReservation,
} from '../../submissions/photo-browser-contract';
import { StatePanel } from '../ui/StatePanel';

const turnstileScriptId = 'cpm-turnstile-api';
const turnstileScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const acceptedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const maximumFiles = 8;
const maximumFileBytes = 5_000_000;
const maximumTotalBytes = 40_000_000;

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

interface PhotoReceipt {
  submissionReference: string;
  statusSecret: string;
  submittedAt: string;
}

interface PhotoPublicError {
  error: string;
}

interface PhotoFormProps {
  siteKey: string;
  action: string;
  initialTargetType?: PhotoBrowserFormValues['targetType'] | undefined;
  initialTargetId?: string | undefined;
}

type FlowState = 'idle' | 'authorizing' | 'uploading' | 'uploaded' | 'submitting' | 'error';

const roleOptions: Array<{ value: PhotoBrowserMediaValues['role']; label: string }> = [
  { value: 'cover', label: 'Cover' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'product', label: 'Product' },
  { value: 'menu', label: 'Menu' },
  { value: 'payment_sign', label: 'Payment sign' },
  { value: 'checkout_terminal', label: 'Checkout terminal' },
];

function getTurnstile(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function loadTurnstileScript(onReady: () => void, onError: () => void): () => void {
  if (getTurnstile()) {
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

function errorMessage(errorCode: string, retryAfter: string | null): string {
  if (errorCode === 'photo_rate_limited') {
    return retryAfter
      ? `Too many attempts. Try again after about ${retryAfter} seconds.`
      : 'Too many attempts. Please try again later.';
  }
  if (errorCode === 'photo_request_conflict') {
    return 'This upload attempt no longer matches its private reservations. Start the upload again.';
  }
  if (errorCode === 'photo_request_too_large') {
    return 'The request metadata is too large. Shorten descriptions or submit fewer photos.';
  }
  if (errorCode === 'photo_media_type_unsupported') {
    return 'The request format was not accepted. Reload the page and try again.';
  }
  if (errorCode === 'photo_request_invalid') {
    return 'Some photo details were not accepted. Review the form and try again.';
  }
  return 'The private photo service is temporarily unavailable. No public media was changed.';
}

function newMediaValue(file: File): PhotoBrowserMediaValues {
  return {
    browserId: crypto.randomUUID(),
    file,
    role: 'gallery',
    capturedAt: '',
    description: '',
    suggestedAltText: '',
    photographerPresent: true,
    rightsStatus: 'submitted_with_permission',
    rightsHolderPresent: true,
    permissionReferencePresent: false,
    licenseName: '',
    licenseUrl: '',
  };
}

function validateSelectedFiles(files: File[]): string[] {
  const messages: string[] = [];
  if (files.length < 1 || files.length > maximumFiles) {
    messages.push('Choose between one and eight photos.');
  }
  if (files.some((file) => !acceptedMimeTypes.includes(file.type.toLowerCase()))) {
    messages.push('Use JPEG, PNG, WebP, HEIC, or HEIF files only.');
  }
  if (files.some((file) => file.size < 1 || file.size > maximumFileBytes)) {
    messages.push('Each photo must be larger than zero bytes and no more than 5 MB.');
  }
  if (files.reduce((total, file) => total + file.size, 0) > maximumTotalBytes) {
    messages.push('The selected photos exceed the 40 MB total limit.');
  }
  return messages;
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
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

const inputClass =
  'min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

export function PhotoForm({
  siteKey,
  action,
  initialTargetType = 'location',
  initialTargetId = '',
}: PhotoFormProps) {
  const [values, setValues] = useState<PhotoBrowserFormValues>(() =>
    emptyPhotoBrowserFormValues(initialTargetType, initialTargetId),
  );
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeState, setChallengeState] = useState<'loading' | 'ready' | 'error'>(
    siteKey && action ? 'loading' : 'error',
  );
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [messages, setMessages] = useState<string[]>([]);
  const [flowError, setFlowError] = useState('');
  const [uploadedReservations, setUploadedReservations] = useState<
    PhotoUploadedReservation[] | null
  >(null);
  const [receipt, setReceipt] = useState<PhotoReceipt | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !action) {
      setChallengeState('error');
      return;
    }

    let active = true;
    const render = () => {
      const turnstile = getTurnstile();
      if (!active || !turnstile || !turnstileContainerRef.current || widgetIdRef.current !== null) {
        return;
      }
      try {
        widgetIdRef.current = turnstile.render(turnstileContainerRef.current, {
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
      const turnstile = getTurnstile();
      if (widgetIdRef.current !== null && turnstile) turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [action, siteKey]);

  const resetChallenge = () => {
    setChallengeToken(null);
    const turnstile = getTurnstile();
    if (widgetIdRef.current !== null && turnstile) turnstile.reset(widgetIdRef.current);
  };

  const invalidatePrivateUploads = () => {
    if (uploadedReservations !== null) {
      setUploadedReservations(null);
      requestIdRef.current = null;
      setFlowState('idle');
    }
  };

  const update = <Key extends keyof PhotoBrowserFormValues>(
    key: Key,
    value: PhotoBrowserFormValues[Key],
  ) => {
    invalidatePrivateUploads();
    setValues((current) => ({ ...current, [key]: value }));
    setMessages([]);
    setFlowError('');
  };

  const updateMedia = <Key extends keyof PhotoBrowserMediaValues>(
    index: number,
    key: Key,
    value: PhotoBrowserMediaValues[Key],
  ) => {
    invalidatePrivateUploads();
    setValues((current) => ({
      ...current,
      media: current.media.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
    setMessages([]);
    setFlowError('');
  };

  const chooseFiles = (files: File[]) => {
    const validation = validateSelectedFiles(files);
    if (validation.length > 0) {
      setMessages(validation);
      return;
    }
    requestIdRef.current = null;
    setUploadedReservations(null);
    setFlowState('idle');
    setValues((current) => ({ ...current, media: files.map(newMediaValue) }));
    setMessages([]);
    setFlowError('');
  };

  async function authorizeAndUpload() {
    setMessages([]);
    setFlowError('');
    if (challengeToken === null) {
      setFlowState('error');
      setFlowError('Complete the verification challenge before authorizing uploads.');
      return;
    }

    requestIdRef.current ??= crypto.randomUUID();
    let authorization: PhotoUploadAuthorization;
    try {
      authorization = buildPhotoUploadAuthorizationFromBrowserForm(values, requestIdRef.current);
    } catch (error) {
      setMessages(browserPhotoValidationMessages(error));
      setFlowState('error');
      return;
    }

    try {
      setFlowState('authorizing');
      const authorizationResponse = await fetch('/api/photos/upload-authorizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdRef.current,
        },
        body: JSON.stringify({ challengeToken, authorization }),
      });
      const authorizationBody = (await authorizationResponse.json()) as unknown;
      if (!authorizationResponse.ok) {
        const errorCode =
          typeof authorizationBody === 'object' &&
          authorizationBody !== null &&
          'error' in authorizationBody &&
          typeof authorizationBody.error === 'string'
            ? authorizationBody.error
            : 'photo_unavailable';
        if (authorizationResponse.status === 409) requestIdRef.current = null;
        setFlowState('error');
        setFlowError(errorMessage(errorCode, authorizationResponse.headers.get('Retry-After')));
        resetChallenge();
        return;
      }

      const uploadReceipt = parsePhotoUploadReceipt(authorizationBody);
      if (
        uploadReceipt.intakeRequestId !== requestIdRef.current ||
        uploadReceipt.uploads.length !== values.media.length
      ) {
        throw new Error('The private upload authorization did not match this form.');
      }

      setFlowState('uploading');
      await Promise.all(
        uploadReceipt.uploads.map(async (upload, index) => {
          const media = values.media[index];
          if (media === undefined || upload.declaredByteSize !== media.file.size) {
            throw new Error('The private upload authorization did not match a selected photo.');
          }
          const response = await fetch(upload.uploadUrl, {
            method: upload.method,
            headers: upload.requiredHeaders,
            body: media.file as File,
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
          });
          if (!response.ok) throw new Error('A private photo upload failed.');
        }),
      );

      setUploadedReservations(
        uploadReceipt.uploads.map((upload, index) => ({
          quarantineUploadId: upload.quarantineUploadId,
          declaredMimeType: values.media[
            index
          ]?.file.type.toLowerCase() as PhotoUploadedReservation['declaredMimeType'],
          declaredByteSize: upload.declaredByteSize,
        })),
      );
      setFlowState('uploaded');
      resetChallenge();
    } catch (error) {
      setFlowState('error');
      setFlowError(
        error instanceof Error
          ? `${error.message} Complete verification and retry; the same private attempt identity will be reused.`
          : 'The private photo upload failed. Complete verification and try again.',
      );
      resetChallenge();
    }
  }

  async function submitForReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessages([]);
    setFlowError('');
    if (uploadedReservations === null || requestIdRef.current === null) {
      await authorizeAndUpload();
      return;
    }
    if (challengeToken === null) {
      setFlowState('error');
      setFlowError('Complete the verification challenge again to submit the uploaded photos.');
      return;
    }

    let submission: PhotoSubmissionIntake;
    try {
      submission = buildPhotosSubmissionIntakeFromBrowserForm(values, uploadedReservations);
    } catch (error) {
      setMessages(browserPhotoValidationMessages(error));
      setFlowState('error');
      return;
    }

    try {
      setFlowState('submitting');
      const response = await fetch('/api/photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestIdRef.current,
        },
        body: JSON.stringify({ challengeToken, submission }),
      });
      const body = (await response.json()) as PhotoReceipt | PhotoPublicError;
      if (
        response.status === 202 &&
        'submissionReference' in body &&
        typeof body.submissionReference === 'string' &&
        typeof body.statusSecret === 'string' &&
        typeof body.submittedAt === 'string'
      ) {
        setReceipt(body);
        return;
      }
      const errorCode = 'error' in body ? body.error : 'photo_unavailable';
      if (response.status === 409) {
        requestIdRef.current = null;
        setUploadedReservations(null);
      }
      setFlowState('error');
      setFlowError(errorMessage(errorCode, response.headers.get('Retry-After')));
      resetChallenge();
    } catch {
      setFlowState('error');
      setFlowError(
        'The private Submission could not be completed. Complete verification and retry.',
      );
      resetChallenge();
    }
  }

  if (receipt) {
    return (
      <StatePanel
        tone="success"
        title="Photos received for private review"
        description="Save both values below. The status secret is shown only in this receipt and is not stored in this browser."
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

  const busy = ['authorizing', 'uploading', 'submitting'].includes(flowState);
  return (
    <form className="grid gap-8" onSubmit={submitForReview} noValidate>
      <Section eyebrow="1. Target" title="Choose the place or service">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-ink">
            Target type
            <select
              className={inputClass}
              value={values.targetType}
              onChange={(event) =>
                update('targetType', event.currentTarget.value as 'entity' | 'location')
              }
            >
              <option value="location">Physical location</option>
              <option value="entity">Entity or online service</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Target UUID
            <input
              className={inputClass}
              value={values.targetId}
              onChange={(event) => update('targetId', event.currentTarget.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink sm:col-span-2">
            Your relationship
            <select
              className={inputClass}
              value={values.relationship}
              onChange={(event) =>
                update(
                  'relationship',
                  event.currentTarget.value as PhotoBrowserFormValues['relationship'],
                )
              }
            >
              <option value="customer">Customer</option>
              <option value="employee">Employee</option>
              <option value="owner_or_authorized_representative">
                Owner or authorized representative
              </option>
              <option value="independent_researcher">Independent researcher</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
      </Section>

      <Section eyebrow="2. Photos" title="Choose private upload candidates">
        <label className="grid gap-2 text-sm font-medium text-ink">
          Photos (1–8, maximum 5 MB each and 40 MB total)
          <input
            className={inputClass}
            type="file"
            multiple
            accept={acceptedMimeTypes.join(',')}
            onChange={(event) => chooseFiles(Array.from(event.currentTarget.files ?? []))}
          />
        </label>
        <p className="m-0 text-sm leading-6 text-muted">
          Files upload directly to private quarantine. The application API receives only opaque
          reservation UUIDs and declared review metadata.
        </p>
        <div className="grid gap-5">
          {values.media.map((item, index) => (
            <article
              key={item.browserId}
              className="grid gap-4 rounded-card border border-border bg-canvas p-4"
            >
              <div>
                <p className="m-0 font-semibold text-ink">
                  {index + 1}. {item.file.name}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {item.file.type || 'Unknown type'} · {Math.ceil(item.file.size / 1024)} KiB
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Intended role
                  <select
                    className={inputClass}
                    value={item.role}
                    onChange={(event) =>
                      updateMedia(
                        index,
                        'role',
                        event.currentTarget.value as PhotoBrowserMediaValues['role'],
                      )
                    }
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Capture date (optional)
                  <input
                    className={inputClass}
                    type="date"
                    value={item.capturedAt}
                    onChange={(event) =>
                      updateMedia(index, 'capturedAt', event.currentTarget.value)
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-ink sm:col-span-2">
                  Description (optional)
                  <textarea
                    className={inputClass}
                    rows={3}
                    maxLength={1000}
                    value={item.description}
                    onChange={(event) =>
                      updateMedia(index, 'description', event.currentTarget.value)
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-ink sm:col-span-2">
                  Suggested alt text (optional)
                  <input
                    className={inputClass}
                    maxLength={500}
                    value={item.suggestedAltText}
                    onChange={(event) =>
                      updateMedia(index, 'suggestedAltText', event.currentTarget.value)
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-ink">
                  Rights basis
                  <select
                    className={inputClass}
                    value={item.rightsStatus}
                    onChange={(event) =>
                      updateMedia(
                        index,
                        'rightsStatus',
                        event.currentTarget.value as PhotoBrowserMediaValues['rightsStatus'],
                      )
                    }
                  >
                    <option value="submitted_with_permission">Submitted with permission</option>
                    <option value="licensed">Licensed</option>
                    <option value="public_domain">Public domain</option>
                  </select>
                </label>
                <div className="grid gap-2 text-sm text-ink">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.photographerPresent}
                      onChange={(event) =>
                        updateMedia(index, 'photographerPresent', event.currentTarget.checked)
                      }
                    />{' '}
                    I am the photographer
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.rightsHolderPresent}
                      onChange={(event) =>
                        updateMedia(index, 'rightsHolderPresent', event.currentTarget.checked)
                      }
                    />{' '}
                    Rights holder is participating
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.permissionReferencePresent}
                      onChange={(event) =>
                        updateMedia(
                          index,
                          'permissionReferencePresent',
                          event.currentTarget.checked,
                        )
                      }
                    />{' '}
                    Permission reference is available
                  </label>
                </div>
                {item.rightsStatus === 'licensed' ? (
                  <>
                    <label className="grid gap-2 text-sm font-medium text-ink">
                      License name
                      <input
                        className={inputClass}
                        maxLength={160}
                        value={item.licenseName}
                        onChange={(event) =>
                          updateMedia(index, 'licenseName', event.currentTarget.value)
                        }
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-ink">
                      License URL
                      <input
                        className={inputClass}
                        type="url"
                        maxLength={2048}
                        value={item.licenseUrl}
                        onChange={(event) =>
                          updateMedia(index, 'licenseUrl', event.currentTarget.value)
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="3. Contact and note" title="Add private follow-up details">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-ink">
            Contact email (optional)
            <input
              className={inputClass}
              type="email"
              maxLength={320}
              value={values.contactEmail}
              onChange={(event) => update('contactEmail', event.currentTarget.value)}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={values.contactAllowed}
              onChange={(event) => update('contactAllowed', event.currentTarget.checked)}
            />{' '}
            CryptoPayMap may contact me about this Submission
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink sm:col-span-2">
            Note for reviewers (optional)
            <textarea
              className={inputClass}
              rows={4}
              maxLength={2000}
              value={values.submitterNote}
              onChange={(event) => update('submitterNote', event.currentTarget.value)}
            />
          </label>
        </div>
      </Section>

      <Section eyebrow="4. Verify and submit" title="Complete the private two-step upload">
        <label className="flex items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={values.privacyNoticeAccepted}
            onChange={(event) => update('privacyNoticeAccepted', event.currentTarget.checked)}
          />
          I have read the privacy notice and understand that originals and derivatives remain
          private until separately reviewed.
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-ink">
          <input
            className="mt-1 h-4 w-4"
            type="checkbox"
            checked={values.submissionTermsAccepted}
            onChange={(event) => update('submissionTermsAccepted', event.currentTarget.checked)}
          />
          I accept the submission terms and confirm that I have the stated rights and public-display
          permission.
        </label>
        <div ref={turnstileContainerRef} className="min-h-16" />
        {uploadedReservations !== null ? (
          <StatePanel
            tone="success"
            title="Private uploads completed"
            description="Complete the fresh verification challenge, then submit the opaque reservations for private review. Changing the form will require a new upload."
          />
        ) : null}
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
        {flowError ? (
          <p className="m-0 text-sm font-medium text-danger" role="alert">
            {flowError}
          </p>
        ) : null}
        <button
          type="submit"
          className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy || challengeState === 'error'}
        >
          {flowState === 'authorizing'
            ? 'Authorizing private uploads…'
            : flowState === 'uploading'
              ? 'Uploading directly to private quarantine…'
              : flowState === 'submitting'
                ? 'Submitting for private review…'
                : uploadedReservations === null
                  ? 'Authorize and upload photos'
                  : 'Submit uploaded photos for review'}
        </button>
        <p className="m-0 text-sm leading-6 text-muted">
          This form never approves or publishes Media automatically. Validation, processing,
          rights/privacy review, gallery placement, canonical changes, export, and publication
          remain separate operations.
        </p>
      </Section>
    </form>
  );
}
