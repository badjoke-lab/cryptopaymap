import {
  ExportPublicationError,
  type ActiveExportReleasePointer,
  type ActiveExportReleaseState,
  type ExportPublicationPlan,
  type ExportPublicationTarget,
} from './publication-contract';

export interface InMemoryExportPublicationOptions {
  activePointer?: ActiveExportReleasePointer;
  failObjectKey?: string;
  failActivation?: boolean;
}

export class InMemoryExportPublicationTarget implements ExportPublicationTarget {
  private pointer: ActiveExportReleaseState | null;
  private readonly objects = new Map<string, string>();
  private readonly failObjectKey: string | undefined;
  private readonly failActivation: boolean;
  readonly events: string[] = [];

  constructor(options: InMemoryExportPublicationOptions = {}) {
    this.pointer = options.activePointer
      ? { pointer: structuredClone(options.activePointer), versionToken: 'version-1' }
      : null;
    this.failObjectKey = options.failObjectKey;
    this.failActivation = options.failActivation ?? false;
  }

  async readActivePointer(): Promise<ActiveExportReleaseState | null> {
    this.events.push('read_pointer');
    return this.pointer === null ? null : structuredClone(this.pointer);
  }

  async stageRelease(plan: ExportPublicationPlan): Promise<void> {
    for (const object of plan.objects) {
      this.events.push(`stage:${object.objectKey}`);
      if (object.objectKey === this.failObjectKey) {
        throw new ExportPublicationError(
          'target_failure',
          'The in-memory release target rejected an object.',
          [object.objectKey],
        );
      }
      const existing = this.objects.get(object.objectKey);
      if (existing !== undefined && existing !== object.body) {
        throw new ExportPublicationError(
          'target_failure',
          'An immutable in-memory release object changed.',
          [object.objectKey],
        );
      }
      this.objects.set(object.objectKey, object.body);
    }
  }

  async activateRelease(
    pointer: ActiveExportReleasePointer,
    expectedVersionToken: string | null,
  ): Promise<void> {
    this.events.push('activate_pointer');
    if (this.failActivation) {
      throw new ExportPublicationError(
        'target_failure',
        'The in-memory active pointer update failed.',
      );
    }
    const actualVersion = this.pointer?.versionToken ?? null;
    if (actualVersion !== expectedVersionToken) {
      throw new ExportPublicationError(
        'pointer_conflict',
        'The in-memory active pointer changed during activation.',
      );
    }
    const nextVersion = `version-${Number(actualVersion?.split('-')[1] ?? '0') + 1}`;
    this.pointer = { pointer: structuredClone(pointer), versionToken: nextVersion };
  }

  snapshot() {
    return {
      pointer: this.pointer === null ? null : structuredClone(this.pointer),
      objects: [...this.objects.entries()].map(([key, body]) => ({ key, body })),
      events: [...this.events],
    };
  }
}
