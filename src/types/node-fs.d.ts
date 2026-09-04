declare module 'node:fs' {
  export const promises: {
    readFile(path: string | URL, encoding: 'utf8'): Promise<string>;
    writeFile(path: string | URL, data: string, encoding: 'utf8'): Promise<void>;
  };
}
