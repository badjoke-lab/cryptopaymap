import { createAbuseControlledSubmissionIntakeService } from '../src/submissions/abuse-controlled-intake';
import { createInMemorySubmissionRateLimiter } from '../src/submissions/rate-limit';

const events: string[] = [];
const service = createAbuseControlledSubmissionIntakeService({
  rateLimiter: createInMemorySubmissionRateLimiter({ limit: 5, windowMs: 60_000 }),
  challengeVerifier: {
    async verify() {
      events.push('challenge');
      return { outcome: 'allow', reasonCode: 'challenge_verified' };
    },
  },
  intake: {
    async submit() {
      events.push('intake');
      return {
        state: 'committed',
        publicId: 'CPM-S-2026-000001',
        statusSecret: `cpmss_${'A'.repeat(43)}`,
        submittedAt: '2026-07-09T12:00:00.000Z',
      };
    },
  },
});

const receipt = await service.submit({
  requestId: '20000000-0000-4000-8000-000000000001',
  challengeToken: 'turnstile-token',
  rateLimitKey: 'rl_abcdefghijklmnop',
  remoteIp: null,
  rawInput: { submissionType: 'suggest' },
  receivedAt: new Date('2026-07-09T12:00:00.000Z'),
});

if (receipt.publicId !== 'CPM-S-2026-000001' || events.join(',') !== 'challenge,intake') {
  throw new Error('Submission abuse-control contract check produced an invalid result.');
}

console.log('Submission abuse-control contract checks passed.');
