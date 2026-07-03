import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { MediaReviewAction } from '../../admin/media-review/decision';
import {
  mediaReviewDetailResponseSchema,
  type MediaReviewDetailResponse,
} from '../../admin/media-review/workspace';
import { Button } from '../ui/Button';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: MediaReviewDetailResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'invalid' | 'conflict' | 'denied' | 'unavailable'; message: string };

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function StatusPanel({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className="rounded-card border border-border bg-surface p-6 shadow-sm"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-control bg-canvas text-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

function availableActions(detail: MediaReviewDetailResponse): MediaReviewAction[] {
  const media = detail.media;
  if (media.reviewStatus === 'pending') {
    return ['evidence', 'owner_verification'].includes(media.purpose)
      ? ['approve_private', 'reject']
      : ['approve_public', 'reject'];
  }
  if (
    media.reviewStatus === 'accepted' &&
    ['public_gallery', 'canonical_logo'].includes(media.purpose)
  ) {
    if (media.visibility === 'public') return ['restrict', 'supersede'];
    if (media.visibility === 'restricted') return ['supersede'];
  }
  return [];
}

function reasonFor(action: MediaReviewAction): string {
  return {
    approve_private: 'approved_private_review',
    approve_public: 'approved_for_public_gallery',
    reject: 'rejected_media_review',
    restrict: 'urgent_privacy_restriction',
    supersede: 'superseded_media',
  }[action];
}

export function MediaReviewDetail() {
  const [mediaAssetId, setMediaAssetId] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setMediaAssetId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (mediaAssetId === undefined) return;
      if (!mediaAssetId) {
        setState({ status: 'missing_id' });
        return;
      }
      setState({ status: 'loading' });
      try {
        const response = await fetch(
          `/admin/api/media-detail?mediaAssetId=${encodeURIComponent(mediaAssetId)}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: signal ?? null,
          },
        );
        if (response.status === 403) return setState({ status: 'denied' });
        if (response.status === 404) return setState({ status: 'not_found' });
        if (response.status === 400) return setState({ status: 'missing_id' });
        if (response.status === 503) return setState({ status: 'unavailable' });
        if (!response.ok) return setState({ status: 'error' });
        const parsed = mediaReviewDetailResponseSchema.safeParse(await response.json());
        setState(parsed.success ? { status: 'ready', detail: parsed.data } : { status: 'error' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    },
    [mediaAssetId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading Media review"
        description="The protected service is loading the exact Media version and complete file set."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (state.status !== 'ready') {
    const copy = {
      missing_id: ['Media identifier required', 'Return to the Media queue and choose a record.'],
      denied: ['Media review access denied', 'This verified identity cannot read Media review data.'],
      not_found: ['Media not found', 'The requested Media asset is unavailable or deleted.'],
      unavailable: ['Media review unavailable', 'The protected service could not complete safely.'],
      error: ['Media response could not be verified', 'No unverified review data is displayed.'],
    } as const;
    const [title, description] = copy[state.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={
          state.status === 'denied' ? (
            <ShieldAlert className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )
        }
        action={
          state.status === 'unavailable' || state.status === 'error' ? (
            <Button variant="secondary" onClick={() => void load()}>
              Retry review
            </Button>
          ) : (
            <a className="text-sm font-semibold text-brand-700" href="/admin/media/">
              Return to Media queue
            </a>
          )
        }
      />
    );
  }

  return <MediaReviewWorkspace detail={state.detail} reload={() => void load()} />;
}

function MediaFileCard({ file }: { file: MediaReviewDetailResponse['files'][number] }) {
  const browserPreview = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType);
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
      {browserPreview ? (
        <img
          className="aspect-video w-full bg-canvas object-contain"
          src={`/admin/api/media-file?fileId=${encodeURIComponent(file.id)}`}
          alt={`Protected review preview for ${label(file.variant)} file`}
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-canvas p-5 text-center text-sm text-muted">
          This format cannot be previewed in the browser. Review its validated metadata below.
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold text-ink">{label(file.variant)}</h3>
        <dl className="mt-3 grid gap-2 text-xs text-muted">
          <div className="flex justify-between gap-4"><dt>Scope</dt><dd>{label(file.storageScope)}</dd></div>
          <div className="flex justify-between gap-4"><dt>MIME</dt><dd>{file.mimeType}</dd></div>
          <div className="flex justify-between gap-4"><dt>Size</dt><dd>{file.byteSize.toLocaleString()} bytes</dd></div>
          <div className="flex justify-between gap-4"><dt>Dimensions</dt><dd>{file.width && file.height ? `${file.width} × ${file.height}` : 'Not recorded'}</dd></div>
        </dl>
        <p className="mt-3 break-all font-mono text-[0.7rem] leading-5 text-muted">{file.contentHash}</p>
      </div>
    </article>
  );
}

function MediaReviewWorkspace({
  detail,
  reload,
}: {
  detail: MediaReviewDetailResponse;
  reload: () => void;
}) {
  const actions = useMemo(() => availableActions(detail), [detail]);
  const [action, setAction] = useState<MediaReviewAction>(actions[0] ?? 'reject');
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const displayFiles = detail.files.filter((file) => file.variant === 'display');
  const thumbnailFiles = detail.files.filter((file) => file.variant === 'thumbnail');
  const canDecide = actions.length > 0;
  const publicApproval = action === 'approve_public';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const nullable = (name: string) => text(name) || null;
    const rightsStatus = text('rightsStatus');
    const body = {
      expectedMediaUpdatedAt: detail.media.updatedAt,
      expectedReviewStatus: detail.media.reviewStatus,
      expectedPurpose: detail.media.purpose,
      expectedRole: detail.media.role,
      expectedRightsStatus: detail.media.rightsStatus,
      expectedVisibility: detail.media.visibility,
      expectedSubject: detail.media.subject,
      expectedFiles: detail.files.map((file) => ({
        id: file.id,
        variant: file.variant,
        storageScope: file.storageScope,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        contentHash: file.contentHash,
        width: file.width,
        height: file.height,
      })),
      action,
      targetMatch: text('targetMatch'),
      privacyReview: text('privacyReview'),
      rightsDecision: publicApproval
        ? {
            status: rightsStatus,
            licenseId: rightsStatus === 'licensed' ? nullable('licenseId') : null,
            rightsHolder: nullable('rightsHolder'),
            consentReference: nullable('consentReference'),
            attribution: nullable('attribution'),
            licenseAttributionRequired: form.get('licenseAttributionRequired') === 'on',
          }
        : null,
      altText: publicApproval ? nullable('altText') : null,
      displayOrder: publicApproval ? Number(text('displayOrder') || '0') : null,
      publicDisplayFileId: publicApproval ? nullable('publicDisplayFileId') : null,
      publicThumbnailFileId: publicApproval ? nullable('publicThumbnailFileId') : null,
      reasonCode: text('reasonCode'),
      publicSummary: nullable('publicSummary'),
      internalNote: nullable('internalNote'),
    };

    try {
      const response = await fetch(
        `/admin/api/media-decision?mediaAssetId=${encodeURIComponent(detail.media.id)}`,
        {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 403) {
        return setSubmitState({ status: 'denied', message: 'This identity cannot review Media.' });
      }
      if (response.status === 409) {
        return setSubmitState({
          status: 'conflict',
          message: 'The Media asset, file set, or storage object changed. Reload before retrying.',
        });
      }
      if (response.status === 400) {
        const result = (await response.json()) as { issues?: string[] };
        return setSubmitState({
          status: 'invalid',
          message: result.issues?.[0] ?? 'The Media review decision was rejected.',
        });
      }
      if (!response.ok) {
        return setSubmitState({
          status: 'unavailable',
          message: 'The Media review decision service is unavailable.',
        });
      }
      const receipt = (await response.json()) as {
        reviewStatus: string;
        visibility: string;
        state: string;
      };
      setSubmitState({
        status: 'success',
        message: `Media is ${label(receipt.reviewStatus)} and ${label(receipt.visibility)}. Receipt ${label(receipt.state)}.`,
      });
    } catch {
      setSubmitState({
        status: 'unavailable',
        message: 'The Media review request could not be completed.',
      });
    }
  }

  if (submitState.status === 'success') {
    return (
      <StatusPanel
        title="Media decision committed"
        description={submitState.message}
        icon={<CheckCircle2 className="size-5" />}
        action={
          <div className="flex flex-wrap gap-4">
            <Button variant="secondary" onClick={reload}>Reload committed state</Button>
            <a className="self-center text-sm font-semibold text-brand-700" href="/admin/media/">Return to Media queue</a>
          </div>
        }
      />
    );
  }

  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href="/admin/media/">← Media queue</a>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
              {label(detail.media.purpose)} · {label(detail.media.role)}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Media review</h2>
          </div>
          <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
            {label(detail.media.reviewStatus)} · {label(detail.media.visibility)}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="font-semibold text-ink">Subject</dt><dd className="mt-1 break-all text-muted">{label(detail.media.subject.type)} · {detail.media.subject.id}</dd></div>
          <div><dt className="font-semibold text-ink">Rights</dt><dd className="mt-1 text-muted">{label(detail.media.rightsStatus)}</dd></div>
          <div><dt className="font-semibold text-ink">Files</dt><dd className="mt-1 text-muted">{detail.files.length}</dd></div>
          <div><dt className="font-semibold text-ink">Updated</dt><dd className="mt-1 text-muted">{detail.media.updatedAt}</dd></div>
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="media-files-title">
        <h2 id="media-files-title" className="text-2xl font-semibold text-ink">Protected file previews</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Review faces, plates, QR codes, receipts, wallet details, target accuracy, and publication rights before deciding.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {detail.files.map((file) => <MediaFileCard key={file.id} file={file} />)}
        </div>
      </section>

      {!canDecide ? (
        <div className="mt-6">
          <StatusPanel
            title="No further Media action is available"
            description="This Media state has no valid mutation in the current review contract."
            icon={<CheckCircle2 className="size-5" />}
          />
        </div>
      ) : (
        <form className="mt-6 rounded-card border border-border bg-surface p-5 shadow-sm" onSubmit={submit}>
          <h2 className="text-2xl font-semibold text-ink">Decision</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Action
              <select
                className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                value={action}
                onChange={(event) => setAction(event.target.value as MediaReviewAction)}
              >
                {actions.map((item) => <option key={item} value={item}>{label(item)}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Target match
              <select name="targetMatch" defaultValue="confirmed" className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal">
                <option value="confirmed">Confirmed</option>
                <option value="uncertain">Uncertain</option>
                <option value="wrong_target">Wrong target</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Privacy review
              <select name="privacyReview" defaultValue={publicApproval ? 'cleared' : 'private_only'} className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal">
                <option value="cleared">Cleared</option>
                <option value="private_only">Private only</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
          </div>

          {publicApproval ? (
            <div className="mt-5 rounded-card border border-brand-200 bg-brand-50 p-4">
              <h3 className="font-semibold text-ink">Public display fields</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-ink">
                  Rights status
                  <select name="rightsStatus" defaultValue="submitted_with_permission" className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal">
                    <option value="submitted_with_permission">Submitted with permission</option>
                    <option value="licensed">Licensed</option>
                    <option value="public_domain">Public domain</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-ink">Rights holder<input name="rightsHolder" className="min-h-11 rounded-control border border-border px-3 py-2 font-normal" /></label>
                <label className="grid gap-2 text-sm font-semibold text-ink">Consent reference<input name="consentReference" className="min-h-11 rounded-control border border-border px-3 py-2 font-normal" /></label>
                <label className="grid gap-2 text-sm font-semibold text-ink">License ID<input name="licenseId" className="min-h-11 rounded-control border border-border px-3 py-2 font-normal" /></label>
                <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">Attribution<textarea name="attribution" rows={2} className="rounded-control border border-border px-3 py-2 font-normal" /></label>
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink"><input type="checkbox" name="licenseAttributionRequired" /> Attribution is required by the license</label>
                <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">Public alt text<textarea required name="altText" defaultValue={detail.media.altText ?? ''} rows={2} className="rounded-control border border-border px-3 py-2 font-normal" /></label>
                <label className="grid gap-2 text-sm font-semibold text-ink">Display order<input required name="displayOrder" type="number" min="0" defaultValue={detail.media.displayOrder} className="min-h-11 rounded-control border border-border px-3 py-2 font-normal" /></label>
                <label className="grid gap-2 text-sm font-semibold text-ink">Display derivative<select required name="publicDisplayFileId" defaultValue={displayFiles[0]?.id ?? ''} className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"><option value="">Choose display file</option>{displayFiles.map((file) => <option key={file.id} value={file.id}>{file.width} × {file.height} · {file.mimeType}</option>)}</select></label>
                <label className="grid gap-2 text-sm font-semibold text-ink">Thumbnail derivative<select name="publicThumbnailFileId" defaultValue={thumbnailFiles[0]?.id ?? ''} className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"><option value="">No thumbnail</option>{thumbnailFiles.map((file) => <option key={file.id} value={file.id}>{file.width} × {file.height} · {file.mimeType}</option>)}</select></label>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-ink">Reason code<input required name="reasonCode" key={action} defaultValue={reasonFor(action)} pattern="[a-z0-9]+(?:_[a-z0-9]+)*" className="min-h-11 rounded-control border border-border px-3 py-2 font-normal" /></label>
            <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">Public summary<textarea required name="publicSummary" rows={2} className="rounded-control border border-border px-3 py-2 font-normal" /></label>
            <label className="grid gap-2 text-sm font-semibold text-ink md:col-span-2">Internal note<textarea name="internalNote" rows={3} className="rounded-control border border-border px-3 py-2 font-normal" /></label>
          </div>

          {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
            <p className="mt-4 text-sm font-semibold text-danger" role="alert">{submitState.message}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={submitState.status === 'submitting'}>
              {submitState.status === 'submitting' ? 'Committing decision…' : 'Commit Media decision'}
            </Button>
            <Button type="button" variant="secondary" onClick={reload}>Reload exact state</Button>
          </div>
        </form>
      )}
    </div>
  );
}
