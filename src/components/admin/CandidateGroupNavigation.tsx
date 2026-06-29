import { useEffect, useState } from 'react';
import { candidateDetailResponseSchema } from '../../admin/candidates/detail';

export function CandidateGroupNavigation() {
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    const candidateId = new URLSearchParams(window.location.search).get('id');
    if (!candidateId) return;
    const controller = new AbortController();
    void fetch(`/admin/api/candidates/${encodeURIComponent(candidateId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = candidateDetailResponseSchema.safeParse(await response.json());
        if (parsed.success) setGroupId(parsed.data.candidate.duplicateGroupId);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!groupId) return null;
  return (
    <a
      className="inline-flex min-h-11 items-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700"
      href={`/admin/candidates/duplicates/?group=${encodeURIComponent(groupId)}`}
    >
      Review duplicate group
    </a>
  );
}
