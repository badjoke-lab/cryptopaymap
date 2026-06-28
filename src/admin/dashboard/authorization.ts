import { z } from 'zod';
import type { AdminAccessIdentity } from '../access/identity';
import type { AdminDashboardContext } from './summary';

const dashboardSubjectSchema = z.string().trim().min(1).max(200);
const dashboardSubjectsSchema = z.array(dashboardSubjectSchema).min(1).max(50).superRefine((subjects, context) => {
  if (new Set(subjects).size !== subjects.length) {
    context.addIssue({
      code: 'custom',
      message: 'Dashboard subject identifiers must be unique.',
    });
  }
});

export interface AdminDashboardAuthorizationEnvironment {
  CPM_ADMIN_DASHBOARD_SUBJECTS?: string;
  [key: string]: unknown;
}

export interface AdminDashboardAuthorizationPolicy {
  subjects: ReadonlySet<string>;
}

export type AdminDashboardAuthorizationErrorCode = 'configuration' | 'denied';

export class AdminDashboardAuthorizationError extends Error {
  readonly code: AdminDashboardAuthorizationErrorCode;

  constructor(code: AdminDashboardAuthorizationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AdminDashboardAuthorizationError';
    this.code = code;
  }
}

export function readAdminDashboardAuthorizationPolicy(
  environment: AdminDashboardAuthorizationEnvironment,
): AdminDashboardAuthorizationPolicy {
  const serialized = environment.CPM_ADMIN_DASHBOARD_SUBJECTS;
  if (typeof serialized !== 'string' || serialized.trim() === '') {
    throw new AdminDashboardAuthorizationError(
      'configuration',
      'Administration dashboard authorization is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new AdminDashboardAuthorizationError(
      'configuration',
      'Administration dashboard authorization is invalid.',
      { cause: error },
    );
  }

  const result = dashboardSubjectsSchema.safeParse(parsed);
  if (!result.success) {
    throw new AdminDashboardAuthorizationError(
      'configuration',
      'Administration dashboard authorization is invalid.',
    );
  }

  return { subjects: new Set(result.data) };
}

export function authorizeAdminDashboardRead(
  identity: AdminAccessIdentity,
  policy: AdminDashboardAuthorizationPolicy,
): AdminDashboardContext {
  if (!policy.subjects.has(identity.subject)) {
    throw new AdminDashboardAuthorizationError(
      'denied',
      'The verified administration identity is not authorized for dashboard access.',
    );
  }

  return {
    actorId: identity.actorId,
    actorType: identity.actorType,
    capabilities: ['dashboard:read'],
  };
}
