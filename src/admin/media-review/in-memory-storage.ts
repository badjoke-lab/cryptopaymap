import type {
  InspectedMediaStorageObject,
  MediaStorageAdapter,
  MediaStorageExpectation,
} from './storage-contract';

export interface InMemoryMediaStorageOptions {
  privateObjects?: InspectedMediaStorageObject[];
  publicObjects?: InspectedMediaStorageObject[];
  failPublishKeys?: ReadonlySet<string>;
  failRevokeKeys?: ReadonlySet<string>;
}

export class InMemoryMediaStorage implements MediaStorageAdapter {
  private readonly privateObjects = new Map<string, InspectedMediaStorageObject>();
  private readonly publicObjects = new Map<string, InspectedMediaStorageObject>();
  private readonly failPublishKeys: ReadonlySet<string>;
  private readonly failRevokeKeys: ReadonlySet<string>;

  constructor(options: InMemoryMediaStorageOptions = {}) {
    for (const object of options.privateObjects ?? []) {
      this.privateObjects.set(object.key, structuredClone(object));
    }
    for (const object of options.publicObjects ?? []) {
      this.publicObjects.set(object.key, structuredClone(object));
    }
    this.failPublishKeys = options.failPublishKeys ?? new Set();
    this.failRevokeKeys = options.failRevokeKeys ?? new Set();
  }

  async inspectPrivateObject(key: string): Promise<InspectedMediaStorageObject | null> {
    return structuredClone(this.privateObjects.get(key) ?? null);
  }

  async publishObject(sourceKey: string, destination: MediaStorageExpectation): Promise<void> {
    if (this.failPublishKeys.has(destination.key)) throw new Error('Injected publish failure.');
    const source = this.privateObjects.get(sourceKey);
    if (source === undefined) throw new Error('Private source is missing.');
    this.publicObjects.set(destination.key, {
      ...destination,
      byteSize: source.byteSize,
    });
  }

  async revokePublicObject(key: string): Promise<void> {
    if (this.failRevokeKeys.has(key)) throw new Error('Injected revoke failure.');
    this.publicObjects.delete(key);
  }

  snapshot() {
    return {
      privateObjects: [...this.privateObjects.values()]
        .map((object) => structuredClone(object))
        .sort((left, right) => left.key.localeCompare(right.key)),
      publicObjects: [...this.publicObjects.values()]
        .map((object) => structuredClone(object))
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
  }
}
