declare module 'node:crypto' {
  export interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: 'hex'): string;
  }

  export function createHash(algorithm: string): Hash;
}

declare module 'node:fs/promises' {
  export function mkdir(
    path: string | URL,
    options?: { recursive?: boolean },
  ): Promise<string | undefined>;

  export function writeFile(
    file: string | URL,
    data: string | Uint8Array,
    encoding?: string,
  ): Promise<void>;
}
