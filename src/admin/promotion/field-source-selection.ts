import type { PromotionProvenanceAssignment } from './provenance-plan';

export interface PromotionFieldDescriptor {
  key: string;
  label: string;
}

export type PromotionFieldSourceSelections = Record<string, string[]>;

const fieldLabels: Record<string, string> = {
  name: 'Name',
  legalName: 'Legal name',
  websiteUrl: 'Website',
  countryCode: 'Country code',
  addressLine: 'Address',
  locality: 'Locality',
  region: 'Region',
  postalCode: 'Postal code',
  latitude: 'Latitude',
  longitude: 'Longitude',
  phone: 'Phone',
  osmType: 'OSM type',
  osmId: 'OSM ID',
  routeType: 'Route type',
  acceptanceScope: 'Acceptance scope',
  customerPaysCrypto: 'Customer pays crypto',
  merchantExplicitlyAcceptsCrypto: 'Merchant explicitly accepts crypto',
  processorId: 'Processor',
  howToPay: 'How to pay',
  merchantReceives: 'Merchant receives',
  restrictions: 'Restrictions',
  assetId: 'Asset',
  networkId: 'Network',
  paymentMethodId: 'Payment method',
  contractAddress: 'Contract address',
  notes: 'Notes',
};

const newTargetFields = {
  entity: ['name', 'legalName', 'websiteUrl', 'countryCode'],
  location: [
    'name',
    'addressLine',
    'locality',
    'region',
    'postalCode',
    'countryCode',
    'latitude',
    'longitude',
    'websiteUrl',
    'phone',
    'osmType',
    'osmId',
  ],
  claim: [
    'routeType',
    'acceptanceScope',
    'customerPaysCrypto',
    'merchantExplicitlyAcceptsCrypto',
    'processorId',
    'howToPay',
    'merchantReceives',
    'restrictions',
  ],
  asset: ['assetId', 'networkId', 'paymentMethodId', 'contractAddress', 'notes'],
} as const;

function descriptor(subjectKey: string, group: string, fieldPath: string): PromotionFieldDescriptor {
  return {
    key: `${subjectKey}.${fieldPath}`,
    label: `${group}: ${fieldLabels[fieldPath] ?? fieldPath}`,
  };
}

export function newTargetFieldDescriptors(
  physical: boolean,
  assetKeys: readonly string[],
): PromotionFieldDescriptor[] {
  return [
    ...newTargetFields.entity.map((field) => descriptor('entity', 'Entity', field)),
    ...(physical
      ? newTargetFields.location.map((field) => descriptor('location', 'Location', field))
      : []),
    ...newTargetFields.claim.map((field) => descriptor('claim', 'Claim', field)),
    ...assetKeys.flatMap((key, index) =>
      newTargetFields.asset.map((field) => descriptor(`asset:${key}`, `Asset ${index + 1}`, field)),
    ),
  ];
}

export function parseFieldSourceSelections(raw: FormDataEntryValue | null) {
  if (typeof raw !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
      ]),
    ) satisfies PromotionFieldSourceSelections;
  } catch {
    return {};
  }
}

interface SubjectDraft {
  id: string;
  value: Record<string, unknown>;
}

interface AssetDraft extends SubjectDraft {
  selectionKey: string;
}

export interface NewTargetFieldPlanInput {
  selections: PromotionFieldSourceSelections;
  entity: SubjectDraft;
  location: SubjectDraft | null;
  claim: SubjectDraft;
  claimAssets: readonly AssetDraft[];
}

export interface NewTargetFieldPlanResult {
  assignments: PromotionProvenanceAssignment[];
  missingFields: string[];
}

function fieldAssignments(
  selections: PromotionFieldSourceSelections,
  subjectType: PromotionProvenanceAssignment['subjectType'],
  subjectKey: string,
  draft: SubjectDraft,
  fields: readonly string[],
): NewTargetFieldPlanResult {
  const assignments: PromotionProvenanceAssignment[] = [];
  const missingFields: string[] = [];
  for (const fieldPath of fields) {
    const fieldValue = draft.value[fieldPath];
    if (fieldValue === null || fieldValue === undefined) continue;
    const key = `${subjectKey}.${fieldPath}`;
    const sourceRecordIds = [...new Set(selections[key] ?? [])].sort();
    if (sourceRecordIds.length === 0) {
      missingFields.push(fieldLabels[fieldPath] ?? fieldPath);
      continue;
    }
    assignments.push({
      subjectType,
      subjectId: draft.id,
      fieldPath,
      sourceRecordIds,
      provenanceRole: 'origin',
    });
  }
  return { assignments, missingFields };
}

export function buildNewTargetFieldProvenancePlan(
  input: NewTargetFieldPlanInput,
): NewTargetFieldPlanResult {
  const parts = [
    fieldAssignments(input.selections, 'entity', 'entity', input.entity, newTargetFields.entity),
    fieldAssignments(input.selections, 'acceptance_claim', 'claim', input.claim, newTargetFields.claim),
    ...(input.location === null
      ? []
      : [
          fieldAssignments(
            input.selections,
            'location',
            'location',
            input.location,
            newTargetFields.location,
          ),
        ]),
    ...input.claimAssets.map((asset) =>
      fieldAssignments(
        input.selections,
        'claim_asset',
        `asset:${asset.selectionKey}`,
        asset,
        newTargetFields.asset,
      ),
    ),
  ];
  return {
    assignments: parts.flatMap((part) => part.assignments),
    missingFields: [...new Set(parts.flatMap((part) => part.missingFields))],
  };
}
