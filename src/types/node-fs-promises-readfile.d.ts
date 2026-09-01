import 'node:fs/promises';

declare module 'node:fs/promises' {
  export function readFile(
    path: string | URL,
    options: string,
  ): Promise<string>;
}
