import { useEffect, useState, type FormEvent } from 'react';
import {
  protectedReconfirmationDetailResponseSchema,
  type ProtectedReconfirmationDetailResponse,
} from '../../admin/reconfirmation/protected-workspace';
import { Button } from '../ui/Button';

export function ReconfirmationDetail() {
  const [detail, setDetail] = useState<ProtectedReconfirmationDetailResponse | null>(null);
  const [message, setMessage] = useState('Loading Claim review…');
  const claimId =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('id');

  useEffect(() => {
    if (!claimId) return setMessage('Claim identifier required.');
    const controller = new AbortController();
    fetch(`/admin/api/rechecks/${encodeURIComponent(claimId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('detail');
        const parsed = protectedReconfirmationDetailResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('schema');
        setDetail(parsed.data);
        setMessage('');
      })
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setMessage('Claim review unavailable.');
        }
      });
    return () => controller.abort();
  }, [claimId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !claimId || !detail.claim.nextReviewAt) return;
    setMessage('Committing Claim transition…');
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    try {
      const response = await fetch(`/admin/api/rechecks/${encodeURIComponent(claimId)}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedClaimUpdatedAt: detail.claim.updatedAt,
          expectedClaimStatus: 'confirmed',
          expectedClaimVisibility: detail.claim.visibility,
          expectedNextReviewAt: detail.claim.nextReviewAt,
          publicSummary: text('publicSummary') || null,
          internalNote: text('internalNote') || null,
        }),
      });
      if (response.status === 409) return setMessage('The Claim changed. Reload before retrying.');
      if (!response.ok) return setMessage('The Claim transition was not committed.');
      const receipt = (await response.json()) as { toStatus: string; state: string };
      setMessage(`Claim is ${receipt.toStatus} (${receipt.state}).`);
    } catch {
      setMessage(
        'The Claim transition request could not be completed. Retry when connectivity returns.',
      );
    }
  }

  if (!detail) return <p role={message.includes('unavailable') ? 'alert' : undefined}>{message}</p>;
  const claim = detail.claim;
  const canCommit =
    claim.claimStatus === 'confirmed' &&
    claim.nextReviewAt !== null &&
    detail.queueItem?.recommendedAction === 'mark_stale';

  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href="/admin/rechecks/">
        ← Rechecks queue
      </a>
      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-2xl font-semibold text-ink">{claim.entityName}</h2>
        <p className="mt-2 text-sm text-muted">{claim.locationName ?? claim.entityType}</p>
        <p className="mt-4 text-sm text-muted">
          Status: {claim.claimStatus} · Visibility: {claim.visibility}
        </p>
        <p className="mt-2 text-sm text-muted">
          Review deadline: {claim.nextReviewAt ?? 'Missing'}
        </p>
        <h3 className="mt-5 text-lg font-semibold text-ink">How to pay</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{claim.howToPay ?? 'Not recorded'}</p>
      </section>
      {canCommit ? (
        <form
          className="mt-6 rounded-card border border-border bg-surface p-5 shadow-sm"
          onSubmit={submit}
        >
          <h2 className="text-xl font-semibold text-ink">Mark Claim stale</h2>
          <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
            Public summary
            <textarea
              name="publicSummary"
              className="min-h-24 rounded-control border border-border bg-white p-3 font-normal"
              defaultValue="The review window expired before reconfirmation."
            />
          </label>
          <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
            Internal note
            <textarea
              name="internalNote"
              className="min-h-24 rounded-control border border-border bg-white p-3 font-normal"
            />
          </label>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button type="submit">Mark Claim stale</Button>
            {message ? (
              <p aria-live="polite" className="text-sm text-muted">
                {message}
              </p>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="mt-6">No stale transition is available for this Claim.</p>
      )}
    </div>
  );
}
