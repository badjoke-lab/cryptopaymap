import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
await copyFile(
  new URL('../config/staging-review/_headers', import.meta.url),
  new URL('_headers', dist),
);
await writeFile(new URL('robots.txt', dist), 'User-agent: *\nDisallow: /\n');
await writeFile(
  new URL('staging-review.json', dist),
  `${JSON.stringify(
    {
      environment: 'staging-review',
      syntheticData: true,
      indexingAllowed: false,
    },
    null,
    2,
  )}\n`,
);

console.log('Prepared staging review artifact with global noindex headers and robots exclusion.');
