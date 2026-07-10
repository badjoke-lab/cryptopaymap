import {
  createSubmissionTurnstileConfigurationFromEnvironment,
  SubmissionTurnstileConfigurationError,
} from '../src/submissions/turnstile-environment';

const configuration = createSubmissionTurnstileConfigurationFromEnvironment(
  {
    CPM_TURNSTILE_SECRET_KEY: 'runtime-server-secret',
    PUBLIC_TURNSTILE_SITE_KEY: 'runtime-public-site-key',
    CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.example.test',
    CPM_TURNSTILE_EXPECTED_ACTION: 'submission_intake',
  },
  {
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: 'review.example.test',
          action: 'submission_intake',
        }),
        { status: 200 },
      )) as typeof fetch,
  },
);

if (
  configuration.client.siteKey !== 'runtime-public-site-key' ||
  configuration.client.action !== 'submission_intake' ||
  configuration.expectedHostname !== 'review.example.test'
) {
  throw new Error('Submission Turnstile environment check produced invalid client configuration.');
}

const decision = await configuration.verifier.verify({
  requestId: '20000000-0000-4000-8000-000000000001',
  token: 'turnstile-token',
  remoteIp: null,
});
if (decision.outcome !== 'allow') {
  throw new Error('Submission Turnstile environment check failed to compose the verifier.');
}

try {
  createSubmissionTurnstileConfigurationFromEnvironment({
    CPM_TURNSTILE_SECRET_KEY: 'runtime-server-secret',
    PUBLIC_TURNSTILE_SITE_KEY: 'runtime-public-site-key',
    CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.example.test',
    CPM_TURNSTILE_EXPECTED_ACTION: 'invalid action',
  });
  throw new Error('Expected invalid Turnstile configuration to fail.');
} catch (error) {
  if (!(error instanceof SubmissionTurnstileConfigurationError)) throw error;
}

console.log('Submission Turnstile environment checks passed.');
