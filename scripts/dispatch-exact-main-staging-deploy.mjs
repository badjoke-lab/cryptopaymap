import { execFileSync } from 'node:child_process';

const dispatcherRef = 'refs/heads/agent/ops-p6-001h-exact-main-dispatch';
if (
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_EVENT_NAME === 'push' &&
  process.env.GITHUB_REF === dispatcherRef
) {
  const expectedMain = '781f69a3d5cb4910da222e5764b22f55b903d576';
  const currentMain = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)[0];
  if (currentMain !== expectedMain) {
    throw new Error(`Exact main moved before staging deploy dispatch: ${currentMain}`);
  }
  execFileSync(
    'gh',
    [
      'workflow',
      'run',
      'staging-review-deploy.yml',
      '--repo',
      'badjoke-lab/cryptopaymap',
      '--ref',
      'main',
    ],
    { stdio: 'inherit', env: process.env },
  );
  console.log(`Exact-main staging deploy dispatched for ${expectedMain}.`);
}
