import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const challengeOrigin = 'https://challenges.cloudflare.com';

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function parseJsonText(text) {
  try {
    return { parsed: true, value: JSON.parse(text) };
  } catch {
    return { parsed: false, value: null };
  }
}

function summarizeConfigResponse(status, parsedBody, expectedSiteKey, expectedAction) {
  const value = parsedBody.value;
  const objectValue = value !== null && typeof value === 'object' ? value : null;
  return {
    httpStatus: status,
    jsonParsed: parsedBody.parsed,
    siteKeyMatches: objectValue?.siteKey === expectedSiteKey,
    actionMatches: objectValue?.action === expectedAction,
  };
}

function summarizeReadinessResponse(status, parsedBody) {
  const value = parsedBody.value;
  const objectValue = value !== null && typeof value === 'object' ? value : null;
  return {
    httpStatus: status,
    jsonParsed: parsedBody.parsed,
    ready: objectValue?.ready === true,
    errorCode: typeof objectValue?.error === 'string' ? objectValue.error.slice(0, 64) : null,
  };
}

function parseCsp(headerValue) {
  const directives = new Map();
  for (const rawDirective of headerValue.split(';')) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
    const [name, ...values] = parts;
    if (name) directives.set(name.toLowerCase(), values);
  }
  return directives;
}

function summarizeCsp(status, headerValue) {
  const directives = parseCsp(headerValue);
  return {
    httpStatus: status,
    headerPresent: headerValue.length > 0,
    scriptSrcAllowsChallenge: directives.get('script-src')?.includes(challengeOrigin) ?? false,
    frameSrcAllowsChallenge: directives.get('frame-src')?.includes(challengeOrigin) ?? false,
  };
}

export class ConfiguredSuggestReviewVerificationError extends Error {
  constructor(diagnostic) {
    super(`Configured Suggest review verification failed at ${diagnostic.stage}.`);
    this.name = 'ConfiguredSuggestReviewVerificationError';
    this.diagnostic = diagnostic;
  }
}

export async function verifyConfiguredSuggestReview({
  baseUrl,
  readinessToken,
  expectedSiteKey,
  expectedAction,
  attempts = 18,
  delayMs = 5_000,
  fetchImpl = fetch,
}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const diagnostic = {
    status: 'failure',
    stage: 'endpoints',
    baseUrl: normalizedBaseUrl,
    attemptsCompleted: 0,
    config: null,
    readiness: null,
    csp: null,
    networkError: null,
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    diagnostic.attemptsCompleted = attempt;
    diagnostic.networkError = null;

    try {
      const [configResponse, readinessResponse] = await Promise.all([
        fetchImpl(`${normalizedBaseUrl}/api/suggest/config`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          redirect: 'follow',
        }),
        fetchImpl(`${normalizedBaseUrl}/api/suggest/readiness`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${readinessToken}`,
          },
          cache: 'no-store',
          redirect: 'follow',
        }),
      ]);

      const [configText, readinessText] = await Promise.all([
        configResponse.text(),
        readinessResponse.text(),
      ]);
      diagnostic.config = summarizeConfigResponse(
        configResponse.status,
        parseJsonText(configText),
        expectedSiteKey,
        expectedAction,
      );
      diagnostic.readiness = summarizeReadinessResponse(
        readinessResponse.status,
        parseJsonText(readinessText),
      );

      const endpointsReady =
        diagnostic.config.httpStatus === 200 && diagnostic.readiness.httpStatus === 200;
      const payloadsValid =
        diagnostic.config.jsonParsed &&
        diagnostic.config.siteKeyMatches &&
        diagnostic.config.actionMatches &&
        diagnostic.readiness.jsonParsed &&
        diagnostic.readiness.ready;

      if (endpointsReady && payloadsValid) {
        diagnostic.stage = 'csp';
        const suggestResponse = await fetchImpl(`${normalizedBaseUrl}/suggest`, {
          method: 'GET',
          cache: 'no-store',
          redirect: 'follow',
        });
        diagnostic.csp = summarizeCsp(
          suggestResponse.status,
          suggestResponse.headers.get('content-security-policy') ?? '',
        );

        if (
          diagnostic.csp.httpStatus >= 200 &&
          diagnostic.csp.httpStatus < 400 &&
          diagnostic.csp.headerPresent &&
          diagnostic.csp.scriptSrcAllowsChallenge &&
          diagnostic.csp.frameSrcAllowsChallenge
        ) {
          diagnostic.status = 'success';
          diagnostic.stage = 'complete';
          return Object.freeze(diagnostic);
        }
      } else {
        diagnostic.stage = endpointsReady ? 'payloads' : 'endpoints';
      }
    } catch (error) {
      diagnostic.stage = 'network';
      diagnostic.networkError = error instanceof Error ? error.name.slice(0, 64) : 'UnknownError';
    }

    if (attempt < attempts) await sleep(delayMs);
  }

  throw new ConfiguredSuggestReviewVerificationError(Object.freeze(diagnostic));
}

async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error('Diagnostic output path is required.');

  const baseUrl = process.env.CPM_REVIEW_BASE_URL;
  const readinessToken = process.env.CPM_SUGGEST_READINESS_TOKEN;
  const expectedSiteKey = process.env.CPM_EXPECTED_TURNSTILE_SITE_KEY;
  const expectedAction = process.env.CPM_EXPECTED_TURNSTILE_ACTION;
  if (!baseUrl || !readinessToken || !expectedSiteKey || !expectedAction) {
    throw new Error('Configured review verifier environment is incomplete.');
  }

  try {
    const diagnostic = await verifyConfiguredSuggestReview({
      baseUrl,
      readinessToken,
      expectedSiteKey,
      expectedAction,
    });
    writeFileSync(outputPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
    console.log('Configured Suggest review verification passed.');
  } catch (error) {
    const diagnostic =
      error instanceof ConfiguredSuggestReviewVerificationError
        ? error.diagnostic
        : {
            status: 'failure',
            stage: 'internal',
            baseUrl,
            attemptsCompleted: 0,
          };
    writeFileSync(outputPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
    console.error(`Configured Suggest review verification failed at ${diagnostic.stage}.`);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  await main();
}
