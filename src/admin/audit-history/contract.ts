import { z } from 'zod';

export const auditHistoryDomainValues = [
  'candidate',
  'evidence',
  'reconfirmation',
  'media',
  'export',
] as const;

export const auditHistorySourceKindValues = [
  'candidate_duplicate_decision',
  'candidate_promotion',
  'evidence_review_decision',
  'reconfirmation_expiration',
  'media_review_decision',
  'export_release_decision',
  'export_activation',
  'export_restore_execution',
] as const;

export const auditHistoryTargetTypeValues = [
  'source_candidate',
  'duplicate_group',
  'acceptance_claim',
  'evidence',
  'media_asset',
  'export_snapshot',
] as const;

const sourceKindDomain = {
  candidate_duplicate_decision: 'candidate',
  candidate_promotion: 'candidate',
  evidence_review_decision: 'evidence',
  reconfirmation_expiration: 'reconfirmation',
  media_review_decision: 'media',
  export_release_decision: 'export',
  export_activation: 'export',
  export_restore_execution: 'export',
} as const satisfies Record<
  (typeof auditHistorySourceKindValues)[number],
  (typeof auditHistoryDomainValues)[number]
>;

const identifierSchema = z.string().trim().min(1).max(512);
const snakeCaseSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);

export const auditHistoryReadContextSchema = z
  .object({
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    capabilities: z.array(z.literal('audit:read')).min(1),
  })
  .strict();

export const auditHistoryQuerySchema = z
  .object({
    domain: z.enum(auditHistoryDomainValues).optional(),
    actorId: z.string().trim().min(1).max(200).optional(),
    targetType: z.enum(auditHistoryTargetTypeValues).optional(),
    targetId: identifierSchema.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
    beforeId: identifierSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.before === undefined) !== (query.beforeId === undefined)) {
      context.addIssue({
        code: 'custom',
        path: query.before === undefined ? ['before'] : ['beforeId'],
        message: 'Audit pagination requires both before and beforeId.',
      });
    }
    if (query.from !== undefined && query.to !== undefined && Date.parse(query.from) > Date.parse(query.to)) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Audit history from must not be later than to.',
      });
    }
    if (query.targetId !== undefined && query.targetType === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['targetType'],
        message: 'Audit targetId requires targetType.',
      });
    }
  });

export const auditHistoryTargetSchema = z
  .object({
    type: z.enum(auditHistoryTargetTypeValues),
    id: identifierSchema,
  })
  .strict();

export const auditHistoryTransitionSchema = z
  .object({
    fromState: z.string().trim().min(1).max(96).nullable(),
    toState: z.string().trim().min(1).max(96).nullable(),
  })
  .strict()
  .superRefine((transition, context) => {
    if (transition.fromState === null && transition.toState === null) {
      context.addIssue({
        code: 'custom',
        path: ['toState'],
        message: 'An audit transition requires a source or destination state.',
      });
    }
  });

export const auditHistoryItemSchema = z
  .object({
    id: identifierSchema,
    occurredAt: z.iso.datetime({ offset: true }),
    domain: z.enum(auditHistoryDomainValues),
    sourceKind: z.enum(auditHistorySourceKindValues),
    action: snakeCaseSchema,
    actorId: z.string().trim().min(1).max(200),
    actorType: z.enum(['human', 'system']),
    requestId: z.uuid().nullable(),
    target: auditHistoryTargetSchema,
    secondaryTargets: z.array(auditHistoryTargetSchema).max(20),
    reasonCode: snakeCaseSchema.nullable(),
    summary: z.string().trim().min(1).max(1_000).nullable(),
    transition: auditHistoryTransitionSchema.nullable(),
    sourceRecordId: identifierSchema,
  })
  .strict()
  .superRefine((item, context) => {
    if (sourceKindDomain[item.sourceKind] !== item.domain) {
      context.addIssue({
        code: 'custom',
        path: ['domain'],
        message: 'Audit sourceKind does not belong to the declared domain.',
      });
    }
  });

export const auditHistoryResponseSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    query: auditHistoryQuerySchema,
    items: z.array(auditHistoryItemSchema).max(100),
    hasMore: z.boolean(),
  })
  .strict();

export type AuditHistoryReadContext = z.infer<typeof auditHistoryReadContextSchema>;
export type AuditHistoryQuery = z.infer<typeof auditHistoryQuerySchema>;
export type AuditHistoryTarget = z.infer<typeof auditHistoryTargetSchema>;
export type AuditHistoryItem = z.infer<typeof auditHistoryItemSchema>;
export type AuditHistoryResponse = z.infer<typeof auditHistoryResponseSchema>;

export interface AuditHistoryBackend {
  loadAuditHistory(query: AuditHistoryQuery): Promise<{ items: AuditHistoryItem[]; hasMore: boolean }>;
}
