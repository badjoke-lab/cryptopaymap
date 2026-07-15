import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  browserPhotoValidationMessages,
  buildPhotoAuthorizationRequest,
  buildPhotoSubmissionIntake,
  createPhotoBrowserMediaValues,
  detectPhotoDeclaredMimeType,
  emptyPhotoBrowserFormValues,
  photoBrowserFormValuesSchema,
  type PhotoBrowserFormValues,
  type PhotoBrowserMediaValues,
  type PhotoBrowserPrivateReceipt,
} from '../../submissions/photo-browser-contract';
import {
  authorizeAndUploadPhotos,
  PhotoBrowserRequestError,
  submitUploadedPhotos,
} from '../../submissions/photo-browser-orchestration';
import { StatePanel } from '../ui/StatePanel';
import { FormSection, InputField, SelectField, TextAreaField } from './ReportFormControls';

const turnstileScriptId = 'cpm-turnstile-api';
const turnstileScriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const acceptedPhotoTypes = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
const maximumPhotoBytes = 5_000_000;
const maximumPhotoCount = 8;
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

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type PhotoBaseValues = Omit<PhotoBrowserFormValues, 'media'>;

interface SelectedPhoto {
  file: File;
  values: PhotoBrowserMediaValues;
}

interface PendingPrivateIntake {
  requestId: string;
  values: PhotoBrowserFormValues;
  quarantineUploadIds: string[];
  expiresAt: string;
}

export interface PhotoFormProps {
  siteKey: string;
  action: string;
  initialTargetType?: PhotoBrowserFormValues['targetType'] | undefined;
  initialTargetId?: string | undefined;
}

const targetOptions = [
  { value: 'entity', label: 'Business or online service' },
  { value: 'location', label: 'Physical location' },
];

const relationshipOptions = [
  { value: 'customer', label: 'Customer or visitor' },
  { value: 'employee', label: 'Employee' },
  { value: 'owner_or_authorized_representative', label: 'Owner or authorized representative' },
  { value: 'independent_researcher', label: 'Independent researcher' },
  { value: 'other', label: 'Other' },
];

const roleOptions = [
  { value: 'cover', label: 'Cover candidate' },
  { value: 'gallery', label: 'General gallery' },
  { value: 'exterior', label: 'Exterior' },
  { value: 'interior', label: 'Interior' },
  { value: 'product', label: 'Product' },
  { value: 'menu', label: 'Menu' },
  { value: 'payment_sign', label: 'Payment sign' },
  { value: 'checkout_terminal', label: 'Checkout terminal' },
];

const rightsOptions = [
  { value: 'submitted_with_permission', label: 'I own it or have permission' },
  { value: 'licensed', label: 'Licensed for reuse' },
  { value: 'public_domain', label: 'Public domain' },
];

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

function responseMessage(error: unknown): string {
  if (!(error instanceof PhotoBrowserRequestError)) {
    return 'The Photos request could not be completed. Please try again.';
  }
  if (error.code === 'photo_rate_limited') {
    return error.retryAfterSeconds === null
      ? 'Too many attempts. Please try again later.'
      : `Too many attempts. Try again after about ${error.retryAfterSeconds} seconds.`;
  }
  if (error.code === 'photo_request_conflict') {
    return 'This upload request can no longer be continued. Start over with a new private request reference.';
  }
  if (error.code === 'photo_upload_failed') {
    return 'A direct private upload failed. The same request reference was retained so you can complete verification and retry.';
  }
  if (error.code === 'photo_request_too_large') {
    return 'The request details are too large. Shorten the descriptions or note.';
  }
  if (error.code === 'photo_media_type_unsupported') {
    return 'The request could not be sent in the expected format. Reload and try again.';
  }
  if (error.code === 'photo_request_invalid') {
    return 'Some photo details were not accepted. Review the form and try again.';
  }
  return 'The Photos service is temporarily unavailable. No public Media was created.';
}

function initialBaseValues(
  targetType: PhotoBrowserFormValues['targetType'],
  targetId: string,
): PhotoBaseValues {
  const { media: _media, ...base } = emptyPhotoBrowserFormValues(targetType, targetId);
  return base;
}

function completeValues(base: PhotoBaseValues, photos: SelectedPhoto[]): PhotoBrowserFormValues {
  return {
    ...base,
    media: photos.map((photo) => photo.values),
  };
}

function Checkbox({
  checked,
  disabled,
  children,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6 text-ink">
      <input
        className="mt-1 h-4 w-4"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function PhotoForm({
  siteKey,
  action,
  initialTargetType = 'entity',
  initialTargetId = '',
}: PhotoFormProps) {
  const [baseValues, setBaseValues] = useState<PhotoBaseValues>(() =>
    initialBaseValues(initialTargetType, initialTargetId),
  );
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeState, setChallengeState] = useState<'loading' | 'ready' | 'error'>(
    siteKey && action ? 'loading' : 'error',
  );
  const [flowState, setFlowState] = useState<
    'editing' | 'authorizing' | 'awaiting_final_verification' | 'submitting' | 'error'
  >('editing');
  const [messages, setMessages] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [pending, setPending] = useState<PendingPrivateIntake | null>(null);
  const [receipt, setReceipt] = useState<PhotoBrowserPrivateReceipt | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const locked = pending !== null || flowState === 'authorizing' || flowState === 'submitting';

  const updateBase = <Key extends keyof PhotoBaseValues>(key: Key, value: PhotoBaseValues[Key]) => {
    setBaseValues((current) => ({ ...current, [key]: value }));
    setMessages([]);
    setSubmitError('');
  };

  const updatePhoto = <Key extends keyof PhotoBrowserMediaValues>(
    index: number,
    key: Key,
    value: PhotoBrowserMediaValues[Key],
  ) => {
    setPhotos((current) =>
      current.map((photo, photoIndex) =>
        photoIndex === index ? { ...photo, values: { ...photo.values, [key]: value } } : photo,
      ),
    );
    setMessages([]);
    setSubmitError('');
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

  const startOver = () => {
    requestIdRef.current = null;
    setPending(null);
    setFlowState('editing');
    setMessages([]);
    setSubmitError('');
    resetChallenge();
  };

  const selectFiles = (fileList: FileList | null) => {
    if (fileList === null || locked) return;
    const available = Math.max(0, maximumPhotoCount - photos.length);
    const candidates = Array.from(fileList).slice(0, available);
    const accepted: SelectedPhoto[] = [];
    const rejected: string[] = [];

    for (const file of candidates) {
      const mimeType = detectPhotoDeclaredMimeType(file);
      if (mimeType === null) {
        rejected.push(`${file.name}: use JPEG, PNG, WebP, HEIC, or HEIF.`);
        continue;
      }
      if (file.size < 1 || file.size > maximumPhotoBytes) {
        rejected.push(`${file.name}: each file must be between 1 byte and 5 MB.`);
        continue;
      }
      accepted.push({
        file,
        values: createPhotoBrowserMediaValues(crypto.randomUUID(), mimeType, file.size),
      });
    }

    const next = [...photos, ...accepted];
    const totalBytes = next.reduce((sum, photo) => sum + photo.file.size, 0);
    if (totalBytes > maximumTotalBytes) {
      setMessages(['The selected photos exceed the 40 MB total limit.']);
      return;
    }
    if (fileList.length > available) {
      rejected.push(`Only ${maximumPhotoCount} photos can be submitted at once.`);
    }
    setPhotos(next);
    setMessages(rejected.slice(0, 8));
    setSubmitError('');
  };

  const removePhoto = (index: number) => {
    if (locked) return;
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    setMessages([]);
    setSubmitError('');
  };

  async function beginUpload(values: PhotoBrowserFormValues, token: string) {
    requestIdRef.current ??= crypto.randomUUID();
    const requestId = requestIdRef.current;
    const authorization = buildPhotoAuthorizationRequest(requestId, values);
    const sources = photos.map((photo) => ({
      body: photo.file,
      declaredMimeType: photo.values.declaredMimeType,
      declaredByteSize: photo.values.declaredByteSize,
    }));

    setFlowState('authorizing');
    const authorizationReceipt = await authorizeAndUploadPhotos(
      requestId,
      token,
      authorization,
      sources,
    );
    setPending({
      requestId,
      values: structuredClone(values),
      quarantineUploadIds: authorizationReceipt.uploads.map((upload) => upload.quarantineUploadId),
      expiresAt: authorizationReceipt.expiresAt,
    });
    setFlowState('awaiting_final_verification');
    resetChallenge();
  }

  async function finalizePrivateIntake(current: PendingPrivateIntake, token: string) {
    const submission = buildPhotoSubmissionIntake(current.values, current.quarantineUploadIds);
    setFlowState('submitting');
    const privateReceipt = await submitUploadedPhotos(current.requestId, token, submission);
    setReceipt(privateReceipt);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessages([]);
    setSubmitError('');
    if (challengeToken === null) {
      setFlowState('error');
      setSubmitError('Complete the verification challenge before continuing.');
      return;
    }

    try {
      if (pending === null) {
        const values = photoBrowserFormValuesSchema.parse(completeValues(baseValues, photos));
        await beginUpload(values, challengeToken);
      } else {
        await finalizePrivateIntake(pending, challengeToken);
      }
    } catch (error) {
      if (!(error instanceof PhotoBrowserRequestError)) {
        setMessages(browserPhotoValidationMessages(error));
      }
      setFlowState('error');
      setSubmitError(responseMessage(error));
      resetChallenge();
    }
  }

  if (receipt !== null) {
    return (
      <StatePanel
        tone="success"
        title="Photos received for private review"
        description="Save both values below. The status secret is shown only in this receipt and is not stored in this browser form."
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

  const totalBytes = photos.reduce((sum, photo) => sum + photo.file.size, 0);
  return (
    <form className="grid gap-8" onSubmit={submit} noValidate>
      <fieldset className="contents" disabled={locked}>
        <FormSection eyebrow="1. Target" title="Choose the record these photos show">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="photo-target-type"
              label="Target type"
              value={baseValues.targetType}
              options={targetOptions}
              onChange={(value) =>
                updateBase('targetType', value as PhotoBrowserFormValues['targetType'])
              }
            />
            <InputField
              id="photo-target-id"
              label="Target UUID"
              value={baseValues.targetId}
              maxLength={64}
              hint="Use the existing Entity or Location UUID from the record you are viewing."
              onChange={(value) => updateBase('targetId', value)}
            />
          </div>
          <SelectField
            id="photo-relationship"
            label="Your relationship to this record"
            value={baseValues.relationship}
            options={relationshipOptions}
            onChange={(value) =>
              updateBase('relationship', value as PhotoBrowserFormValues['relationship'])
            }
          />
        </FormSection>

        <FormSection eyebrow="2. Private upload" title="Select one to eight photos">
          <div className="grid gap-3">
            <label className="text-sm font-semibold text-ink" htmlFor="photo-files">
              Photo files
            </label>
            <input
              id="photo-files"
              type="file"
              accept={acceptedPhotoTypes}
              multiple
              className="min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-ink shadow-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700"
              onChange={(event) => {
                selectFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
            <p className="m-0 text-sm leading-6 text-muted">
              JPEG, PNG, WebP, HEIC, or HEIF. Maximum 5 MB each, 40 MB total. Files upload directly
              to private quarantine and never pass through the application JSON route.
            </p>
            <p className="m-0 text-sm font-medium text-ink">
              {photos.length} of {maximumPhotoCount} selected · {Math.ceil(totalBytes / 1024)} KiB
            </p>
          </div>
        </FormSection>

        {photos.map((photo, index) => (
          <FormSection
            key={photo.values.clientId}
            eyebrow={`Photo ${index + 1}`}
            title={photo.file.name}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>
                {photo.values.declaredMimeType} · {Math.ceil(photo.file.size / 1024)} KiB
              </span>
              <button
                type="button"
                className="motion-feedback min-h-11 rounded-control border border-border px-4 py-2 font-semibold text-ink hover:bg-canvas"
                onClick={() => removePhoto(index)}
              >
                Remove
              </button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id={`photo-role-${photo.values.clientId}`}
                label="Image role"
                value={photo.values.role}
                options={roleOptions}
                onChange={(value) =>
                  updatePhoto(index, 'role', value as PhotoBrowserMediaValues['role'])
                }
              />
              <InputField
                id={`photo-date-${photo.values.clientId}`}
                label="Captured date"
                value={photo.values.capturedAt}
                type="date"
                optional
                onChange={(value) => updatePhoto(index, 'capturedAt', value)}
              />
            </div>
            <TextAreaField
              id={`photo-description-${photo.values.clientId}`}
              label="Description"
              value={photo.values.description}
              maxLength={1_000}
              optional
              hint="Describe what is visible without including personal or wallet information."
              onChange={(value) => updatePhoto(index, 'description', value)}
            />
            <InputField
              id={`photo-alt-${photo.values.clientId}`}
              label="Suggested alt text"
              value={photo.values.suggestedAltText}
              maxLength={500}
              optional
              onChange={(value) => updatePhoto(index, 'suggestedAltText', value)}
            />
            <Checkbox
              checked={photo.values.photographerPresent}
              onChange={(value) => updatePhoto(index, 'photographerPresent', value)}
            >
              The photographer or creator is identified in the private rights information.
            </Checkbox>
            <SelectField
              id={`photo-rights-${photo.values.clientId}`}
              label="Rights basis"
              value={photo.values.rightsStatus}
              options={rightsOptions}
              onChange={(value) =>
                updatePhoto(index, 'rightsStatus', value as PhotoBrowserMediaValues['rightsStatus'])
              }
            />
            <Checkbox
              checked={photo.values.rightsHolderPresent}
              onChange={(value) => updatePhoto(index, 'rightsHolderPresent', value)}
            >
              The rights holder is known and can be identified if review requires it.
            </Checkbox>
            <Checkbox
              checked={photo.values.permissionReferencePresent}
              onChange={(value) => updatePhoto(index, 'permissionReferencePresent', value)}
            >
              I have a permission reference that can be provided during private review.
            </Checkbox>
            {photo.values.rightsStatus === 'licensed' ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <InputField
                  id={`photo-license-name-${photo.values.clientId}`}
                  label="License name"
                  value={photo.values.licenseName}
                  maxLength={160}
                  onChange={(value) => updatePhoto(index, 'licenseName', value)}
                />
                <InputField
                  id={`photo-license-url-${photo.values.clientId}`}
                  label="License URL"
                  value={photo.values.licenseUrl}
                  type="url"
                  maxLength={2_048}
                  onChange={(value) => updatePhoto(index, 'licenseUrl', value)}
                />
              </div>
            ) : null}
            <Checkbox
              checked={photo.values.publicDisplayPermission}
              onChange={(value) => updatePhoto(index, 'publicDisplayPermission', value)}
            >
              I explicitly permit CryptoPayMap to review and, only after a separate approval,
              display a processed derivative publicly.
            </Checkbox>
          </FormSection>
        ))}

        <FormSection eyebrow="3. Follow-up" title="Optional contact and reviewer note">
          <InputField
            id="photo-contact-email"
            label="Contact email"
            value={baseValues.contactEmail}
            type="email"
            maxLength={320}
            optional
            hint="Stored only through the protected contact boundary and never published."
            onChange={(value) => updateBase('contactEmail', value)}
          />
          <Checkbox
            checked={baseValues.contactAllowed}
            onChange={(value) => updateBase('contactAllowed', value)}
          >
            CryptoPayMap may contact me about this private Submission.
          </Checkbox>
          <TextAreaField
            id="photo-submitter-note"
            label="Note for reviewers"
            value={baseValues.submitterNote}
            maxLength={2_000}
            optional
            onChange={(value) => updateBase('submitterNote', value)}
          />
        </FormSection>
      </fieldset>

      <FormSection eyebrow="4. Verify and submit" title="Complete the private two-step upload">
        <Checkbox
          checked={baseValues.privacyNoticeAccepted}
          disabled={locked}
          onChange={(value) => updateBase('privacyNoticeAccepted', value)}
        >
          I have read the privacy notice and understand that original files remain private during
          review.
        </Checkbox>
        <Checkbox
          checked={baseValues.submissionTermsAccepted}
          disabled={locked}
          onChange={(value) => updateBase('submissionTermsAccepted', value)}
        >
          I accept the submission terms and confirm that I am submitting these photos in good faith.
        </Checkbox>

        {pending !== null ? (
          <div className="rounded-control border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-ink">
            <p className="m-0 font-semibold">Private uploads completed</p>
            <p className="mt-2 mb-0">
              Complete the verification challenge again, then finalize the private Submission before
              the authorization expires at {new Date(pending.expiresAt).toLocaleString()}.
            </p>
          </div>
        ) : null}

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

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="motion-feedback inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              flowState === 'authorizing' ||
              flowState === 'submitting' ||
              challengeState === 'error' ||
              photos.length === 0
            }
          >
            {flowState === 'authorizing'
              ? 'Authorizing and uploading…'
              : flowState === 'submitting'
                ? 'Finalizing private Submission…'
                : pending === null
                  ? 'Upload photos privately'
                  : 'Finalize private Submission'}
          </button>
          {requestIdRef.current !== null ? (
            <button
              type="button"
              className="motion-feedback min-h-11 rounded-control border border-border px-5 py-2.5 font-semibold text-ink hover:bg-canvas disabled:opacity-60"
              disabled={flowState === 'authorizing' || flowState === 'submitting'}
              onClick={startOver}
            >
              Start over with a new request
            </button>
          ) : null}
        </div>
        <p className="m-0 text-sm leading-6 text-muted">
          Upload success creates only private quarantine objects and a private Submission. Image
          validation, processing, Media approval, public storage, canonical changes, export, and
          publication remain separate reviewed operations.
        </p>
      </FormSection>
    </form>
  );
}
