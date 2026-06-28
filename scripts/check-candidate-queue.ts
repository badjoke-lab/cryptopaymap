import {
  authorizeCandidateQueueRead,
  readCandidateQueueAuthorizationPolicy,
} from '../src/admin/candidates/authorization';
import {
  decodeCandidateQueueCursor,
  encodeCandidateQueueCursor,
  loadCandidateQueue,
  parseCandidateQueueQuery,
  type CandidateQueueBackend,
} from '../src/admin/candidates/queue';

const policy = readCandidateQueueAuthorizationPolicy({
  CPM_ADMIN_CANDIDATE_SUBJECTS: JSON.stringify(['runtime-reviewer']),
});
const context = authorizeCandidateQueueRead(
  {
    actorId: 'cloudflare-access:runtime-reviewer',
    actorType: 'human',
    subject: 'runtime-reviewer',
    email: 'runtime-reviewer@example.com',
  },
  policy,
);
const cursor = {
  priority: 900,
  lastSeenAt: '2026-06-27T00:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000001',
};
if (
  JSON.stringify(decodeCandidateQueueCursor(encodeCandidateQueueCursor(cursor))) !==
  JSON.stringify(cursor)
) {
  throw new Error('Candidate queue cursor round-trip failed.');
}

const query = parseCandidateQueueQuery(
  new URL('https://example.test/admin/api/candidates?status=new,triaged&priority=high&limit=10'),
);
const backend: CandidateQueueBackend = {
  async loadPage() {
    return { items: [], hasNextPage: false, nextCursor: null };
  },
};
const page = await loadCandidateQueue(
  context,
  backend,
  query,
  new Date('2026-06-28T12:00:00.000Z'),
);
if (page.items.length !== 0 || page.hasNextPage || page.nextCursor !== null) {
  throw new Error('Candidate queue runtime page validation failed.');
}

let backendCalled = false;
try {
  await loadCandidateQueue(
    { ...context, capabilities: [] },
    {
      async loadPage() {
        backendCalled = true;
        return backend.loadPage(query, new Date());
      },
    },
    query,
  );
  throw new Error('Unauthorized Candidate queue request was accepted.');
} catch (error) {
  if (backendCalled) {
    throw new Error('Unauthorized Candidate queue request reached the backend.', { cause: error });
  }
}

console.log('Candidate queue checks passed.');
