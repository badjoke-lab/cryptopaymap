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
  description: 'Description',
  openingHours: 'Opening hours',
  amenities: 'Amenities',
  socialLinks: 'Social links',
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

const fields = {
  newEntity: ['name', 'legalName', 'websiteUrl', 'countryCode'],
  existingEntity: ['name', 'websiteUrl', 'countryCode'],
  newLocation: [
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
    'description',
    'openingHours',
    'amenities',
    'socialLinks',
    'osmType',
    'osmId',
  ],
  existingLocation: [
    'name',
    'addressLine',
    'locality',
    'region',
    'postalCode',
    'countryCode',
    'latitude',
    'longitude',
    'websiteUrl',
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

function descriptor(
  subjectKey: string,
  group: string,
  fieldPath: string,
): PromotionFieldDescriptor {
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
    ...fields.newEntity.map((field) => descriptor('entity', 'Entity', field)),
    ...(physical
      ? fields.newLocation.map((field) => descriptor('location', 'Location', field))
      : []),
    ...fields.claim.map((field) => descriptor('claim', 'Claim', field)),
    ...assetKeys.flatMap((key, index) =>
      fields.asset.map((field) => descriptor(`asset:${key}`, `Asset ${index + 1}`, field)),
    ),
  ];
}

export function existingTargetFieldDescriptors(
  physical: boolean,
  assetKeys: readonly string[],
): PromotionFieldDescriptor[] {
  return [
    ...fields.existingEntity.map((field) => descriptor('entity', 'Existing Entity', field)),
    ...(physical
      ? fields.existingLocation.map((field) => descriptor('location', 'Existing Location', field))
      : []),
    ...fields.claim.map((field) => descriptor('claim', 'New Claim', field)),
    ...assetKeys.flatMap((key, index) =>
      fields.asset.map((field) => descriptor(`asset:${key}`, `New Asset ${index + 1}`, field)),
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
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : [],
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

export interface FieldPlanResult {
  assignments: PromotionProvenanceAssignment[];
  missingFields: string[];
}

interface AssignmentOptions {
  selections: PromotionFieldSourceSelections;
  subjectType: PromotionProvenanceAssignment['subjectType'];
  subjectKey: string;
  draft: SubjectDraft;
  fieldPaths: readonly string[];
  provenanceRole: PromotionProvenanceAssignment['provenanceRole'];
  required: boolean;
}

function fieldAssignments(options: AssignmentOptions): FieldPlanResult {
  const assignments: PromotionProvenanceAssignment[] = [];
  const missingFields: string[] = [];
  for (const fieldPath of options.fieldPaths) {
    const fieldValue = options.draft.value[fieldPath];
    if (fieldValue === null || fieldValue === undefined) continue;
    const key = `${options.subjectKey}.${fieldPath}`;
    const sourceRecordIds = [...new Set(options.selections[key] ?? [])].sort();
    if (sourceRecordIds.length === 0) {
      if (options.required) missingFields.push(fieldLabels[fieldPath] ?? fieldPath);
      continue;
    }
    assignments.push({
      subjectType: options.subjectType,
      subjectId: options.draft.id,
      fieldPath,
      sourceRecordIds,
      provenanceRole: options.provenanceRole,
    });
  }
  return { assignments, missingFields };
}

function combine(parts: readonly FieldPlanResult[]): FieldPlanResult {
  return {
    assignments: parts.flatMap((part) => part.assignments),
    missingFields: [...new Set(parts.flatMap((part) => part.missingFields))],
  };
}

export interface NewTargetFieldPlanInput {
  selections: PromotionFieldSourceSelections;
  entity: SubjectDraft;
  location: SubjectDraft | null;
  claim: SubjectDraft;
  claimAssets: readonly AssetDraft[];
}

export function buildNewTargetFieldProvenancePlan(input: NewTargetFieldPlanInput): FieldPlanResult {
  return combine([
    fieldAssignments({
      selections: input.selections,
      subjectType: 'entity',
      subjectKey: 'entity',
      draft: input.entity,
      fieldPaths: fields.newEntity,
      provenanceRole: 'origin',
      required: true,
    }),
    ...(input.location === null
      ? []
      : [
          fieldAssignments({
            selections: input.selections,
            subjectType: 'location',
            subjectKey: 'location',
            draft: input.location,
            fieldPaths: fields.newLocation,
            provenanceRole: 'origin',
            required: true,
          }),
        ]),
    fieldAssignments({
      selections: input.selections,
      subjectType: 'acceptance_claim',
      subjectKey: 'claim',
      draft: input.claim,
      fieldPaths: fields.claim,
      provenanceRole: 'origin',
      required: true,
    }),
    ...input.claimAssets.map((asset) =>
      fieldAssignments({
        selections: input.selections,
        subjectType: 'claim_asset',
        subjectKey: `asset:${asset.selectionKey}`,
        draft: asset,
        fieldPaths: fields.asset,
        provenanceRole: 'origin',
        required: true,
      }),
    ),
  ]);
}

export interface ExistingTargetFieldPlanInput {
  selections: PromotionFieldSourceSelections;
  entity: SubjectDraft;
  location: SubjectDraft | null;
  claim: SubjectDraft;
  claimAssets: readonly AssetDraft[];
}

export function buildExistingTargetFieldProvenancePlan(
  input: ExistingTargetFieldPlanInput,
): FieldPlanResult {
  const result = combine([
    fieldAssignments({
      selections: input.selections,
      subjectType: 'entity',
      subjectKey: 'entity',
      draft: input.entity,
      fieldPaths: fields.existingEntity,
      provenanceRole: 'attribution',
      required: false,
    }),
    ...(input.location === null
      ? []
      : [
          fieldAssignments({
            selections: input.selections,
            subjectType: 'location',
            subjectKey: 'location',
            draft: input.location,
            fieldPaths: fields.existingLocation,
            provenanceRole: 'attribution',
            required: false,
          }),
        ]),
    fieldAssignments({
      selections: input.selections,
      subjectType: 'acceptance_claim',
      subjectKey: 'claim',
      draft: input.claim,
      fieldPaths: fields.claim,
      provenanceRole: 'origin',
      required: true,
    }),
    ...input.claimAssets.map((asset) =>
      fieldAssignments({
        selections: input.selections,
        subjectType: 'claim_asset',
        subjectKey: `asset:${asset.selectionKey}`,
        draft: asset,
        fieldPaths: fields.asset,
        provenanceRole: 'origin',
        required: true,
      }),
    ),
  ]);
  const hasIdentityAttribution = result.assignments.some(
    (assignment) =>
      (assignment.subjectType === 'entity' || assignment.subjectType === 'location') &&
      assignment.provenanceRole === 'attribution',
  );
  return {
    assignments: result.assignments,
    missingFields: hasIdentityAttribution
      ? result.missingFields
      : ['Existing identity attribution', ...result.missingFields],
  };
}
