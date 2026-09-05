declare const process: { exitCode?: number };

const PAGE_URL = 'https://orders.sheetz.com/findASheetz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

async function text(url: string, referer?: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': UA,
      ...(referer ? { referer } : {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function contexts(body: string, needle: string, radius = 1600): string[] {
  const result: string[] = [];
  let start = 0;
  while (result.length < 8) {
    const index = body.indexOf(needle, start);
    if (index < 0) break;
    result.push(body.slice(Math.max(0, index - radius), Math.min(body.length, index + needle.length + radius)));
    start = index + needle.length;
  }
  return result;
}

async function main(): Promise<void> {
  const html = await text(PAGE_URL);
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value, PAGE_URL).toString());
  const mainUrl = scripts.find((url) => /\/static\/js\/main\.[^/?]+\.js/i.test(url));
  if (!mainUrl) throw new Error(`No main bundle found: ${JSON.stringify(scripts)}`);
  const bundle = await text(mainUrl, PAGE_URL);
  const needles = [
    '/stores/getOperatingStates',
    '/stores/search',
    'baseURL',
    'axios.create',
    'REACT_APP',
    'anybff',
  ];
  const output = Object.fromEntries(needles.map((needle) => [needle, contexts(bundle, needle)]));
  const absoluteUrls = [...new Set(bundle.match(/https:\/\/[^"'`\\\s<>]{1,240}/g) ?? [])]
    .filter((url) => /sheetz|api|bff|store/i.test(url))
    .slice(0, 120);
  console.log(JSON.stringify({
    pageUrl: PAGE_URL,
    mainUrl,
    bundleBytes: bundle.length,
    contexts: output,
    absoluteUrls,
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
