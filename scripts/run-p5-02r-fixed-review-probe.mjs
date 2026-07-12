import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { p502rSyntheticSuggestRequest } from './p5-02r-synthetic-suggest-fixture.mjs';

const defaultBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const baseUrl = new URL(process.env.CPM_P5_02R_REVIEW_URL ?? defaultBaseUrl);
const requestId = randomUUID();
const publicArtifactPaths = ['/data/manifest.json', '/version.json'];

function chromeExecutable() {
  return (
    process.env.CPM_P5_02R_CHROME_PATH ??
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome')
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function browserChallengeToken() {
  const profile = mkdtempSync(join(tmpdir(), 'cpm-p5-02r-chrome-'));
  const browser = spawn(
    chromeExecutable(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  try {
    const browserWebSocketUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('browser_start_timeout')), 15_000);
      browser.stderr.setEncoding('utf8');
      browser.stderr.on('data', (chunk) => {
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(chunk);
        if (match?.[1]) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      browser.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error('browser_start_failed'));
      });
    });
    const browserEndpoint = new URL(browserWebSocketUrl);
    const targetResponse = await fetch(
      `http://${browserEndpoint.host}/json/new?${encodeURIComponent(new URL('/suggest', baseUrl))}`,
      { method: 'PUT' },
    );
    if (!targetResponse.ok) throw new Error('browser_target_failed');
    const target = await targetResponse.json();
    if (typeof target.webSocketDebuggerUrl !== 'string') {
      throw new Error('browser_target_invalid');
    }

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    let commandId = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (typeof message.id !== 'number') return;
      const handler = pending.get(message.id);
      if (handler) {
        pending.delete(message.id);
        handler(message);
      }
    });
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('browser_socket_failed')), {
        once: true,
      });
    });

    const evaluate = (expression) =>
      new Promise((resolve, reject) => {
        const id = ++commandId;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error('browser_command_timeout'));
        }, 5_000);
        pending.set(id, (message) => {
          clearTimeout(timeout);
          if (message.error) reject(new Error('browser_command_failed'));
          else resolve(message.result);
        });
        socket.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true },
          }),
        );
      });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const result = await evaluate(
        `document.querySelector('input[name="cf-turnstile-response"]')?.value ?? ''`,
      );
      const token = result?.result?.value;
      if (typeof token === 'string' && token.length > 0) {
        socket.close();
        return token;
      }
      await wait(250);
    }
    socket.close();
    throw new Error('browser_challenge_timeout');
  } finally {
    if (browser.exitCode === null) {
      const exited = new Promise((resolve) => browser.once('exit', resolve));
      browser.kill('SIGTERM');
      await Promise.race([exited, wait(5_000)]);
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readPublicArtifacts() {
  return Object.fromEntries(
    await Promise.all(
      publicArtifactPaths.map(async (path) => {
        const response = await fetch(new URL(path, baseUrl), { cache: 'no-store' });
        if (!response.ok) throw new Error(`public_artifact_${response.status}`);
        return [path, sha256(Buffer.from(await response.arrayBuffer()))];
      }),
    ),
  );
}

async function post(body) {
  const response = await fetch(new URL('/api/suggest', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': requestId,
    },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Only response-shape booleans are reported below.
  }
  return { status: response.status, payload };
}

function isReceipt(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.submissionReference === 'string' &&
    typeof value.statusSecret === 'string' &&
    typeof value.submittedAt === 'string' &&
    Object.keys(value).length === 3
  );
}

const artifactsBefore = await readPublicArtifacts();
const challengeToken = await browserChallengeToken();
const originalBody = p502rSyntheticSuggestRequest(challengeToken, 'P5-02R automated review probe');
const first = await post(originalBody);
const firstReceiptValid = first.status === 202 && isReceipt(first.payload);

if (!firstReceiptValid) {
  const artifactsAfter = await readPublicArtifacts();
  const publicArtifactsUnchanged = Object.fromEntries(
    publicArtifactPaths.map((path) => [path, artifactsBefore[path] === artifactsAfter[path]]),
  );
  console.log(
    JSON.stringify(
      {
        status: 'failed',
        failedStage: 'first_post',
        firstPost: { httpStatus: first.status, receiptShapeMatches: false },
        publicArtifactsUnchanged,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const replay = await post(originalBody);
const changed = await post(
  p502rSyntheticSuggestRequest(
    challengeToken,
    'P5-02R automated review probe changed-content check',
  ),
);
const artifactsAfter = await readPublicArtifacts();

const replayReceiptValid = replay.status === 202 && isReceipt(replay.payload);
const replayReferenceMatches =
  firstReceiptValid &&
  replayReceiptValid &&
  first.payload.submissionReference === replay.payload.submissionReference;
const replayStatusSecretMatches =
  firstReceiptValid &&
  replayReceiptValid &&
  first.payload.statusSecret === replay.payload.statusSecret;
const conflictShapeMatches =
  changed.status === 409 &&
  changed.payload !== null &&
  typeof changed.payload === 'object' &&
  changed.payload.error === 'suggest_request_conflict' &&
  Object.keys(changed.payload).length === 1;
const publicArtifactsUnchanged = Object.fromEntries(
  publicArtifactPaths.map((path) => [path, artifactsBefore[path] === artifactsAfter[path]]),
);

const result = {
  status: 'complete',
  firstPost: { httpStatus: first.status, receiptShapeMatches: firstReceiptValid },
  exactReplay: {
    httpStatus: replay.status,
    receiptShapeMatches: replayReceiptValid,
    publicReferenceMatches: replayReferenceMatches,
    statusSecretMatches: replayStatusSecretMatches,
  },
  changedContent: { httpStatus: changed.status, conflictShapeMatches },
  publicArtifactsUnchanged,
};

console.log(JSON.stringify(result, null, 2));

if (
  !firstReceiptValid ||
  !replayReceiptValid ||
  !replayReferenceMatches ||
  !replayStatusSecretMatches ||
  !conflictShapeMatches ||
  Object.values(publicArtifactsUnchanged).includes(false)
) {
  process.exitCode = 1;
}
