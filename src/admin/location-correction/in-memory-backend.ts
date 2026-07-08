import type { CanonicalLocationInput } from '../../schemas/canonical-identity';
import {
  applyLocationCorrectionChanges,
  changedLocationCorrectionFields,
  LocationCorrectionDecisionError,
  type LocationCorrectionDecisionBackend,
  type LocationCorrectionDecisionCommand,
  type LocationCorrectionDecisionReceipt,
  type PracticalLocationCorrectionField,
} from './decision';

export interface InMemoryCorrectionLocation {
  id: string;
  updatedAt: string;
  value: CanonicalLocationInput;
}

export interface InMemoryCorrectionProvenanceRow {
  locationId: string;
  fieldPath: PracticalLocationCorrectionField;
  sourceRecordId: string;
  provenanceRole: 'correction';
  effectiveFrom: string;
}

export interface InMemoryCorrectionDiffRow {
  fieldPath: PracticalLocationCorrectionField;
  beforeValue: unknown;
  afterValue: unknown;
}

export interface InMemoryCorrectionDecisionRecord {
  requestId: string;
  locationId: string;
  actorId: string;
  actorType: 'human' | 'system';
  expectedLocationUpdatedAt: string;
  decidedAt: string;
  reasonCode: string;
  publicSummary: string | null;
  internalNote: string | null;
  sourceRecordIds: string[];
  diff: InMemoryCorrectionDiffRow[];
  requestFingerprint: string;
  receipt: LocationCorrectionDecisionReceipt;
}

export interface InMemoryLocationCorrectionBackendOptions {
  locations?: InMemoryCorrectionLocation[];
  sourceRecordIds?: string[];
  failBeforeCommit?: (command: LocationCorrectionDecisionCommand) => boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function valueAt(location: CanonicalLocationInput, field: PracticalLocationCorrectionField): unknown {
  return (location as unknown as Record<string, unknown>)[field];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class InMemoryLocationCorrectionBackend implements LocationCorrectionDecisionBackend {
  private readonly locations = new Map<string, InMemoryCorrectionLocation>();
  private readonly sourceRecordIds: Set<string>;
  private readonly decisions = new Map<string, InMemoryCorrectionDecisionRecord>();
  private readonly provenanceRows: InMemoryCorrectionProvenanceRow[] = [];
  private readonly failBeforeCommit: (command: LocationCorrectionDecisionCommand) => boolean;

  constructor(options: InMemoryLocationCorrectionBackendOptions = {}) {
    for (const location of options.locations ?? []) {
      this.locations.set(location.id, clone(location));
    }
    this.sourceRecordIds = new Set(options.sourceRecordIds ?? []);
    this.failBeforeCommit = options.failBeforeCommit ?? (() => false);
  }

  async commitCorrection(
    command: LocationCorrectionDecisionCommand,
  ): Promise<LocationCorrectionDecisionReceipt> {
    const existing = this.decisions.get(command.requestId);
    if (existing !== undefined) {
      if (existing.requestFingerprint !== command.requestFingerprint) {
        throw new LocationCorrectionDecisionError(
          'conflict',
          'The correction request ID was reused with different content.',
        );
      }
      return { ...clone(existing.receipt), state: 'replayed' };
    }

    const current = this.locations.get(command.locationId);
    if (current === undefined) {
      throw new LocationCorrectionDecisionError('not_found', 'The canonical Location was not found.');
    }
    if (Date.parse(current.updatedAt) !== command.expectedLocationUpdatedAt.getTime()) {
      throw new LocationCorrectionDecisionError(
        'conflict',
        'The canonical Location changed after the correction was reviewed.',
      );
    }

    for (const sourceRecordId of command.sourceRecordIds) {
      if (!this.sourceRecordIds.has(sourceRecordId)) {
        throw new LocationCorrectionDecisionError(
          'conflict',
          'The correction references an unavailable source record.',
        );
      }
    }

    const after = applyLocationCorrectionChanges(current.value, command.changes);
    const appliedFieldPaths = changedLocationCorrectionFields(command.changes);
    const diff = appliedFieldPaths.map((fieldPath) => ({
      fieldPath,
      beforeValue: clone(valueAt(current.value, fieldPath)),
      afterValue: clone(valueAt(after, fieldPath)),
    }));
    const noOp = diff.find((row) => sameValue(row.beforeValue, row.afterValue));
    if (noOp !== undefined) {
      throw new LocationCorrectionDecisionError(
        'invalid_decision',
        `The ${noOp.fieldPath} correction does not change the canonical value.`,
      );
    }

    const provenanceRows = command.provenanceAssignments.flatMap((assignment) =>
      assignment.sourceRecordIds.map(
        (sourceRecordId): InMemoryCorrectionProvenanceRow => ({
          locationId: command.locationId,
          fieldPath: assignment.fieldPath,
          sourceRecordId,
          provenanceRole: 'correction',
          effectiveFrom: command.decidedAt.toISOString(),
        }),
      ),
    );

    if (this.failBeforeCommit(command)) {
      throw new Error('Injected Location correction failure before atomic commit.');
    }

    const updatedAt = command.decidedAt.toISOString();
    const receipt: LocationCorrectionDecisionReceipt = {
      requestId: command.requestId,
      locationId: command.locationId,
      appliedFieldPaths,
      decidedAt: command.decidedAt.toISOString(),
      updatedAt,
      state: 'committed',
    };

    this.locations.set(command.locationId, {
      id: current.id,
      updatedAt,
      value: clone(after),
    });
    this.provenanceRows.push(...clone(provenanceRows));
    this.decisions.set(command.requestId, {
      requestId: command.requestId,
      locationId: command.locationId,
      actorId: command.actorId,
      actorType: command.actorType,
      expectedLocationUpdatedAt: command.expectedLocationUpdatedAt.toISOString(),
      decidedAt: command.decidedAt.toISOString(),
      reasonCode: command.reasonCode,
      publicSummary: command.publicSummary,
      internalNote: command.internalNote,
      sourceRecordIds: [...command.sourceRecordIds],
      diff: clone(diff),
      requestFingerprint: command.requestFingerprint,
      receipt: clone(receipt),
    });

    return clone(receipt);
  }

  snapshot() {
    return {
      locations: [...this.locations.values()].map(clone),
      provenanceRows: this.provenanceRows.map(clone),
      decisions: [...this.decisions.values()].map(clone),
    };
  }
}
